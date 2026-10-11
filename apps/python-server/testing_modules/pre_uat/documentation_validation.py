"""Documentation-only consolidation/checks. No application/test imports or services."""
import ast
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
EVIDENCE=HERE/'evidence'
A='20261011T063734_111127Z'
I='20261011T071933_296064Z'
P='20261011T073848_090587Z'
D='20261011T075026_653371Z'
EXPECTED=[f'UT-{i:03d}' for i in range(1,11)]+['UT-014','IT-007','IT-009']+[f'ST-AI-{i:03d}' for i in range(1,8)]+[f'PT-{i:03d}' for i in range(4,10)]
COUNTS={'PASS':20,'BLOCKED':5,'SKIPPED':1}

def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def write(name, value): (HERE/name).write_text(value.strip()+'\n',encoding='utf-8')
def link(label, path): return f'[{label}]({path})'
def elink(run,name='RESULTS.json',label=None): return link(label or run,f'evidence/{run}/{name}')
def table(headers,rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join('---' for _ in headers)+' |']+['| '+' | '.join(str(x).replace('|','\\|').replace('\n',' ') for x in row)+' |' for row in rows])
def limitation(test_id):
    if test_id.startswith('PT-'):
        return 'Not executed; no benchmark measurements or acceptance decision. '+('Queue saturation deliberately deferred.' if test_id=='PT-008' else 'Owned API startup/ownership blocker; debugging paused. Latest startup-only diagnostic: '+D+'.')
    if test_id.startswith('IT-'): return 'Synthetic real Redis/ETL through in-process ASGI; two explicit workers. Excludes app.main startup, production configuration and webapp persistence/auth/UI.'
    if test_id=='ST-AI-004': return 'Mocked response; every claim within the supported grammar checked against ETL. Other numerical prose flagged for manual review.'
    if test_id=='ST-AI-006': return 'Python advice does not execute approval or change grades. Backend/frontend approval enforcement remains EXTERNAL.'
    if test_id.startswith('ST-AI-') or test_id in {'UT-007','UT-008','UT-009'}: return 'Deterministic mocked AI only; no live Gemini, educational-quality certification or frontend verification.'
    if test_id=='UT-004': return '98 passing subchecks. Extra credit reflects existing implementation compatibility, not independently verified institutional grading policy. Curriculum registry checks EXTERNAL.'
    if test_id=='UT-014': return '150 unique records apply to the designated synthetic 30-student x 5-CLO fixture only.'
    return 'Synthetic fixtures and independent outputs; Python-only scope.'

def authoritative():
    saved=read(EVIDENCE/P/'CONSOLIDATED_RESULTS.json')['rows']
    assert len(saved)==26 and set(r['test_id'] for r in saved)==set(EXPECTED)
    assert dict(Counter(r['status'] for r in saved))==COUNTS
    for row in saved:
        assert (ROOT/row['evidence_path']).is_file()
        original=read(ROOT/row['evidence_path'])
        for key in ('test_id','status','timestamp','executed'):
            assert original[key]==row[key],(row['test_id'],key)
    return sorted(saved,key=lambda r:EXPECTED.index(r['test_id']))

