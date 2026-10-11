"""Real upload/queue/worker/job routes. Use run_phase2b1.py, never direct discovery."""
import asyncio
from contextlib import ExitStack
from decimal import Decimal
import hashlib
import json
import time
from uuid import UUID

from testing_modules.pre_uat.support import C, EvidenceCase, SyntheticWorkbook, case
from testing_modules.pre_uat.integration_environment import ACTIVE

if not ACTIVE.get("verified"):
    raise RuntimeError("Owned disposable Redis proof is required before test import")

from fastapi import FastAPI
import httpx
from app.api.routes.upload import router as upload_router
from app.api.routes.jobs import router as jobs_router
from app.workers import worker
from app.services import job_queue


class IntegrationPreUAT(EvidenceCase):
    async def asyncSetUp(self):
        await super().asyncSetUp()
        self.tasks, self.jobs, self.transitions = [], [], {}
        self.queue = job_queue
        self.original_update = worker.update_job

        async def observe_update(job_id, updates):
            await self.original_update(job_id, updates)
            persisted = await job_queue.get_job(job_id)
            self.transitions.setdefault(job_id, []).append(persisted["status"])

        worker.update_job = observe_update  # observe real persisted states; no result/status mock
        app = FastAPI()
        app.include_router(upload_router)
        app.include_router(jobs_router, prefix="/jobs")
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://pre-uat.local")
        self.assertEqual(job_queue.redis_client.info("server")["run_id"],ACTIVE["redis_run_id"])
        self.assertEqual(job_queue.redis_client.llen(job_queue.JOB_QUEUE_KEY),0)

    async def asyncTearDown(self):
        try:
            for task in self.tasks: task.cancel()
            await asyncio.wait_for(asyncio.gather(*self.tasks,return_exceptions=True),5)
            # Cancellation cannot stop an already running to_thread(BRPOP).
            # Let its fixed one-second Redis timeout drain before the next case.
            await asyncio.sleep(1.5)
            worker.update_job = self.original_update
            await self.client.aclose()
            client = job_queue.redis_client
            for job_id in self.jobs:
                client.lrem(job_queue.JOB_QUEUE_KEY,0,job_id)
                client.delete(job_queue._get_job_key(job_id))
            for path in ACTIVE["upload_folder"].iterdir():
                if path.is_file(): path.unlink()
            self.assertEqual(client.llen(job_queue.JOB_QUEUE_KEY),0)
            self.assertEqual(client.dbsize(),0)
            self.note("case cleanup","empty owned Redis and temporary uploads",{"queue_depth":0,"keys":0})
        finally:
            worker.update_job = self.original_update

    def start_workers(self):
        self.tasks = [asyncio.create_task(worker.start_worker(i)) for i in range(2)]

    async def submit(self, fixture, filename):
        response = await self.client.post("/upload",files={"file":(filename,fixture.path.read_bytes(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        self.assertEqual(response.status_code,202)
        body = response.json()
        self.assertEqual(body["status"],"queued")
        self.assertEqual(str(UUID(body["job_id"])),body["job_id"])
        self.jobs.append(body["job_id"])
        snapshot = await self.fetch(body["job_id"])
        self.assertEqual(snapshot["status"],"queued")
        self.assertIsNone(snapshot["result"])
        self.assertIsNone(snapshot["error"])
        self.note("accepted and persisted queued","202, unique UUID, queued with no stale result",body)
        return body["job_id"]

    async def fetch(self, job_id):
        response = await self.client.get("/jobs/"+job_id)
        self.assertEqual(response.status_code,200)
        body = response.json()
        self.assertEqual(body["job_id"],job_id)
        return body

    async def terminal(self, job_id):
        deadline, observed = time.monotonic()+15, []
        while time.monotonic() < deadline:
            body = await self.fetch(job_id)
            if not observed or body["status"] != observed[-1]: observed.append(body["status"])
            self.assertIn(body["status"],{"queued","running","completed","failed"})
            if body["status"] in {"completed","failed"}:
                self.assertEqual(self.transitions[job_id],["running",body["status"]])
                self.note("lifecycle "+job_id,"queued then persisted running then terminal",{"http_observed":observed,"worker_persisted":self.transitions[job_id],"terminal":body["status"]})
                return body
            await asyncio.sleep(0.025)
        self.fail("Job did not reach terminal state within 15 seconds")

    def fixture_identity(self, fixture, code):
        with fixture.edit() as wb:
            wb[C.SheetNames.SETUP]["D3"] = code
            for s in range(fixture.students):
                for title,row in [(C.SheetNames.DIRECT_CLO,C.DirectCloSheet.DATA_START_ROW+s),(C.SheetNames.INDIRECT_CLO,C.IndirectCloSheet.DATA_START_ROW+s)]:
                    wb[title].cell(row,1,f"{code}-{s+1:03d}")

    def assert_results(self, body, fixture, code):
        self.assertEqual(body["status"],"completed")
        self.assertIsNone(body["error"])
        loaded = body["result"]["loaded"]
        self.assertEqual(loaded["header"]["course_code"],code)
        self.assertEqual(loaded["header"]["no_of_students"],fixture.students)
        rows = loaded["attainments"]
        expected_pairs = {(f"{code}-{s+1:03d}",f"CLO{c+1}") for s in range(fixture.students) for c in range(fixture.clos)}
        self.assertEqual(len(rows),len(expected_pairs))
        pairs = [(r["student_id"],r["clo_code"]) for r in rows]
        self.assertEqual(set(pairs),expected_pairs)
        self.assertEqual(len(set(pairs)),len(pairs))
        for row in rows:
            s,c = int(row["student_id"].rsplit("-",1)[1])-1,int(row["clo_code"][3:])-1
            direct,rating = fixture.values(s,c)
            # Independent decimal arithmetic on written synthetic values.
            indirect = Decimal(str(rating))/Decimal(5)*100
            composite = round(Decimal("0.7")*Decimal(str(direct))*100+Decimal("0.3")*indirect,2)
            self.assertAlmostEqual(row["direct_clo_attainment_pct"],direct)
            self.assertEqual(row["indirect_clo_attainment_pct"],float(indirect))
            self.assertEqual(row["composite_clo_attainment_pct"],float(composite))
            self.assertEqual(row["met_threshold"],composite>=70)
            self.assertTrue(row["is_record_complete"])
        projection = [{k:r[k] for k in ("student_id","clo_code","direct_clo_attainment_pct","indirect_clo_attainment_pct","composite_clo_attainment_pct","met_threshold")} for r in rows]
        self.note("completed result "+body["job_id"],{"course":code,"unique_pairs":len(expected_pairs)}, {"course":loaded["header"]["course_code"],"records":projection})
        return hashlib.sha256(json.dumps(body["result"],sort_keys=True).encode()).hexdigest()

    @case("IT-007","Real ETL job lifecycle","Valid and malformed synthetic XLSX; real routes, Redis, worker and ETL","Both uploads accepted/queued; valid reaches completed with accurate unique records; malformed reaches failed with private structured error and null result")
    async def test_it007_lifecycle(self):
        with SyntheticWorkbook(students=3,clos=2,scenario="uniform") as valid, SyntheticWorkbook(students=2,clos=2) as invalid:
            self.fixture_identity(valid,"IT007-VALID")
            with invalid.edit() as wb:
                wb[C.SheetNames.DIRECT_CLO].cell(C.DirectCloSheet.DATA_START_ROW,C.DirectCloSheet.FIRST_BLOCK_START_COL,"private invalid numeric content")
            valid_id = await self.submit(valid,"it007_valid.xlsx")
            invalid_id = await self.submit(invalid,"it007_malformed.xlsx")
            self.assertNotEqual(valid_id,invalid_id)
            self.start_workers()
            good,bad = await asyncio.gather(self.terminal(valid_id),self.terminal(invalid_id))
            fingerprint = self.assert_results(good,valid,"IT007-VALID")
            self.assertEqual(bad["status"],"failed")
            self.assertIsNone(bad["result"])
            error = bad["error"]
            self.assertEqual(error["error_type"],"WorkbookValidationError")
            self.assertEqual(error["details"]["field"],"prelim_score")
            self.assertEqual(error["details"]["sheet_name"],C.SheetNames.DIRECT_CLO)
            self.assertEqual(set(error["details"]),{"sheet_name","cell","field","reason"})
            for secret in ("private invalid numeric content","Synthetic Person","SYN-000"):
                self.assertNotIn(secret,json.dumps(error))
            self.note("malformed terminal","failed/private error/no result",{"job_id":invalid_id,"status":bad["status"],"result":None,"error":error})
            self.assertEqual(fingerprint,hashlib.sha256(json.dumps((await self.fetch(valid_id))["result"],sort_keys=True).encode()).hexdigest())
            self.assertIsNone((await self.fetch(invalid_id))["result"])
            self.assertEqual((await self.client.get("/jobs/"+"00000000-0000-0000-0000-000000000000")).status_code,404)

    @case("IT-009","Concurrent job isolation","Three distinct synthetic scenarios submitted concurrently; two workers","Three unique UUIDs and paths, every job completed, scenario-specific outputs without duplicate records or cross-job overwrites")
    async def test_it009_concurrency(self):
        with ExitStack() as stack:
            fixtures = [stack.enter_context(SyntheticWorkbook(students=n,clos=c,scenario=kind)) for n,c,kind in [(2,2,"worst"),(3,3,"mixed"),(4,2,"ideal")]]
            codes = ["IT009-WORST","IT009-MIXED","IT009-IDEAL"]
            for fixture,code in zip(fixtures,codes): self.fixture_identity(fixture,code)
            ids = await asyncio.gather(*(self.submit(fixture,code+".xlsx") for fixture,code in zip(fixtures,codes)))
            self.assertEqual(len(set(ids)),3)
            paths = [(await self.fetch(job_id))["payload"]["file_path"] for job_id in ids]
            self.assertEqual(len(set(paths)),3)
            self.start_workers()
            bodies = await asyncio.gather(*(self.terminal(job_id) for job_id in ids))
            fingerprints = [self.assert_results(body,fixture,code) for body,fixture,code in zip(bodies,fixtures,codes)]
            self.assertEqual(len(set(fingerprints)),3)
            pairsets = [{(r["student_id"],r["clo_code"]) for r in body["result"]["loaded"]["attainments"]} for body in bodies]
            for i in range(3):
                for j in range(i): self.assertFalse(pairsets[i]&pairsets[j])
            for job_id,fingerprint in zip(ids,fingerprints):
                self.assertEqual(fingerprint,hashlib.sha256(json.dumps((await self.fetch(job_id))["result"],sort_keys=True).encode()).hexdigest())
            self.note("concurrent isolation","3 completed distinct results; concurrency=3, workers=2",{"job_ids":ids,"result_fingerprints":fingerprints,"cross_job_pairs":0,"distinct_upload_paths":3})
