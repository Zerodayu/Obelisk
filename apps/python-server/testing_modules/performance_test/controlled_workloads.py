"""Five approved fixed workloads; no queue-saturation or live-provider mode."""
import asyncio
from decimal import Decimal
import hashlib
import json
import math
import statistics
import time
from uuid import UUID

import httpx
from testing_modules.pre_uat.integration_environment import ACTIVE, PrerequisiteBlocked


def stats(values):
    if not values: return {'count':0,'mean_seconds':None,'p95_seconds':None,'maximum_seconds':None}
    ordered = sorted(values)
    return {'count':len(values),'mean_seconds':statistics.mean(values),
            'p95_seconds':ordered[math.ceil(.95*len(ordered))-1],'maximum_seconds':max(values)}

def verify_etl(body, fixture):
    assert body['status'] == 'completed' and body['error'] is None, 'ETL terminal state not completed'
    loaded = body['result']['loaded']; rows = loaded['attainments']
    assert loaded['header']['course_code'] == 'SYN-101' and loaded['header']['no_of_students'] == 30
    expected = {(f'SYN-{s+1:04d}',f'CLO{c+1}') for s in range(30) for c in range(5)}
    assert len(rows)==150 and {(r['student_id'],r['clo_code']) for r in rows}==expected, 'Record identities/count mismatch'
    for r in rows:
        s,c = int(r['student_id'].split('-')[-1])-1,int(r['clo_code'][3:])-1
        direct,rating = fixture.values(s,c)
        indirect = Decimal(str(rating))/Decimal(5)*100
        composite = round(Decimal(str(direct))*70+indirect*Decimal('.3'),2)
        assert abs(r['direct_clo_attainment_pct']-direct)<1e-9
        assert r['indirect_clo_attainment_pct']==float(indirect) and r['composite_clo_attainment_pct']==float(composite)
        assert r['met_threshold']==(composite>=70)
        assert r['is_record_complete'] and r['rule1_met'] and r['section_completeness_pct']==1
        expected_level = 'Exceptional' if composite>=85 else 'Proficient' if composite>=70 else 'Basic' if composite>=60 else 'Below Basic'
        assert r['clo_level']==expected_level and r['formula_version']=='70_30_v1'
    # Evidence contains anonymous ordinal identities only.
    projection = [{'student':int(r['student_id'].split('-')[-1]),'clo':r['clo_code'],
                   'direct':r['direct_clo_attainment_pct'],'indirect':r['indirect_clo_attainment_pct'],
                   'composite':r['composite_clo_attainment_pct']} for r in rows]
    return loaded, hashlib.sha256(json.dumps(projection,sort_keys=True).encode()).hexdigest()