def consolidate():
    rows=authoritative()
    current=list(csv.DictReader((HERE/'PRE_UAT_RESULTS.csv').open(encoding='utf-8-sig')))
    assert len(current)==26 and Counter(r['status'] for r in current)==Counter(COUNTS)
    assert all(next(c for c in current if c['test_id']==r['test_id'])['timestamp']==r['timestamp'] for r in rows)
    originals={p.name:p.read_bytes() for p in HERE.glob('*.md')}
    archive=HERE/'documentation_snapshots'; archive.mkdir(exist_ok=True)
    for name,content in originals.items():
        target=archive/(name+'.txt')
        if not target.exists(): target.write_bytes(content)
        elif target.read_bytes()!=content:
            # Never replace the first historical document snapshot.
            later=archive/'later_snapshots'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
            later.mkdir(parents=True)
            (later/(name+'.txt')).write_bytes(content)
    phase1=(archive/'COVERAGE_AUDIT.md.txt').read_text(encoding='utf-8-sig')
    phase1=phase1[phase1.rfind('## Unit coverage'):]
    old={}
    for line in phase1.splitlines():
        if re.match(r'^\| (UT-|IT-|ST-AI-|PT-)',line):
            parts=[s.strip() for s in line.split('|')[1:-1]]
            test_id=parts[0].split()[0]
            if test_id in EXPECTED and len(parts)>=5: old[test_id]=parts
    counts_table=table(['Category','Total IDs','PASS','FAIL','BLOCKED','SKIPPED'],[
        ['Unit',11,11,0,0,0],['Integration',2,2,0,0,0],['AI System (mocked)',7,7,0,0,0],['Performance',6,0,0,5,1],['Total',26,20,0,5,1]])
    status_note='Current evidence-supported status: **20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED; 26 unique Python-relevant IDs**. No tests or services were executed during this documentation consolidation.'
    trace=[]
    for row in rows:
        test_id=row['test_id']; executed=row['executed']
        path=row['evidence_path'].replace('testing_modules/pre_uat/','').replace('\\','/')
        trace.append([test_id,row['objective'],row['status'],row['timestamp'] if executed else '— not executed',
            f"`{row['script_function']}`",link('per-ID record',path),limitation(test_id)])
    index=table(['ID','Objective','Latest status','Execution timestamp (UTC, original)','Script / function','Evidence','Scope / limitation'],trace)
    fields=['test_id','objective','scenario','expected','actual','status','executed','timestamp','duration_seconds','environment','script_function','command','evidence_path','failures','execution_timestamp','timestamp_kind','limitations','latest_diagnostic_evidence']
    with (HERE/'PRE_UAT_RESULTS.csv').open('w',encoding='utf-8-sig',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields,extrasaction='ignore'); writer.writeheader()
        for row in rows:
            updated=dict(row)
            updated.update(execution_timestamp=row['timestamp'] if row['executed'] else '',timestamp_kind='original executed-test timestamp' if row['executed'] else 'original unexecuted status-record timestamp',limitations=limitation(row['test_id']),latest_diagnostic_evidence=f'testing_modules/pre_uat/evidence/{D}/DIAGNOSTIC_RESULTS.json' if row['status']=='BLOCKED' else '')
            if row['status']=='BLOCKED': updated['actual']='Prepared but workload not executed. Initial API readiness/shutdown proof absent. Later startup-only HTTP 200 rejected for launcher/server PID mismatch; graceful shutdown unverified. Owned-resource cleanup recorded. Debugging paused.'
            if row['test_id']=='PT-008': updated['actual']='SKIPPED: queue saturation deliberately not approved or executed.'
            writer.writerow({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in updated.items()})
    write('EVIDENCE_INDEX.md',f'''# Central evidence index

{status_note}

All paths are relative to this directory unless explicitly prefixed `testing_modules/` (relative to the Python service root). Each ID appears once below. PASS timestamps come directly from the original per-ID artifacts. BLOCKED/SKIPPED artifacts have status-record timestamps; those are not workload execution timestamps. The CSV retains both meanings in separate columns.

{index}

## Shared execution artifacts

- Final deterministic run: {elink(A)}, {elink(A,'ISOLATION.json','isolation')}, {elink(A,'SOURCE_MANIFEST.json','source and reused-method hashes')}, {elink(A,'COMPATIBILITY.json','17-ID compatibility comparison')}.
- Successful integration: {elink(I)}, {elink(I,'ISOLATION.json','ownership/cleanup')}, {elink(I,'SANITIZED_LOGS.json','worker logs')}, {elink(I,'EXECUTION_SUMMARY.json','five-job summary')}.
- Initial performance prerequisite attempt: {elink(P)}, {elink(P,'ISOLATION.json','isolation/cleanup')}, {elink(P,'EXECUTION_SUMMARY.json','zero-workload summary')}.
- Startup-only diagnostic: {elink(D,'DIAGNOSTIC_RESULTS.json','diagnostic result')}, {elink(D,'normal_startup/STARTUP_STAGES.json','startup stages')}, {elink(D,'normal_startup/READINESS_ATTEMPTS.json','readiness attempts')}, {elink(D,'normal_startup/PROCESS_CLEANUP.json','process cleanup')}, {elink(D,'OWNED_PROCESS_EXIT_CHECK.json','both PIDs absent')}, {elink(D,'ISOLATION.json','Redis/temp cleanup')}.

[Testing history](TESTING_HISTORY.md) indexes every timestamped directory, including the inspection-only directory. Source hashes show which source version was inspected or executed; they are not additional test results. Existing logs may contain synthetic fixture identities; they are not real student data. New documentation includes no credentials or real student payloads.
''')
    write('PRE_UAT_RESULTS.md',f'''# OBELISK Python Pre-UAT consolidated results

{status_note}

{counts_table}

The 18 deterministic PASS rows originate from `{A}`; two integration PASS rows originate from `{I}`. Five performance BLOCKED records originate from `{P}` and are supplemented by the startup-only diagnostic `{D}`. PT-008 remains SKIPPED. The passing tests were not rerun or retimestamped.

## Latest per-ID results

{table(['ID','Category','Status','Original execution timestamp','Evidence'],[[r['test_id'],'Unit' if r['test_id'].startswith('UT-') else 'Integration' if r['test_id'].startswith('IT-') else 'AI System' if r['test_id'].startswith('ST-AI-') else 'Performance',r['status'],r['timestamp'] if r['executed'] else '— not executed',link('record',r['evidence_path'].replace('testing_modules/pre_uat/','').replace('\\','/'))] for r in rows])}

## Interpretation

PASS concerns automated functional assertions within the documented Python scope. An intentionally malformed job reaching failed is an expected integration success. HTTP 202 alone was never sufficient for completion. No current test ID is FAIL; historical failures remain in [TESTING_HISTORY.md](TESTING_HISTORY.md) and immutable run artifacts.

No performance workload completed or began. There are no measured PT throughput, latency, p95, queue-drain or sustained-load results. Startup timings/resource preflights and old documentary throughput figures are not benchmark results. No numeric performance SLA was established. The API's diagnostic HTTP 200 was not an ownership PASS or a performance PASS.

See [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) for exact functions, objectives, original timestamps, limitations and links; [PRE_UAT_RESULTS.csv](PRE_UAT_RESULTS.csv) for spreadsheet import; [PRE_UAT_FINAL_SUMMARY.md](PRE_UAT_FINAL_SUMMARY.md) for submission guidance. Reproduction commands are documented in the category READMEs; do not execute them as part of this documentation-only phase.
''')
    run_notes={
        '20261011T060556_694484Z':'Phase 2A bootstrap BLOCKED: Windows asyncio wakeup socketpair denied; zero test-body assertions. 18 BLOCKED, 8 SKIPPED.',
        '20261011T060651_997186Z':'Initial deterministic execution: 15 PASS, 3 FAIL (UT-004/008/009), 8 SKIPPED.',
        '20261011T061026_592082Z':'Repeated initial deterministic result: 15 PASS, 3 FAIL, 8 SKIPPED.',
        '20261011T062548_769685Z':'After first approved validation corrections: 17 PASS, 1 FAIL (UT-004), 8 SKIPPED.',
        '20261011T062718_385853Z':'Intermediate regression with restored helper reuse: 17 PASS, 1 FAIL (UT-004), 8 SKIPPED.',
        A:'Final Phase 2A: 18 PASS, 0 FAIL, 8 SKIPPED. UT-004: 98 PASS subchecks. Authoritative unit/mocked-AI execution.',
        '20261011T064937_069972Z':'Integration prerequisite: Docker Linux engine unavailable. 2 BLOCKED; zero integration assertions.',
        '20261011T065517_011796Z':'Integration prerequisite: exact redis:7-alpine image absent. 2 BLOCKED; zero integration assertions.',
        '20261011T065750_252644Z':'Inspection-only Redis-image recheck: image absent; no harness execution or RESULTS.json.',
        '20261011T070935_324625Z':'Integration prerequisite: exact redis:7-alpine absent; another tag was not substituted. 2 BLOCKED.',
        I:'Successful integration: IT-007/IT-009 PASS; 20 consolidated PASS and 6 then-SKIPPED performance IDs.',
        P:'Performance startup attempt: 5 BLOCKED, zero workloads. Prior 20 PASS retained, PT-008 SKIPPED.',
        D:'Startup-only diagnostic BLOCKED: HTTP 200, PID ownership mismatch; failure-path diagnostic not executed. No performance workload.'}
    runs=[]
    for directory in sorted(EVIDENCE.iterdir()):
        if not directory.is_dir(): continue
        target='RESULTS.json' if (directory/'RESULTS.json').exists() else 'DIAGNOSTIC_RESULTS.json' if (directory/'DIAGNOSTIC_RESULTS.json').exists() else 'PREFLIGHT_INSPECTION.json'
        runs.append([directory.name,run_notes.get(directory.name,'Unclassified: review artifact'),elink(directory.name,target,'primary record'),len([p for p in directory.rglob('*') if p.is_file()])])
    write('TESTING_HISTORY.md',f'''# Chronological testing history — historical, not current statuses

Current consolidated status is 20 PASS, 0 FAIL, 5 BLOCKED and 1 SKIPPED. All directory labels below are original UTC run identifiers. Historical PASS/FAIL/BLOCKED counts refer to that run's scope, not the latest consolidated package.

## Phase 1: source audit, no execution

The first audit inspected repository structure, workbook/constants/formula contracts, historical test source and available fixtures. No passing execution evidence was available, so no ID qualified as EXISTING VERIFIED. Coverage was partial, not yet verified or missing; curriculum registry, persistence, auth/approval and UI responsibilities were external.

Eleven relocated `old_test/` files temporarily had zero bytes. The user confirmed a manual file-moving problem and restored their contents. This was neither an application defect nor evidence that historical tests had never existed. Committed source was inspected without restoring originals. Once restored, selected unchanged synthetic methods were reused safely; filenames alone were never treated as passing evidence. The initial audit prose and all intervening document versions are retained verbatim as [documentation snapshots](DOCUMENTATION_AUDIT.md).

## All saved runs

{table(['UTC directory','Historical outcome / meaning','Primary artifact','Files'],runs)}

## Phase 2A corrective progression

Initial 15 PASS/3 FAIL concerned negative/malformed workbook values and collisions (UT-004), course JSON validation (UT-008), and blank AI response success (UT-009). Approved negative-period-score rejection and course/institutional AI-boundary validation produced 17 PASS/1 FAIL. Strict numeric parsing, within-sheet duplicate ID/CLO rejection and unambiguous fallback resolved retained UT-004 failures. The above-maximum rejection expectation was corrected to preserve existing extra-credit implementation behavior. Final execution reached 18 PASS with 98 UT-004 subchecks.

The final compatibility artifact confirms unchanged actual observations for the preceding 17 passing IDs and unchanged historical sources. The 70/30 formula, thresholds, rounding and tested valid/missing-data outputs remained compatible. This is not independent approval of an institutional extra-credit policy.

## Phase 2B-1 progression

Docker/image blockers were prerequisite failures, not failed ETL assertions. Once satisfied, a fresh loopback-only Redis container supported real upload/queue/worker/ETL checks. Five uploads were accepted: four completed and one deliberately malformed job failed as expected. IT-009's three simultaneous scenarios produced 4/9/8 unique independently checked records. HTTP acceptance and terminal completion were distinct assertions.

## Phase 2B-2 progression

A read-only audit proposed bounded workloads without numeric SLAs. Five workloads were prepared and approved at that time, but none executed because API ownership/readiness proof was absent. PT-008 was deliberately withheld. Subsequent harness corrections preserved startup errors separately, bounded readiness, added owned stdin control and Windows process-job cleanup, and improved sanitized diagnostics.

Caching the temporary directory before the file audit hook corrected a reentrancy/deadlock hazard. The new child cache was initially unset and then reached API HTTP 200. Original deadlock attribution is strongly supported by the code and new initialization evidence, but the original hang has no saved stack trace. The launcher/server PID mismatch remains unresolved. Graceful shutdown/worker-stop proof is absent; both tracked PIDs were absent after owned-job cleanup, and Redis/temp cleanup was recorded. The intentional failure-path mode is prepared, unexecuted. Further debugging and benchmarks are paused.
''')
    latest_coverage=[]
    for row in rows:
        test_id=row['test_id']; historical=old.get(test_id)
        historical_class=historical[2] if historical else 'See preserved Phase 1 audit; no verified execution then'
        historical_source=historical[1] if historical else 'No directly reusable assertion established'
        latest_coverage.append([test_id,historical_class,historical_source,'NEW VERIFIED within documented scope' if row['status']=='PASS' else row['status']+'; requirement not executed/verified',link('latest assertions',row['evidence_path'].replace('testing_modules/pre_uat/','')),limitation(test_id)])
    write('COVERAGE_AUDIT.md',f'''# Coverage audit — reconciled current versus historical coverage

{status_note}

EXISTING VERIFIED requires an exact historical assertion and verifiable execution evidence. No Phase 1 candidate met that standard. NOT YET VERIFIED denotes identifiable assertions with no passing run; PARTIALLY COVERED denotes missing assertions; NOT COVERED denotes no suitable test. EXTERNAL applies to portions outside Python and never replaces the 26 requested IDs' statuses. NEW VERIFIED below refers to saved executed assertions, not filenames or source presence.

{table(['ID','Phase 1 historical classification','Historical source / exact checks','Current coverage','Execution evidence','Remaining assertions / limitations'],latest_coverage)}

## Historical restoration and assertion reuse

All eleven restored originals are historical sources; restoration alone verifies nothing. Fourteen selected unchanged methods from `test_etl_v2.py` and `test_composite_attainment.py` plus the synthetic workbook builder were reused in the isolated deterministic suite. Exact reused methods and protected source hashes are in {elink(A,'SOURCE_MANIFEST.json','source manifest')}; per-ID evidence records their passing assertions. They are constituent checks, not 14 extra test IDs. `test_shared_secret_auth.py` and other standalone live/E2E scripts were not automatically verified.

The historical stress script checks HTTP acceptance rather than completed ETL jobs, has potentially shared/default targets, and supplies no suitable current PT passing evidence. Reported figures in `documentations/KNOWN_LIMITATIONS.md` lack attributable raw benchmark artifacts in this package; they are unverified historical documentary observations, not SLAs or new PT results. Original scripts are unchanged.

For complete chronology and original audit snapshots see [TESTING_HISTORY.md](TESTING_HISTORY.md) and [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md). Integration blockers are historical and superseded by the saved PASS run; UT-004/008/009 failures are historical and corrected. Performance blockers remain current.
''')
    write('DEFECTS.md',f'''# Defects, corrected expectations and remaining limitations

Current executed Python-side tests are PASS. Historical reproductions are indexed in [TESTING_HISTORY.md](TESTING_HISTORY.md); these resolved findings are not current failed test IDs.

{table(['Finding','Affected ID','Correction / disposition','Current evidence'],[
        ['Negative period scores accepted','UT-004','Reject non-null negative PRELIM/MIDTERM/FINAL before calculation using structured errors; preserve zero/null/extra credit.',elink(A,'UT-004_result.txt','PASS')],
        ['Malformed nonblank numeric score/rating treated as missing','UT-004','Strict dedicated cell parser rejects text/errors/booleans/nonfinite values; accepts genuine blanks and valid numeric strings; metadata parser unchanged.',elink(A,'UT-004_result.txt','PASS')],
        ['Duplicate IDs/CLOs and ambiguous fallback could overwrite records','UT-004','Reject within-sheet normalized collisions before insertion; preserve cross-sheet matches, optional IDs and unambiguous fallback.',elink(A,'UT-004_result.txt','PASS')],
        ['Malformed course recommendation JSON accepted','UT-008','Validate required schema/types and return existing error envelope; preserve fenced JSON, nullable pattern, single recommendation and string response.',elink(A,'UT-008_result.txt','PASS')],
        ['Blank/non-string course or institutional response reported successful','UT-009','Normalize/reject invalid responses at boundaries; preserve nonempty institutional prose, no_gaps_found/null shortcut and shared provider behavior.',elink(A,'UT-009_result.txt','PASS')],
        ['Above-maximum rejection expected by original test','UT-004','Incorrect test expectation corrected under approval. Existing extra-credit behavior retained; no institutional policy certification.',elink(A,'UT-004_result.txt','98 passing subchecks')]])}

## Production correction boundaries

Approved changes occurred in `app/etl/transform/transformer.py`, `app/etl/extract/extractor.py`, `app/core/exceptions.py`, `app/analytics/cqi_recommender.py` and `app/analytics/institutional_summary.py`. Exact paths/functions and compatibility evidence are in [REGRESSION_NOTES.md](REGRESSION_NOTES.md). No production code was changed during integration, performance preparation/diagnostics or this consolidation.

## Harness findings — not production defects

- The initial Phase 2A Windows wakeup-pipe block was corrected before deterministic execution.
- Performance readiness failures bypassed the inner shutdown block; later cleanup overwrote the primary error. Shared lifecycle cleanup and separate error records now address these paths, but graceful shutdown has not yet passed verification.
- A 20-second readiness deadline previously allowed 30-second attempts. Attempts are now bounded by remaining time, HTTP status is checked, and subprocess exit is monitored.
- Critical-only logging suppressed useful diagnostics. Error-level logging and sanitized stage/exception records now exist.
- Temporary-directory discovery inside the open audit hook had a reentrancy/deadlock hazard. Caching before hook installation allowed later startup to reach HTTP 200. Original attribution remains inferential because the earlier run lacked a hang trace.
- **Unresolved:** Windows SDK launcher PID versus server PID mismatch prevents exact ownership verification. Current code refuses shutdown and retains BLOCKED status. Future correction must prove server membership in the owned process job; it must not discard PID checks. Resource monitoring must then use the proven server PID.

## Other limitations / static concerns

Python advice is advisory computational output; semantic quality and approval/RBAC enforcement need human/webapp evidence. Numeric prose beyond the supported checker grammar is manual review. Gemini errors may expose provider exception/key previews in live use; live redaction/latency/quotas remain untested. Queue capacity uses separate Redis operations; multi-process saturation races remain a static concern, not a reproduced defect. Current workers retain uploads/job keys until owned test cleanup; retained growth is not automatically a leak. Source guide descriptions drift from current 70/30/live-provider behavior; effective deployment configuration was not loaded.
''')
    reused=read(EVIDENCE/A/'SOURCE_MANIFEST.json')['reused_methods']
    write('REGRESSION_NOTES.md',f'''# Verified deterministic regressions and compatibility

Final Phase 2A `{A}`: **18 PASS, 0 FAIL, 8 historically deferred SKIPPED**. These 18 PASS rows remain current; integration later added two PASS rows. UT-004 has **98 passing subchecks and 101 recorded expected/actual observations**. These are subchecks, not additional IDs.

## Approved application changes

{table(['Source boundary','Change','Compatibility retained'],[
        ['SimpleTransformer._transform_v2_records','Reject negative non-null period scores with structured TransformationError before summing.','Zero, null, extra credit, existing calculations/rounding/thresholds; no clamping.'],
        ['ExcelExtractor._read_numeric_cell','Strict parsing for scores and indirect ratings; errors include sheet/cell/field and sanitized reason.','Genuinely blank/whitespace missing values, finite numbers/numeric strings; unrelated metadata/max parsing unchanged.'],
        ['ExcelExtractor._validate_roster_ids / identity lookup','Reject repeated nonblank IDs within a sheet; unambiguous name fallback.','Matching IDs across sheets; optional IDs; valid distinct IDs sharing a name.'],
        ['ExcelExtractor._validate_clo_codes','Reject duplicate discovered/normalized codes and indirect headers resolving to the same code.','Dynamic layouts and cross-sheet matching; no new case folding/registry rules.'],
        ['WorkbookValidationError','Use OBELISKError structured metadata without identities/raw invalid values.','Existing worker error envelope.'],
        ['generate_cqi_recommendation / normalize_llm_response','Validate course JSON and reject blank/non-string responses.','String output, valid fences, nullable pattern, single recommendation; shared provider settings/failover unchanged.'],
        ['generate_institutional_summary','Reject invalid/blank text; no course-schema requirement.','Successful nonempty prose and numerical summaries; no-gaps shortcut retained.']])}

## Extra credit and independent outputs

The original 26/25 score case was accepted already. Its rejection assertion was an incorrect compatibility expectation; the approved replacement independently verifies direct 0.86 and composite 87.20. Added cases include direct attainment above 100% without denominator changes or clamping. This verifies existing implementation behavior, not independently documented institutional grading policy.

Malformed input assertions were retained/strengthened, not removed to manufacture PASS. Literal NaN/infinities are tested before workbook saving because openpyxl may serialize those float literals as blank cells; nonfinite strings and Excel error cells are tested through actual workbook parsing. {elink(A,'UT-004_result.txt','UT-004 exact subchecks')} distinguishes these routes.

## Compatibility evidence

{elink(A,'COMPATIBILITY.json','Compatibility comparison')} verifies identical actual observations for all 17 previously passing IDs against `{ '20261011T062718_385853Z' }`; only extractor/exceptions changed in that final correction. Earlier approved AI/negative-score fixes were already present. All eleven original scripts match the prior baseline. Independent fixture/oracle assertions verify 70/30, 70% boundary, rounding, levels, missing data and numerical inputs to mocked AI. No source hash alone proves an unexecuted assertion.

No saved real class-record workbook was used; compatibility is for tested synthetic valid layouts and unchanged selected historical methods. Institutional policy, curriculum registry, approval/UI/database behavior and arbitrary AI prose remain outside this regression claim.

## Exact historical methods reused

{chr(10).join('- `'+method+'`' for method in reused)}

Only safe imports/class definitions were loaded through the existing AST helper. The class named `TestAunObeRealWorkbookIntegration` contributed its synthetic fallback method, not its real-workbook method. Fourteen constituent methods do not increase the 26-ID total.

Initial 15/3 and intermediate 17/1 outcomes and their original failures are preserved in [TESTING_HISTORY.md](TESTING_HISTORY.md). Current integration status is PASS; performance status remains BLOCKED/SKIPPED. Reproduction commands are in [README.md](README.md); no commands were run during this consolidation.
''')
    write('INTEGRATION_README.md',f'''# Phase 2B-1 integration — executed PASS

**IT-007 PASS and IT-009 PASS** in `{I}`. Earlier Docker/image blockers are historical; see [TESTING_HISTORY.md](TESTING_HISTORY.md). Current package totals are 20 PASS, 0 FAIL, 5 BLOCKED and 1 SKIPPED, with only performance IDs blocked/deferred.

## Verified behavior

IT-007 asserts upload 202/UUID/queued state and absent stale result, worker-persisted running to completed or failed, independently correct six-record valid output, sanitized malformed numeric-cell error/no result, stable rereads and absent-job 404. The expected failed malformed job is a passing test assertion. HTTP polling may miss brief running states; evidence distinguishes HTTP observations from persisted updates.

IT-009 submits three distinct worst/mixed/ideal workbooks concurrently (correctness concurrency 3), requires unique IDs/upload paths, all terminal completion, 4/9/8 unique scenario-specific records, independent direct/indirect/composite values, disjoint identities and stable result fingerprints. This is not a throughput benchmark.

## Actual environment and isolation

Python 3.13.0; FastAPI/httpx in-process ASGI with real upload/job routers; real Redis queue, upload service, workers and full ETL. Docker Linux engine 29.7.2; fresh labelled cached Redis 7.4.11 container on random loopback port 2062, disabled snapshot/AOF persistence, no persistent mounts, unique namespace and temporary uploads. Exact image identity is in {elink(I,'ISOLATION.json','ownership evidence')}.

Test configuration: two explicit workers, queue limit 10, write concurrency 3, 1 MiB upload cap and 64 KiB chunks. These are isolated correctness settings, not source-default production capacity. Terminal polling deadline 15 seconds and case bound 30 seconds. Effective deployment configuration and `app.main` startup/middleware were not tested.

Configuration/import/network guards preceded application imports; encrypted env, databases/models, live Gemini and existing workbook/upload access were denied. Only the newly proven Redis instance and trusted asyncio wakeup pair were available. No existing application container or shared queue was targeted.

## Cleanup and evidence

Five jobs were accepted: four completed; one intentionally malformed job failed as expected. Workers were cancelled, BRPOP threads allowed to drain, owned keys/uploads removed between cases and empty Redis verified. Only the owned labelled container/temp directory was removed; no FLUSHDB/FLUSHALL. Source hashes confirm production/original sources unchanged during execution.

{elink(I,'EXECUTION_SUMMARY.json','Job-count summary')}, {elink(I,'RESULTS.json','exact assertions')}, {elink(I,'SANITIZED_LOGS.json','worker events')}, {elink(I,'SOURCE_MANIFEST.json','source manifest')}. The 18 earlier PASS IDs retain their original timestamps and were not rerun.

## Reproduction reference — not authorization to execute now

Use the configured SDK and existing packages. Docker Linux engine must already run and exact cached `redis:7-alpine` must exist. The runner neither pulls images nor substitutes existing Redis, and accepts no target override.

```powershell
& '.\\.venv\\Scripts\\python.exe' -B testing_modules/pre_uat/run_phase2b1.py
```

Exit 0: two PASS IDs and verified cleanup; 1: assertions failed; 2: BLOCKED prerequisites/isolation. Run from the Python service root only through this runner. A rerun rewrites consolidated reports for its scope; preserve the final submission snapshot first. No rerun occurred in this documentation phase. Python has no application database; persistence/auth/approval/frontend verification belongs to the webapp team.
''')
    write('PERFORMANCE_README.md',f'''# Phase 2B-2 performance — prepared, not executed

**PT-004/005/006/007/009 BLOCKED; PT-008 SKIPPED.** No upload benchmark, analytics benchmark, AI latency workload, stability exercise or queue saturation ran. No PT metric or performance PASS exists. Further debugging/testing is paused for documentation consolidation.

## Read-only audit and proposed bounded workloads

{table(['ID','Prepared behavior / workload','Intended metrics / assertions'],[
        ['PT-004','20 synthetic uploads each at concurrency 1, 2, 4','Acceptance versus completed ETL throughput; per-job independent outputs and terminal completion.'],
        ['PT-005','10 sequential uploads, each reaching terminal state before the next','Dispatch-to-202 and dispatch-to-completion mean/p95/max.'],
        ['PT-006','20 sequential course recommendations using deterministic mocked Gemini','Python AI-path overhead/content checks only; not live Gemini latency.'],
        ['PT-007','At most 120-second dispatch window, 60 uploads, >=2-second dispatch interval, maximum two requests in flight','Errors, backlog, terminal results, queue drain, owned CPU/RAM; short exercise, not long soak.'],
        ['PT-008','Queue saturation/recovery proposal only; execution not approved','Capacity/rejection/recovery/drain. No executed assertion or measurement.'],
        ['PT-009','Three excluded warm-ups then 100 measured analytics requests at each concurrency 1, 2, 4','Independent CLO/PLO rollups; HTTP throughput and mean/p95/max.']])}

Prepared services: separate guarded Uvicorn process on random loopback port, new labelled cached Redis container, disabled persistence/no mounts, unique namespace and synthetic 30x5 workbook. Source-default intended settings: four workers, queue 200, write concurrency five, 1 MiB chunks and 10 MiB upload limit. These settings are preparation metadata, not benchmark validation of a deployment.

Thirty-second request and 120-second drain bounds are safety limits, not SLAs. Proposed metrics include requests/concurrency, accepted/completed/failed/rejected/unfinished counts, HTTP errors, mean/nearest-rank p95/max, distinct acceptance/completion throughput, sampled waiting depth/drain and owned CPU/RAM. Polling/validation overhead must be disclosed. Queue depth excludes running jobs; sampled peaks can be missed. Retained job keys/files require owned cleanup and should not automatically be called leaks.

The historical stress script only checks HTTP acceptance and can target an existing service; it was not run. Documentary historical throughput figures lack attributable raw evidence here and are not official thresholds. No numeric latency/throughput targets were found; performance acceptance remains unassessed.

## Actual attempts and unresolved blocker

Initial `{P}` stopped before workloads with absent HTTP ownership/shutdown proof; the primary startup error was obscured by cleanup handling. Owned process termination and Redis/temp cleanup were recorded.

Subsequent `{D}` startup-only mode reached HTTP 200 after guard initialization corrections. Exact PID ownership failed: launcher 13620 versus server 24656. The harness correctly withheld shutdown, forced owned process-job cleanup, and verified both PIDs absent. Graceful worker-stop proof is missing. Intentional pre-readiness failure mode exists but was not run, because normal verification failed. See [STARTUP_DIAGNOSTIC_NOTES.md](STARTUP_DIAGNOSTIC_NOTES.md).

## Commands retained for traceability — do not execute during this pause

```powershell
& '.\\.venv\\Scripts\\python.exe' -B testing_modules/pre_uat/run_phase2b2.py --startup-only
```

The workload runner additionally requires `--approved-bounded-run`; that mode is not authorized in this documentation phase and cannot currently establish ownership. Do not use generic test discovery, alternate services, relaxed guards, tuned workers or live provider keys. Any future retry requires separate approval and verification of server PID membership in the owned process job.

No dependencies were downloaded; existing Python runtime/httpx/Uvicorn packages and cached Redis were used for preparation. Startup preflight CPU/RAM/disk readings are environmental observations, not workload measurements. [Evidence index](EVIDENCE_INDEX.md) preserves five original BLOCKED records plus later diagnostics, without retimestamping completed tests.
''')
    write('STARTUP_DIAGNOSTIC_NOTES.md',f'''# Startup-only diagnostic findings — current blocker, debugging paused

This document concerns harness diagnostics, not performance test execution. Current Pre-UAT totals remain 20 PASS, 0 FAIL, 5 BLOCKED and 1 SKIPPED. Prior evidence was not rewritten.

## Confirmed code defects and correction state

Readiness ran outside the old shutdown try/finally; cleanup overwrote the primary exception; per-request timeout exceeded overall readiness bounds; critical-only logging hid useful error diagnostics. Shared lifecycle helpers now cover launch/readiness/workload cleanup, preserve independent sanitized errors, check process exit and HTTP status, bound attempts, and record stages. These changes are implemented; successful graceful lifecycle verification remains incomplete.

Shutdown now requires owned nonce/Redis/process proof through a private stdin channel. HTTP control also requires a nonce. The new process job is kill-on-close and cleanup targets only that job/created subprocess, not container/process names. Server guards prohibit spawning descendants. No ownership/network/import guard was disabled.

## Temporary-directory hazard

Original `performance_environment.install_guards.audit` called `tempfile.gettempdir()` inside every open event. On first discovery Python 3.13 holds a non-reentrant `_once_lock` while probing a directory with `os.open`, re-entering the callback and lock. This is a confirmed static deadlock path. The new child evidence reports `temp_directory_was_uninitialized: true`; caching before hook installation allowed imports and Uvicorn startup to proceed. Attribution to the original hang is strongly supported but inferential because no original hang stack was captured. The file-policy roots remain unchanged.

## Actual latest diagnostic

Run `{D}`: readiness attempts show a ConnectTimeout followed by HTTP 200. Exact ownership comparison failed with `PrerequisiteBlocked: HTTP ownership identity mismatch`. `Popen.pid` was 13620; child startup/control records report 24656. The Windows configured SDK launcher/server process distinction is incompatible with equality to launcher PID alone. The HTTP response body was not saved, so do not assert that every other handshake field was separately verified.

Cleanup separately records `Owned child control identity mismatch` and missing `SERVER_PROOF.json`. No shutdown command was sent without ownership. The owned job was closed and both tracked PIDs were absent on the follow-up process check. Disposable Redis and temporary uploads were removed. Graceful server/worker stop is **NOT VERIFIED**. The recorded exit code after forced job closure is not proof of an application crash or graceful shutdown.

The intentional pre-readiness failure plus injected cleanup-diagnostic error is **prepared but NOT EXECUTED**. The normal diagnostic failed, so no second subprocess or retry was started. No application workload, benchmark or production change occurred.

## Proposed correction, not implemented

Verify the actual server PID with an opened handle and `IsProcessInJob` for this owned Windows job, plus exact nonce and Redis identity. Retain the launcher identity; do not merely accept mismatched PIDs. Correct the resource-monitor target to the proven server process. Consider suspended launch/job assignment/resume to close the assignment race. Capture sanitized expected/observed fields in future evidence. Separate approval is required; debugging is paused.

## Saved artifacts

{elink(D,'DIAGNOSTIC_RESULTS.json','Overall result')}, {elink(D,'normal_startup/STARTUP_STAGES.json','stages')}, {elink(D,'normal_startup/CHILD_CONTROL.json','child identity')}, {elink(D,'normal_startup/READINESS_ATTEMPTS.json','attempts')}, {elink(D,'normal_startup/PROCESS_CLEANUP.json','cleanup errors')}, {elink(D,'OWNED_PROCESS_EXIT_CHECK.json','PID exit check')}, {elink(D,'ISOLATION.json','Redis/temp cleanup')}, {elink(D,'SOURCE_MANIFEST.json','protected hashes')}.

Original blocked performance attempt: {elink(P)}, {elink(P,'ISOLATION.json','initial cleanup proof')}. Neither diagnostic constitutes a PT PASS. Reproduction reference is in [PERFORMANCE_README.md](PERFORMANCE_README.md); no diagnostic is executed during consolidation.
''')
    write('README.md',f'''# OBELISK Python Pre-UAT evidence package

Team **4th Dimension** · target submission **October 13, 2026** · Python ETL/analytics service.

{status_note}

Start with [PRE_UAT_FINAL_SUMMARY.md](PRE_UAT_FINAL_SUMMARY.md), [PRE_UAT_RESULTS.md](PRE_UAT_RESULTS.md) / [CSV](PRE_UAT_RESULTS.csv), and [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md). [TESTING_HISTORY.md](TESTING_HISTORY.md) preserves every saved run's meaning. [COVERAGE_AUDIT.md](COVERAGE_AUDIT.md), [DEFECTS.md](DEFECTS.md) and [REGRESSION_NOTES.md](REGRESSION_NOTES.md) distinguish historical gaps, corrected defects and remaining limitations. [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) records consolidation checks and preserved snapshots.

## Scope and ownership

Python parsing, independent attainment calculations, deterministic mocked-AI behavior and isolated Redis job correctness were tested. Python is a pure-compute service; this package does not verify application-database persistence, backend/frontend workflows, RBAC, approvals, institutional sign-off or entire-webapp readiness. Refer to current [formula documentation](../../documentations/FORMULAS.md) and [integration contract](../../documentations/INTEGRATION.md); do not infer current implementation from a stale agent-guide description.

All fixtures were generated temporarily with synthetic identities/metadata; saved class-record templates/uploads were not used. The 30x5 count applies only to its designated fixture. Gemini was mocked or denied; no live keys/services, production database or shared Redis were used. Original `old_test/` scripts were restored manually by the user after a file-moving problem and were never modified by this testing work. Selected unchanged synthetic assertions were reused; historical source presence is not evidence of PASS.

## Safe reproduction references — not commands for this documentation phase

Run from `apps/python-server` with PyCharm's configured SDK (recorded Python 3.13.0). Existing locked runtime packages plus httpx/Uvicorn are prerequisites where relevant; no dependencies were introduced. Recheck the SDK before any future Python command. The current phase permits documentation validation only; new service/test execution needs separate authorization.

```powershell
# Deterministic unit and mocked-AI suite; no Redis or live provider
& '.\\.venv\\Scripts\\python.exe' -B testing_modules/pre_uat/run_phase2a.py

# Isolated integration correctness; cached image/local engine required
& '.\\.venv\\Scripts\\python.exe' -B testing_modules/pre_uat/run_phase2b1.py
```

Use `--case UT-004`, `--case UT-008` or `--case UT-009` only for an authorized focused deterministic run. That run will mark other IDs SKIPPED and replace the mutable consolidated reports for its scope. All older timestamped evidence remains. Preserve this submission package before any future rerun; the immutable evidence, not a runner's latest mutable CSV, determines history.

Never run test modules by direct/generic discovery: guards must precede application imports. No configured/shared service is a fallback. [INTEGRATION_README.md](INTEGRATION_README.md) documents successful isolated correctness and cleanup. [PERFORMANCE_README.md](PERFORMANCE_README.md) and [STARTUP_DIAGNOSTIC_NOTES.md](STARTUP_DIAGNOSTIC_NOTES.md) explain why no benchmark result exists and further debugging is paused.

## Evidence and interpretation

UTC timestamped directories contain original objective/scenario, expected/actual, status, environment, exact function, command and failure details. Source/compatibility manifests establish source provenance; they do not prove unexecuted behavior. The final deterministic run has 18 PASS; integration adds two PASS. Five performance IDs are BLOCKED and PT-008 deliberately SKIPPED. Startup-only HTTP 200 is not ownership verification or performance success.

UT-004 has 98 passing subchecks; all preceding 17 passing IDs retain matching observations in the compatibility comparison. Extra credit is existing implementation compatibility, not independently verified grading policy. ST-AI-004 machine-checks the supported claim grammar only; unsupported numbers, causal explanations and educational quality require manual review. ST-AI-006 checks Python advisory behavior; backend approval enforcement remains external.

## Documentation validation only

```powershell
& '.\\.venv\\Scripts\\python.exe' -B testing_modules/pre_uat/documentation_validation.py --check
```

This standard-library validator reads saved JSON/CSV/Markdown/source files; it does not import application modules, run tests or contact services. Its `--consolidate` option regenerates documentation from saved records and is a documentation mutation, not test execution. [Documentation quality record](DOCUMENTATION_AUDIT.md) lists the current check outcome.
''')
    write('PRE_UAT_FINAL_SUMMARY.md',f'''# OBELISK — Python Pre-UAT submission summary

**Project:** Outcomes-Based Educational Learning and Intelligent System Kit (OBELISK)  
**Team:** 4th Dimension  
**Submission target:** October 13, 2026  
**Scope:** Python spreadsheet ETL, attainment analytics, mocked AI service behavior and isolated Redis job processing. This is component evidence, not whole-webapp acceptance.

## Executive summary

Twenty executed Python-side test IDs passed. Approved validation corrections resolved the observed unit/AI failures without changing the tested 70/30 formula, thresholds or valid outputs. Two integration IDs verified real job processing and concurrent isolation. Performance workloads remain unexecuted: five IDs are BLOCKED by harness ownership verification and queue saturation is SKIPPED. Historical evidence and original successful execution timestamps are preserved.

## Final status

{counts_table}

PASS is supported by saved assertions; BLOCKED/SKIPPED are not performance successes. No current ID is FAIL. Detailed one-row-per-ID results are in [PRE_UAT_RESULTS.md](PRE_UAT_RESULTS.md), [CSV](PRE_UAT_RESULTS.csv), and [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).

## Testing chronology

Phase 1 audited source and historical coverage without test execution. Temporary zero-byte originals were traced to the user's file-moving/restoration issue; it was not an application defect. Historical assertions had no attributable passing evidence then.

Phase 2A progressed from 15 PASS/3 FAIL/8 SKIPPED, through 17 PASS/1 FAIL/8 SKIPPED, to 18 PASS/0 FAIL/8 SKIPPED. UT-004/008/009 corrective work and the approved extra-credit expectation correction produced the final deterministic evidence. UT-004 has 98 passing subchecks; 14 selected unchanged historical methods were reused as constituent assertions.

Phase 2B-1 initially blocked on Docker and the exact cached Redis image. Once available, IT-007 and IT-009 passed. Five jobs were accepted: four completed and one deliberately malformed job reached failed, as expected. Three concurrent distinct scenarios produced isolated 4/9/8-record results. Acceptance 202 and terminal completion were verified separately.

Phase 2B-2 began with a read-only workload audit; five prepared workloads never executed. Startup cleanup/error-reporting defects were corrected in the harness. A temporary-directory audit-hook deadlock hazard was addressed; the latest startup-only attempt reached HTTP 200 but failed exact launcher/server PID ownership. Graceful shutdown remains unverified; owned-resource forced cleanup is recorded. The intentional failure-path diagnostic was not executed. [Complete run history](TESTING_HISTORY.md) includes all 13 saved directories.

## Defects and corrective actions

Workbook validation now rejects negative scores, malformed nonblank numeric cells, within-sheet duplicate IDs/CLOs and ambiguous fallback using structured errors. Course recommendations validate successful JSON and preserve the compatible string/fenced/single-item/nullable-pattern behavior. Both AI boundaries reject blank/non-string text; institutional prose remains supported. [DEFECTS.md](DEFECTS.md) distinguishes corrected application defects from harness defects and policy clarification.

Above-maximum acceptance was already extra-credit implementation behavior; its rejection expectation was corrected. This package does not independently establish institutional extra-credit policy. No schema/database, Redis worker defaults, formula or Gemini settings were changed to obtain these results.

## Verified regression and integration evidence

{elink(A,'RESULTS.json','Final deterministic results')} and {elink(A,'COMPATIBILITY.json','compatibility comparison')} establish 18 PASS and unchanged observations for the preceding 17 passing IDs. The 70% boundary, independent numerical calculations, record uniqueness, missing-data and AI input/error behavior are checked with synthetic fixtures. Compatibility does not extend to every real workbook layout.

{elink(I,'RESULTS.json','Integration assertions')} and {elink(I,'EXECUTION_SUMMARY.json','job/cleanup summary')} support two PASS IDs using real queue/worker/ETL through ASGI. Docker 29.7.2 and a fresh Redis 7.4.11 instance were isolated on loopback with persistence disabled. Tests used two explicit workers and smaller correctness limits; deployment startup/auth/performance were not verified. No application database was used.

## Performance preparation and current blocker

PT-004/005/006/007/009 are prepared and BLOCKED; PT-008 is deliberately SKIPPED. No throughput, latency/p95, sustained-load, saturation or recovery measurements exist for these IDs. Historical documentary figures are not current benchmarks or acceptance thresholds. PT-006 would measure mocked Python AI-path overhead only, not live Gemini latency.

{elink(D,'DIAGNOSTIC_RESULTS.json','Startup-only result')} documents HTTP ownership mismatch. [Startup notes](STARTUP_DIAGNOSTIC_NOTES.md) explain the remaining launcher/server PID issue, missing graceful worker-stop proof and proposed ownership-preserving correction. Debugging and test execution are paused. No performance readiness claim is made.

## Remaining limitations and risks

- Synthetic-only workbook coverage; no claim about all real instructor records, every template layout or production environment.
- Mocked Gemini only. Live provider latency, quotas and generated recommendation quality require separately approved evidence and human review.
- AI numbers outside the checker grammar are flagged for manual review; Python advisory behavior does not prove backend approval enforcement.
- Production deployment startup/middleware, auth/security, persistence, frontend rendering and end-to-end webapp behavior are not covered here.
- Performance targets are undocumented; benchmark execution and acceptance decisions remain outstanding. Queue saturation and potential multi-process capacity races are unverified.
- Retained Redis job records/uploads and logging/resource overhead require future operational assessment. No production capacity or readiness is certified.

## Evidence index

| Evidence | Relative path |
| --- | --- |
| Every Python-relevant ID, exact function/status/timestamp/limitations | [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) |
| All runs and historical failures/blockers | [TESTING_HISTORY.md](TESTING_HISTORY.md) |
| Final unit/mocked-AI run | {elink(A)} |
| Successful integration run | {elink(I)} |
| Initial blocked performance prerequisite run | {elink(P)} |
| Latest startup-only diagnostic | {elink(D,'DIAGNOSTIC_RESULTS.json')} |
| Document/evidence integrity and link checks | [DOCUMENTATION_AUDIT.md](DOCUMENTATION_AUDIT.md) |

## Institutional submission mapping and teammate deliverables

Use the 11 UT IDs for Python unit evidence, two IT IDs for isolated Python integration, and seven ST-AI IDs for mocked AI/system-related behavior. Submit the six PT IDs explicitly as five BLOCKED/one SKIPPED; do not present startup observations as performance results. The actual institutional form/template and numeric acceptance criteria were not supplied for independent verification, so this package is an evidence mapping aid rather than a completed institutional approval.

Backend/frontend teammates must supply authenticated upload UX, RBAC, approval/rejection/audit workflows, database persistence/linkage, report/export and end-to-end integration evidence. Reviewers/instructors must supply actual review/sign-off and consultant approval if required by the official form. Human AI evaluation, privacy-safe screenshots, deployment details, agreed performance targets and completed performance evidence remain separate deliverables; none is inferred here. IoT tests are not applicable to this Python compute service, subject to confirmation against the full project scope; this does not reclassify any of the 26 IDs.

## Readiness statement

The executed Python-side unit, mocked-AI and isolated integration tests passed within their documented scope. Performance execution remains incomplete. This package supports a qualified component-level Pre-UAT submission with disclosed blockers; it does not establish whole-OBELISK webapp acceptance, production readiness, consultant approval or instructor sign-off.
''')
    # Preserve complete prior documentation bytes without stale 'current'
    # sections in active Markdown. Historical evidence directories are untouched.
    snapshots=table(['Original document (historical snapshot)','Preserved bytes'],[[name,link('snapshot','documentation_snapshots/'+name+'.txt')] for name in sorted(originals)])
    write('DOCUMENTATION_AUDIT.md',f'''# Documentation consolidation and evidence audit

This is documentation-only work. No application tests, services, live APIs or benchmarks ran. Production sources, test harnesses, historical tests and all timestamped evidence are protected by before/after file hashes.

## Reconciled records

Saved consolidated JSON, current CSV and all per-ID artifacts agree: 26 unique IDs; 20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED. Passing timestamps are carried forward exactly. Unexecuted record timestamps are explicitly distinguished from execution timestamps. Every original timestamped directory remains.

## Historical discrepancies corrected in active documents

- Layered 'current' sections still described failed UT-004/008/009 or blocked integration after later PASS evidence. Those are now clearly historical in [TESTING_HISTORY.md](TESTING_HISTORY.md).
- Initial 15/3 and intermediate 17/1 outcomes each have two saved runs; neither repetition increases ID totals. The early socketpair attempt has zero executed test-body assertions.
- `{ '20261011T065750_252644Z' }` is an inspection-only directory, not a successful harness/test run; it has no RESULTS.json.
- The performance attempt lost its primary error through cleanup overwrite; its immutable artifact is retained. The later diagnostic records independent ownership/cleanup failures. HTTP 200 did not prove ownership.
- Temporary-directory deadlock is a confirmed static hazard; original-run attribution lacks an original hang trace. The PID mismatch is current and directly evidenced by launcher/control records.
- Extra credit is tested existing implementation behavior, not independently verified institutional policy. Documentary performance figures lack attributable raw artifacts and are not accepted PT measurements.
- Historical subchecks/method reuse, intentionally failed malformed jobs, prerequisite attempts and diagnostics are not extra Pre-UAT IDs.

No numeric-result discrepancy requires changing an immutable artifact. Missing historical traces, absent benchmark metrics and institutional approvals cannot be supplied through documentation.

## Original documentation snapshots

These verbatim `.txt` snapshots are historical source documents, not active/current status reports. Their embedded 'current' wording reflects the older document context. [Testing history](TESTING_HISTORY.md) supplies reconciled chronology; use active Markdown for latest status.

{snapshots}

## Validation

Run the documentation-only checker described in [README.md](README.md). The machine-readable [validation record](DOCUMENTATION_VALIDATION.json) records actual counts, link/file checks, original timestamp comparison and hash preservation. No test PASS is created by that checker. Future benchmark/debugging work remains paused.
''')


