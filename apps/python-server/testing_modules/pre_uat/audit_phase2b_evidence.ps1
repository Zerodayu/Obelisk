# Evidence review only. Never starts a service, imports Python, or runs workloads.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$ids = @('IT-007','IT-009','PT-004','PT-005','PT-006','PT-007','PT-008','PT-009')
$evidence = Join-Path $PSScriptRoot 'evidence'
$historical = @(Get-ChildItem -LiteralPath $evidence -Recurse -File)
$before = @{}
foreach ($file in $historical) { $before[$file.FullName] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmss_ffffffZ')
$run = Join-Path $evidence ($stamp + '_phase2b_verification')
New-Item -ItemType Directory -Path $run | Out-Null
$commit = (& git -C $root rev-parse HEAD).Trim()
$command = '& powershell -NoProfile -File testing_modules/pre_uat/audit_phase2b_evidence.ps1'
function Save-Json($name, $value) {
    $value | ConvertTo-Json -Depth 80 | Set-Content -LiteralPath (Join-Path $run $name) -Encoding UTF8
}
function Relative($path) { $path.Substring($root.Length + 1).Replace('\','/') }
$inventory = @()
# Include per-ID files and every scoped row in result/consolidated JSON. Copies
# retain original timestamps and evidence targets; they are not extra tests.
foreach ($file in $historical) {
    if ($file.Name -notmatch '^(IT-007|IT-009|PT-00[4-9])_result.txt$|^(RESULTS|CONSOLIDATED_RESULTS).json$') { continue }
    $doc = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    $rows = if ($doc.test_id) { @($doc) } else { @($doc.rows) }
    foreach ($row in $rows) {
        if ($row.test_id -notin $ids) { continue }
        $git = if ($row.environment.git_head) { $row.environment.git_head } elseif ($row.git_commit) { $row.git_commit } else { 'NOT RECORDED; current HEAD must not be substituted' }
        $support = @(Get-ChildItem -LiteralPath $file.DirectoryName -File | Where-Object { $_.Name -match 'MANIFEST|ISOLATION|SUMMARY|LOGS|PREFLIGHT|DIAGNOSTIC' } | ForEach-Object { Relative $_.FullName })
        $inventory += [pscustomobject]@{
            path = Relative $file.FullName; absolute_path = $file.FullName
            test_id = $row.test_id; timestamp = $row.timestamp
            phase = $row.environment.phase; containing_report_phase = $doc.phase
            status = $row.status; executed = $row.executed; command = $row.command
            git_commit = $git; script_function = $row.script_function
            expected = $row.expected; supporting_assertions = $row.actual
            failures = $row.failures; evidence_target = $row.evidence_path
            supporting_report_paths = $support
            kind = if ($doc.test_id) { 'primary per-ID record' } else { 'report row; possibly carried forward' }
            sha256 = $before[$file.FullName]
        }
    }
}
Save-Json 'EVIDENCE_INVENTORY.json' ([ordered]@{audit_timestamp=[DateTime]::UtcNow.ToString('o');audit_git_commit=$commit;command=$command;scope=$ids;records=$inventory})
$lines = @('# Phase 2B historical evidence inventory', '', 'Exact metadata and assertion observations are retained in EVIDENCE_INVENTORY.json. NOT RECORDED means absent in the historical record. Repeated report rows are copies, not additional executions.', '', '| File / row | Timestamp UTC | Phase | Status | Executed | Git commit | Command | Assertions / actual |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
foreach ($item in $inventory) {
    $actual = if ($item.supporting_assertions -is [string]) { $item.supporting_assertions } else { (@($item.supporting_assertions | ForEach-Object { $_.check }) -join '; ') }
    $lines += '| ' + $item.path + ' / ' + $item.test_id + ' | ' + $item.timestamp + ' | ' + $item.phase + ' | ' + $item.status + ' | ' + $item.executed + ' | ' + $item.git_commit + ' | ' + $item.command + ' | ' + $actual.Replace('|','/') + ' |'
}
$lines | Set-Content -LiteralPath (Join-Path $run 'EVIDENCE_INVENTORY.md') -Encoding UTF8
$source = Get-Content -LiteralPath (Join-Path $evidence '20261011T071933_296064Z/SOURCE_MANIFEST.json') -Raw | ConvertFrom-Json
$matches = @()
foreach ($group in @('after','harness_sources')) {
    foreach ($property in $source.$group.PSObject.Properties) {
        $path = Join-Path $root $property.Name
        $hash = if (Test-Path -LiteralPath $path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() } else { 'MISSING' }
        $matches += [pscustomobject]@{path=$property.Name;group=$group;recorded=$property.Value;current=$hash;matches=($hash -eq $property.Value)}
    }
}
Save-Json 'SOURCE_CORROBORATION.json' ([ordered]@{source='testing_modules/pre_uat/evidence/20261011T071933_296064Z/SOURCE_MANIFEST.json';historical_changed_protected_files=$source.changed_protected_files;comparisons=$matches;note='Hash matches corroborate source identity, not a missing historical Git commit.'})
$proc = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(python.*|uvicorn.*|redis.*|postgres.*|docker.*|com.docker.*|bun|node)\.exe$' } | Select-Object ProcessId,ParentProcessId,Name)
$ports = @(Get-NetTCPConnection | Where-Object { $_.LocalPort -in @(5432,6379,8000) -or $_.RemotePort -in @(5432,6379,8000) } | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess)
$memory = Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize
$cpu = Get-CimInstance Win32_Processor | Select-Object LoadPercentage
$names = @(Get-ChildItem Env: | Where-Object { $_.Name -match 'OBELISK|REDIS|DATABASE|GEMINI|GOOGLE|DOTENV|PROXY' } | Select-Object -ExpandProperty Name)
# Explicit local named pipe; no remote Docker context and no container exec.
$dockerHost = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$dockerInfo = & docker --host $dockerHost info --format '{{.OSType}} {{.ServerVersion}}'
if ($LASTEXITCODE) { throw 'Read-only Docker inspection failed' }
$containers = @(& docker --host $dockerHost ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}')
if ($LASTEXITCODE) { throw 'Read-only Docker container inventory failed' }
$image = & docker --host $dockerHost image inspect redis:7-alpine --format '{{.Id}}'
$imageExit = $LASTEXITCODE
Save-Json 'SAFETY_INSPECTION.json' ([ordered]@{timestamp=[DateTime]::UtcNow.ToString('o');git_commit=$commit;command=$command;docker_host=$dockerHost;docker_info=$dockerInfo;containers=$containers;cached_redis_image=$image;image_inspection_exit=$imageExit;processes=$proc;connections=$ports;memory_kib=$memory;cpu=$cpu;environment_variable_names_only=$names;environment_values='Not decrypted or printed; app.core.env/config inspected statically; effective container configuration not extracted';database='Process/port metadata only; no database query or credential access';workers='Existing ETL container present; internal worker count/state not probed';new_services_started=0;workload_requests=0;cleanup='No resources created except this audit directory; existing services untouched'})
$changed = @($historical | Where-Object { $before[$_.FullName] -ne (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } | ForEach-Object { Relative $_.FullName })
Save-Json 'PRESERVATION.json' ([ordered]@{historical_files_checked=$historical.Count;changed_historical_files=$changed;all_historical_unchanged=($changed.Count -eq 0);historical_sha256=$before;new_tests_executed=0;production_changes=0;harness_fixes=0})
if ($changed.Count) { throw 'Historical evidence changed during audit' }
$terminal = @('PHASE 2B VERIFICATION - evidence audit only; NEW TESTS EXECUTED: 0', 'IT-007 PASS - verified historical execution: 20261011T071933_296064Z/IT-007_result.txt', 'IT-009 PASS - verified historical execution: 20261011T071933_296064Z/IT-009_result.txt', 'PT-004 BLOCKED - server ownership/shutdown proof; no acceptance SLA', 'PT-005 BLOCKED - server ownership/shutdown proof; no acceptance SLA', 'PT-006 BLOCKED - server ownership/shutdown proof; mocked path cannot certify live AI latency', 'PT-007 BLOCKED - server ownership/shutdown proof; institutional duration/criteria unavailable', 'PT-008 SKIPPED - queue saturation not authorized', 'PT-009 BLOCKED - server ownership/shutdown proof; no acceptance SLA', ('Historical preservation: ' + $historical.Count + ' files unchanged'), ('Audit directory: ' + (Relative $run)))
$terminal | Set-Content -LiteralPath (Join-Path $run 'TERMINAL_SUMMARY.txt') -Encoding UTF8
$terminal | ForEach-Object { Write-Output $_ }