class Workloads:
    def __init__(self, client, fixture, check_guard):
        self.client,self.fixture,self.guard = client,fixture,check_guard
        self.bytes = fixture.path.read_bytes()
        self.http = []; self.all_jobs = []; self.loaded = None

    async def request(self, method, path, **kwargs):
        self.guard()
        start = time.perf_counter()
        try:
            response = await self.client.request(method,path,**kwargs)
        except httpx.HTTPError as exc:
            self.http.append({'method':method,'path':path,'start':start,'latency_seconds':time.perf_counter()-start,'status':None,'error':type(exc).__name__})
            raise
        latency=time.perf_counter()-start
        response.extensions['pre_uat_latency']=latency
        self.http.append({'method':method,'path':path,'start':start,'latency_seconds':latency,'status':response.status_code})
        return response

    async def upload_batch(self, count, concurrency, paced=False):
        records = []; watchers=[]; start = time.perf_counter(); self.guard()
        assert ACTIVE['client'].llen(ACTIVE['queue_prefix']+'job_queue')==0
        semaphore = asyncio.Semaphore(concurrency)
        async def watch(record):
            deadline=record['accepted_at']+120
            while time.perf_counter()<deadline:
                response=await self.request('GET','/jobs/'+record['job_id'])
                assert response.status_code==200
                body=response.json(); assert body['job_id']==record['job_id']
                assert body['status'] in {'queued','running','completed','failed'}
                if body['status'] in {'completed','failed'}:
                    record.update(terminal_state=body['status'],terminal_observed=time.perf_counter())
                    if body['status']=='completed':
                        self.loaded,record['anonymized_result_hash']=verify_etl(body,self.fixture)
                        record['independently_checked_records']=150
                    else: record['error_type']=(body.get('error') or {}).get('error_type')
                    return
                await asyncio.sleep(.1)
        async def submit(i):
            async with semaphore:
                dispatched = time.perf_counter()
                r = await self.request('POST','/upload',files={'file':('synthetic.xlsx',self.bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
                record = {'sequence':i,'dispatch':dispatched,'accepted_at':time.perf_counter(),'http_status':r.status_code}
                records.append(record)
                if r.status_code==202:
                    body = r.json(); assert body['status']=='queued'
                    job_id = body['job_id']; assert str(UUID(job_id))==job_id
                    record['job_id'] = job_id; self.all_jobs.append(job_id)
                    watchers.append(asyncio.create_task(watch(record)))
        if paced:
            # Sequential dispatch enforces <=2 in flight and >=2s between starts.
            for i in range(count):
                if i: await asyncio.sleep(max(0,records[-1]['dispatch']+2-time.perf_counter()))
                if time.perf_counter()-start>=120: break
                await submit(i)
        else:
            await asyncio.gather(*(submit(i) for i in range(count)))
        submission_end = time.perf_counter()
        accepted_ids=[r['job_id'] for r in records if 'job_id' in r]
        assert len(set(accepted_ids))==len(accepted_ids), 'Duplicate accepted job IDs'
        await asyncio.wait_for(asyncio.gather(*watchers),timeout=120)
        pending={r['job_id']:r for r in records if 'job_id' in r and 'terminal_state' not in r}
        end = time.perf_counter()
        # Server-persisted timestamps are read only from the fresh owned Redis.
        for record in records:
            if record.get('terminal_state')=='completed':
                saved = json.loads(ACTIVE['client'].get(ACTIVE['queue_prefix']+'job:'+record['job_id']))
                record['server_updated_at'] = saved['updated_at']
        completed = sum(r.get('terminal_state')=='completed' for r in records)
        accepted = sum('job_id' in r for r in records)
        failed = sum(r.get('terminal_state')=='failed' for r in records)
        result = {'requests':len(records),'concurrency_limit':concurrency,'paced':paced,
            'accepted':accepted,'completed':completed,'failed':failed,'rejected':len(records)-accepted,'unfinished':len(pending),
            'http_error_rate':sum(r['http_status']>=400 for r in records)/len(records),
            'submission_seconds':submission_end-start,'observation_window_seconds':end-start,
            'acceptance_throughput_per_second':accepted/(submission_end-start),
            'completed_throughput_per_second_observed':completed/(end-start),
            'acceptance_latency':stats([r['accepted_at']-r['dispatch'] for r in records if 'job_id' in r]),
            'completion_latency_poll_observed':stats([r['terminal_observed']-r['dispatch'] for r in records if r.get('terminal_state')=='completed']),
            'drain_observation_seconds':end-submission_end,'final_queue_depth':ACTIVE['client'].llen(ACTIVE['queue_prefix']+'job_queue'),
            'records':records}
        return result

    async def pt004(self):
        batches = []
        for concurrency in (1,2,4): batches.append(await self.upload_batch(20,concurrency))
        return {'batches':batches}

    async def pt005(self):
        # Sequential includes terminal completion before dispatching the next job.
        return {'batches':[await self.upload_batch(1,1) for _ in range(10)]}

    async def pt007(self):
        return {'batches':[await self.upload_batch(60,2,paced=True)],'scope':'short stability exercise; not long-duration soak'}

    async def pt006(self):
        from testing_modules.pre_uat.support import valid_recommendation, validate_recommendation
        job_id = self.all_jobs[-1]
        ownership = (await self.request('GET','/__pre_uat/ownership')).json()
        before = ownership['mock_calls']; latencies=[]; responses=[]
        for _ in range(20):
            r = await self.request('GET','/analytics/jobs/'+job_id+'/recommendation')
            latencies.append(self.http[-1]['latency_seconds']); assert r.status_code==200
            body = r.json(); assert body['status']=='ok' and body['course_code']=='SYN-101' and body['gaps']
            actual = validate_recommendation(body['recommendation'])
            assert actual==valid_recommendation('Review the measured synthetic CLO gaps.')
            assert 'Synthetic Person' not in body['prompt_used'] and 'SYN-00' not in body['prompt_used']
            responses.append(actual)
        after = (await self.request('GET','/__pre_uat/ownership')).json()['mock_calls']
        assert after-before==20, 'AI shortcut or unexpected provider calls'
        return {'requests':20,'concurrency_limit':1,'http_errors':0,'mock_provider_calls':20,
                'latency':stats(latencies),'throughput_per_second':20/sum(latencies),
                'measurement_scope':'mocked Python AI request path, zero artificial provider delay; not live Gemini',
                'valid_recommendation':responses[0],'job_counts':None}

    def analytics_payload(self):
        loaded = self.loaded; assert loaded is not None
        header = {**loaded['header'],'instructor_name':None}
        rows = [{**r,'student_id':None,'student_name':'Student '+str(i//5+1)} for i,r in enumerate(loaded['attainments'])]
        mapping = [{'clo_code':f'CLO{c+1}','plo_code':'PLO1','correlation_strength':3} for c in range(5)]
        return {'period':{'type':'semester','label':'Synthetic Pre-UAT'},'submissions':[
            {'department':'Synthetic Department','program':'Synthetic Program','avp_group':'Synthetic AVP',
             'course_code':'SYN-101','section':f'Synthetic {s}','header':header,'attainments':rows,'clo_plo_mapping':mapping} for s in (1,2)]}

    def verify_analytics(self, actual):
        means = {}
        for c in range(5):
            values=[]
            for s in range(30):
                direct,rating=self.fixture.values(s,c)
                values.append(round(Decimal(str(direct))*70+Decimal(str(rating))/5*100*Decimal('.3'),2)/100)
            means[f'CLO{c+1}'] = float(sum(values)/30)
        for level,key in [('department_summary','Synthetic Department'),('program_summary','Synthetic Program'),('avp_group_summary','Synthetic AVP')]:
            group=actual[level][key]; assert group['total_attainment_records']==300 and set(group['clos'])==set(means)
            for clo,expected in means.items():
                item=group['clos'][clo]
                assert abs(item['mean_attainment_pct']-expected)<1e-9 and item['record_count']==60 and item['rule1_met'] is True
            plo=group['plos']['PLO1']
            expected_mean=sum(means.values())/5
            assert abs(plo['plo_attainment_direct_only']-expected_mean)<1e-9
            assert plo['plo_completeness_pct']==1 and plo['plo_rule3_met'] is True
            assert len(plo['mapped_clos'])==5
            if level=='program_summary': assert abs(group['program_plo_average']-expected_mean)<1e-9
        assert len(actual['worst_performing_clos'])==5
        for item in actual['worst_performing_clos']:
            assert abs(item['mean_attainment_pct']-means[item['clo_code']])<1e-9 and item['record_count']==60
        return means

    async def pt009(self):
        payload=self.analytics_payload(); batches=[]
        for concurrency in (1,2,4):
            for _ in range(3):
                r=await self.request('POST','/analytics/summary',json=payload); assert r.status_code==200
                self.verify_analytics(r.json())
            semaphore=asyncio.Semaphore(concurrency); latencies=[]; begin=time.perf_counter()
            async def one():
                async with semaphore:
                    r=await self.request('POST','/analytics/summary',json=payload)
                    # Capture this request's latency directly (requests can overlap).
                    assert r.status_code==200
                    latencies.append(r.extensions['pre_uat_latency']) if 'pre_uat_latency' in r.extensions else None
                    self.verify_analytics(r.json())
            # Request wrapper supplies per-response latency; no global last-call race.
            await asyncio.gather(*(one() for _ in range(100)))
            elapsed=time.perf_counter()-begin
            batches.append({'requests':100,'warmups_excluded':3,'concurrency_limit':concurrency,
                'http_errors':0,'latency':stats(latencies),'throughput_per_second':100/elapsed,'elapsed_seconds':elapsed})
        return {'batches':batches,'anonymized_payload_sha256':hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest(),
                'independent_clo_mean_expectations':self.verify_analytics(r.json()),'job_counts':None}