def check():
    errors=[]; original=authoritative()
    rows=list(csv.DictReader((HERE/'PRE_UAT_RESULTS.csv').open(encoding='utf-8-sig')))
    if len(rows)!=26 or Counter(r['test_id'] for r in rows)!=Counter(EXPECTED): errors.append('CSV IDs not unique/exact')
    if dict(Counter(r['status'] for r in rows))!=COUNTS: errors.append('CSV status counts differ')
    markdown=(HERE/'PRE_UAT_RESULTS.md').read_text(encoding='utf-8')
    mdrows=re.findall(r'^\| ((?:UT|IT|ST-AI|PT)-\d+) \| [^|]+ \| (PASS|FAIL|BLOCKED|SKIPPED) \|',markdown,re.M)
    if Counter(t for t,s in mdrows)!=Counter(EXPECTED) or dict(Counter(s for t,s in mdrows))!=COUNTS: errors.append('Markdown IDs/counts differ')
    if {r['test_id']:r['status'] for r in rows}!={t:s for t,s in mdrows}: errors.append('Markdown/CSV statuses differ')
    index=(HERE/'EVIDENCE_INDEX.md').read_text(encoding='utf-8')
    ids=re.findall(r'^\| ((?:UT|IT|ST-AI|PT)-\d+) \|',index,re.M)
    if Counter(ids)!=Counter(EXPECTED): errors.append('Evidence index IDs not unique/exact')
    timestamp_checks=[]
    for original_row in original:
        row=next(r for r in rows if r['test_id']==original_row['test_id'])
        same=row['timestamp']==original_row['timestamp'] and row['status']==original_row['status'] and row['evidence_path']==original_row['evidence_path']
        timestamp_checks.append({'test_id':row['test_id'],'preserved':same})
        if not same: errors.append('Original row metadata differs: '+row['test_id'])
        if row.get('execution_timestamp')!=(row['timestamp'] if row['executed']=='True' else ''): errors.append('Execution timestamp conflated: '+row['test_id'])
    links=[]
    for path in HERE.rglob('*.md'):
        text=path.read_text(encoding='utf-8-sig')
        for target in re.findall(r'(?<!!)\[[^\]\n]+\]\(([^)]+)\)',text):
            target=target.strip('<>')
            if target.startswith(('http:','https:','#','mailto:')): continue
            resolved=(path.parent/target.split('#')[0]).resolve()
            exists=resolved.exists(); links.append({'document':str(path.relative_to(HERE)),'target':target,'exists':exists})
            if not exists: errors.append('Missing Markdown target: '+str(path.relative_to(HERE))+' -> '+target)
    for row in rows:
        if not (ROOT/row['evidence_path']).is_file(): errors.append('Missing evidence file: '+row['test_id'])
        if not (ROOT/(row['script_function'].split('.Workloads.')[0].replace('.','/')+'.py')).exists() and row['test_id'].startswith('PT-'):
            # PT-008 has a deferred label, not an implemented callable.
            if row['test_id']!='PT-008': errors.append('Missing workload module: '+row['test_id'])
    baseline=read(HERE/'DOCUMENTATION_BASELINE.json')
    altered=[name for name,sha in baseline.items() if not (ROOT/name).is_file() or digest(ROOT/name)!=sha]
    if altered: errors.append('Protected/evidence files changed')
    old_evidence={name for name in baseline if name.startswith('testing_modules/pre_uat/evidence/')}
    now_evidence={p.relative_to(ROOT).as_posix() for p in EVIDENCE.rglob('*') if p.is_file()}
    if old_evidence!=now_evidence: errors.append('Historical evidence inventory differs')
    parsed=0
    for path in EVIDENCE.rglob('*.json'):
        read(path); parsed+=1
    for path in EVIDENCE.rglob('*_result.txt'): read(path)
    # Resolve exact unittest/function references with AST only, never imports.
    functions=[]
    for row in rows:
        if row['status']!='PASS': continue
        reference=row['script_function']; module,classname,function=reference.rsplit('.',2)
        path=ROOT/(module.replace('.','/')+'.py')
        tree=ast.parse(path.read_text(encoding='utf-8-sig'))
        found=any(isinstance(c,ast.ClassDef) and c.name==classname and any(isinstance(f,(ast.FunctionDef,ast.AsyncFunctionDef)) and f.name==function for f in c.body) for c in tree.body)
        functions.append({'test_id':row['test_id'],'exact_function_exists':found})
        if not found: errors.append('Missing executed function: '+reference)
    report={'timestamp_utc':datetime.now(timezone.utc).isoformat(),'mode':'documentation-only; no tests/services/application imports',
        'status':'PASS' if not errors else 'FAIL','test_id_count':len(rows),'counts':dict(Counter(r['status'] for r in rows)),
        'markdown_unique_ids':len(mdrows),'evidence_index_unique_ids':len(ids),'relative_links_checked':len(links),
        'json_artifacts_parsed':parsed,'timestamp_and_evidence_checks':timestamp_checks,'executed_function_checks':functions,
        'protected_files_checked':len(baseline),'changed_protected_files':altered,
        'historical_evidence_files_checked':len(old_evidence),'historical_evidence_inventory_preserved':old_evidence==now_evidence,
        'links':links,'errors':errors,'performance_workloads_executed':False}
    (HERE/'DOCUMENTATION_VALIDATION.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'links','timestamp_and_evidence_checks','executed_function_checks'}},indent=2))
    return 0 if not errors else 1

if __name__=='__main__':
    if sys.argv[1:]==['--consolidate']: consolidate()
    elif sys.argv[1:]!=['--check']: raise SystemExit('Use --check or --consolidate; neither runs application tests')
    raise SystemExit(check())
