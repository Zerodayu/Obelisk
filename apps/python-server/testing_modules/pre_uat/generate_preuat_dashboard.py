"""Consolidate saved Pre-UAT evidence; never import OBELISK or execute tests.

Usage: python -B testing_modules/pre_uat/generate_preuat_dashboard.py [--png]
Only reports are written, exclusively under dashboard_outputs/<UTC timestamp>.
PNG export uses an already installed Pillow; no packages are installed.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import textwrap

TITLE = "CONSOLIDATED HISTORICAL RESULTS — NOT A NEW TEST RUN"
BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent
EVIDENCE = BASE / "evidence"
IDS = ([f"UT-{n:03}" for n in range(1, 11)] + ["UT-014", "IT-007", "IT-009"]
       + [f"ST-AI-{n:03}" for n in range(1, 8)]
       + [f"PT-{n:03}" for n in range(4, 10)])
LIVE_IDS = {"ST-AI-001", "ST-AI-002", "ST-AI-004"}
INTEGRATION_RUN = "20261011T071933_296064Z"
PT8_RUN = "20261011T063734_111127Z"
MANIFESTS = ("SOURCE_MANIFEST.json", "PRESERVATION.json", "ISOLATION.json")


def stamp(value):
    """Use recorded aware timestamps only, never directory names or mtime."""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except (AttributeError, ValueError, TypeError):
        return None


def clean(value):
    # No terminal control sequences from evidence are emitted.
    return re.sub(r"[\x00-\x1f\x7f-\x9f]", " ", str(value))


def relative(path):
    return path.relative_to(ROOT).as_posix()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def confined(path, parent):
    if path.is_symlink() or not path.resolve().is_relative_to(parent.resolve()):
        raise ValueError(f"Refusing evidence/output path outside its root: {path.name}")


def inventory():
    records, fingerprints, errors = [], {}, []
    confined(EVIDENCE, ROOT)
    for path in sorted(EVIDENCE.rglob("*_result.txt")):
        test_id = path.name.removesuffix("_result.txt")
        if test_id not in IDS:
            continue
        try:
            confined(path, EVIDENCE)
            raw = path.read_bytes()
            fingerprints[relative(path)] = digest(raw)
            data = json.loads(raw.decode("utf-8-sig"))
            if not isinstance(data, dict) or data.get("test_id") != test_id:
                raise ValueError("filename/test_id mismatch or non-object result")
            records.append((path, data))
        except (OSError, ValueError) as exc:
            errors.append({"test_id": test_id, "path": relative(path), "error": clean(exc)})
    # Read only relevant manifests adjacent to the assigned result records.
    manifests = {}
    for parent in sorted({path.parent for path, _ in records}):
        for name in MANIFESTS:
            path = parent / name
            if not path.exists():
                continue
            try:
                confined(path, EVIDENCE)
                raw = path.read_bytes()
                fingerprints[relative(path)] = digest(raw)
                saved = json.loads(raw.decode("utf-8-sig"))
                if not isinstance(saved, dict):
                    raise ValueError("provenance manifest must be a JSON object")
                manifests.setdefault(relative(parent), []).append(relative(path))
                problems = []
                if saved.get("changed_protected_files") or saved.get("changed_files"):
                    problems.append("manifest records changes to protected files")
                claims_pass = any(p.parent == parent and d.get("status") == "PASS"
                                  and d.get("executed") is True for p, d in records)
                if name == "ISOLATION.json" and (
                        (saved.get("verified") is not True and claims_pass)
                        or saved.get("network_violations")
                        or saved.get("originals_unchanged") is False):
                    problems.append("isolation manifest records unverified isolation or violations")
                if problems:
                    errors.append({"test_id": None, "path": relative(path),
                                   "error": "; ".join(problems)})
            except (OSError, ValueError) as exc:
                errors.append({"test_id": None, "path": relative(path), "error": clean(exc)})
    return records, manifests, fingerprints, errors


def placeholder(data):
    return (data.get("executed") is False and data.get("status") == "SKIPPED"
            and "phase 2b not authorized" in str(data.get("actual", "")).lower())


def live(data):
    return (data.get("executed") is True
            and "gemini" in str(data.get("provider", "")).lower()
            and (data.get("live_api_called") is True
                 or (str(data.get("execution_type", "")).startswith("saved live")
                     and bool(data.get("source_execution_timestamp")
                              or data.get("source_execution_timestamps")))))


def sort_time(record):
    data = record[1]
    return (stamp(data.get("evidence_processing_timestamp"))
            or stamp(data.get("timestamp"))
            or datetime.min.replace(tzinfo=timezone.utc))


def select(test_id, all_records, manifests, errors):
    history = [r for r in all_records if r[1]["test_id"] == test_id]
    notes, issues = [], []
    if test_id.startswith("IT-"):
        candidates = [r for r in history if r[0].parent.name == INTEGRATION_RUN]
        notes.append("Verified historical Phase 2B-1; Phase 2A placeholders excluded.")
        if any(r[1].get("executed") is True and r not in candidates for r in history):
            issues.append("Additional executed integration evidence requires independent review.")
    elif test_id in LIVE_IDS:
        candidates = [r for r in history if live(r[1])]
        notes.append("Saved live AI evidence; no provider calls by this utility.")
    elif test_id.startswith("PT-"):
        candidates = [r for r in history if not placeholder(r[1])]
        if test_id == "PT-008" and not candidates:
            candidates = [r for r in history if r[0].parent.name == PT8_RUN]
        notes.append("No performance acceptance measurement; queue saturation is not authorized."
                     if test_id == "PT-008" else "Workload blocked: server shutdown/isolation proof missing or invalid.")
    else:
        candidates = [r for r in history if r[1].get("executed") is True]
        if test_id.startswith("ST-AI-"):
            notes.append("Deterministic/mock AI evidence; not a live provider test.")
    row = {"test_id": test_id, "status": "REVIEW", "original_status": None,
           "executed": None, "execution_timestamp": None, "record_timestamp": None,
           "evidence_path": None, "notes": notes, "review_flags": issues,
           "history_count": len(history)}
    if not candidates:
        issues.append("Required evidence missing; no status inferred.")
        return row
    candidates.sort(key=sort_time)
    path, data = candidates[-1]
    status = data.get("status")
    executed = data.get("executed")
    row.update(original_status=status, executed=executed,
               record_timestamp=data.get("timestamp"), evidence_path=relative(path),
               evidence_absolute_path=str(path.resolve()), objective=clean(data.get("objective", "")),
               phase=data.get("environment", {}).get("phase"),
               git_commit=data.get("git_commit") or data.get("environment", {}).get("git_head"),
               processing_timestamp=data.get("evidence_processing_timestamp"),
               source_execution_timestamps=data.get("source_execution_timestamps"),
               source_execution_timestamp=data.get("source_execution_timestamp"),
               source_evidence=data.get("source_evidence"),
               execution_type=data.get("execution_type"),
               supporting_manifests=manifests.get(relative(path.parent), []))
    if executed is True:
        row["execution_timestamp"] = data.get("source_execution_timestamp") or data.get("timestamp")
    if not row["git_commit"]:
        notes.append("Historical execution Git commit not recorded.")
    if data.get("manual_review_required"):
        notes.append("Academic quality requires manual review; automated PASS does not certify it.")
    if test_id == "ST-AI-004":
        notes.append("Timestamp is saved-response numerical validation; provider timestamps listed separately.")
    if status not in {"PASS", "FAIL", "BLOCKED", "SKIPPED"}:
        issues.append("Unknown historical status.")
    if executed not in (True, False) or not isinstance(executed, bool):
        issues.append("Missing/invalid executed flag.")
    if stamp(data.get("timestamp")) is None:
        issues.append("Missing/invalid aware evidence timestamp.")
    if status in {"PASS", "FAIL"} and executed is not True:
        issues.append("PASS/FAIL contradicts execution flag.")
    if status == "PASS" and (data.get("failures") or not data.get("actual")):
        issues.append("PASS lacks actual assertions or contains failures.")
    if test_id.startswith("IT-") and (status != "PASS" or executed is not True
                                      or row["phase"] != "2B-1"):
        issues.append("Pinned integration evidence does not meet verified Phase 2B-1 identity.")
    if test_id.startswith("IT-") and not all(
            relative(path.parent / name) in row["supporting_manifests"]
            for name in ("SOURCE_MANIFEST.json", "ISOLATION.json")):
        issues.append("Verified integration source/isolation provenance is missing.")
    if test_id in LIVE_IDS:
        numerical = data.get("numerical_validation") or {}
        counts = numerical.get("counts", numerical)
        if counts.get("MISMATCH") or counts.get("MANUAL REVIEW"):
            issues.append("Saved live numerical validation contains unresolved claims.")
        provider_times = ([data["source_execution_timestamp"]]
                          if data.get("source_execution_timestamp") else
                          list((data.get("source_execution_timestamps") or {}).values()))
        if not provider_times or any(stamp(value) is None for value in provider_times):
            issues.append("Original live provider execution timestamp missing/invalid.")
        if data.get("source_evidence"):
            source = ROOT / data["source_evidence"]
            if not source.resolve().is_relative_to(EVIDENCE.resolve()) or not source.is_file():
                issues.append("Saved live source reference missing or outside evidence root.")
    if test_id.startswith("PT-"):
        expected = "SKIPPED" if test_id == "PT-008" else "BLOCKED"
        if status != expected or executed is not False:
            issues.append("New performance status needs independent acceptance/authorization review; not promoted.")
    for other in candidates[:-1]:
        if sort_time(other) == sort_time((path, data)) and (
                other[1].get("status"), other[1].get("executed")) != (status, executed):
            issues.append("Contradictory results at the same recorded timestamp.")
    if any(e.get("test_id") == test_id for e in errors):
        issues.append("Unreadable/malformed historical result requires review.")
    if any(e.get("test_id") is None and Path(e["path"]).parent.as_posix() == relative(path.parent)
           for e in errors):
        issues.append("Adjacent provenance manifest records an error or preservation/isolation contradiction.")
    row["status"] = "REVIEW" if issues else status
    return row


def terminal(rows, generated, unchanged):
    counts = Counter(r["status"] for r in rows)
    lines = [TITLE, f"Generated: {generated} (consolidation time only)",
             f"Assigned IDs: {len(rows)} | " + " | ".join(f"{k}: {counts[k]}" for k in
                 ("PASS", "FAIL", "BLOCKED", "SKIPPED", "REVIEW")),
             "Execution timestamps below are copied from evidence; '-' means NOT EXECUTED.",
             "Paths are relative to repository root. No tests, services or provider calls executed.", ""]
    for row in rows:
        lines.append(f"{row['test_id']:<10} {row['status']:<8} executed={str(row['executed']).lower():<5} "
                     f"execution={row['execution_timestamp'] or '-'}")
        lines.append(f"  {row['evidence_path'] or 'MISSING EVIDENCE'}")
        if not row["execution_timestamp"]:
            lines.append(f"  Recorded: {row['record_timestamp'] or 'not recorded'} (not an execution time)")
        if row.get("processing_timestamp"):
            lines.append(f"  Saved validation: {row['processing_timestamp']}")
        if row.get("source_execution_timestamps"):
            lines.append("  Provider executions: " + json.dumps(row["source_execution_timestamps"], sort_keys=True))
        for issue in row["review_flags"]:
            lines.append(f"  REVIEW: {clean(issue)}")
    lines.extend(["", "IT: verified Phase 2B-1; later Phase 2A placeholders do not replace executed PASS.",
                  "AI: 001/002 saved live generation + validation; 004 saved-live numerical validation.",
                  "AI academic quality still requires manual review. Other AI cases use deterministic mocks.",
                  "PT: five BLOCKED, PT-008 SKIPPED; no acceptance workloads or metrics claimed.",
                  f"Evidence read by utility unchanged: {unchanged}. Full limitations: README.md / DASHBOARD.json."])
    return "\n".join(lines) + "\n"


def png(output, rows, generated):
    """Render a static export from exactly the same rows, using Pillow's bundled font."""
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.load_default(size=20)
    heading = ImageFont.load_default(size=24)
    lines = [(TITLE, "#ffffff", True), (f"Generated {generated} | 26 assigned IDs | No new test run", "#cbd5e1", False)]
    colors = {"PASS": "#86efac", "FAIL": "#fca5a5", "BLOCKED": "#fcd34d", "SKIPPED": "#cbd5e1", "REVIEW": "#fca5a5"}
    for row in rows:
        lines.append((f"{row['test_id']}    {row['status']}    Executed: {row['executed']}    "
                      f"Execution: {row['execution_timestamp'] or 'NOT EXECUTED'}", colors[row["status"]], False))
        lines.extend((part, "#cbd5e1", False) for part in textwrap.wrap(row["evidence_path"] or "MISSING EVIDENCE", 140))
        if not row["execution_timestamp"]:
            lines.append((f"Record timestamp: {row['record_timestamp']} (not execution)", "#94a3b8", False))
        if row.get("processing_timestamp"):
            lines.append((f"Saved validation: {row['processing_timestamp']}", "#94a3b8", False))
        for key, value in (row.get("source_execution_timestamps") or {}).items():
            lines.append((f"Provider execution {key}: {value}", "#94a3b8", False))
        for issue in row["review_flags"]:
            lines.append((f"REVIEW: {issue}", "#fca5a5", False))
        lines.append(("", "#ffffff", False))
    lines.extend([(text, "#cbd5e1", False) for text in (
        "IT: verified Phase 2B-1. Phase 2A SKIPPED placeholders excluded.",
        "AI: saved live outputs/validation; academic quality requires manual review. Other AI cases: mocks.",
        "PT: five BLOCKED, PT-008 SKIPPED. No performance acceptance results.",
        "Missing historical commits remain disclosed in DASHBOARD.json. See README.md for limitations.")])
    width = max(1600, int(max(font.getlength(t) for t, _, _ in lines)) + 80)
    image = Image.new("RGB", (width, len(lines) * 30 + 48), "#0f172a")
    draw = ImageDraw.Draw(image)
    for index, (text, color, is_heading) in enumerate(lines):
        draw.text((24, 24 + index * 30), text, fill=color, font=heading if is_heading else font)
    image.save(output / "DASHBOARD.png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--png", action="store_true", help="Export PNG using existing Pillow (optional).")
    args = parser.parse_args()
    records, manifests, fingerprints, errors = inventory()
    rows = [select(test_id, records, manifests, errors) for test_id in IDS]
    # Compare exact input bytes again before claiming preservation. Never write evidence.
    changed = [name for name, sha in fingerprints.items()
               if not (ROOT / name).is_file() or digest((ROOT / name).read_bytes()) != sha]
    if changed:
        raise RuntimeError("Evidence changed during consolidation; no dashboard published: " + ", ".join(changed))
    generated = datetime.now(timezone.utc)
    output_root = BASE / "dashboard_outputs"
    confined(output_root, ROOT)
    output_root.mkdir(exist_ok=True)
    output = output_root / generated.strftime("%Y%m%dT%H%M%S_%fZ")
    output.mkdir(exist_ok=False)
    summary = terminal(rows, generated.isoformat(), True)
    (output / "DASHBOARD.txt").write_text(summary, encoding="utf-8")
    report = {"label": TITLE, "consolidation_timestamp": generated.isoformat(),
              "new_test_executions": 0, "counts": dict(Counter(r["status"] for r in rows)),
              "results": rows, "inventory_errors": errors}
    (output / "DASHBOARD.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    stream = io.StringIO(newline="")
    fields = ["test_id", "status", "original_status", "executed", "execution_timestamp", "record_timestamp", "evidence_path"]
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    (output / "DASHBOARD.csv").write_text(stream.getvalue(), encoding="utf-8")
    history = [{"path": relative(path), "test_id": data["test_id"], "status": data.get("status"),
                "executed": data.get("executed"), "timestamp": data.get("timestamp"),
                "processing_timestamp": data.get("evidence_processing_timestamp"),
                "phase2a_placeholder": placeholder(data)} for path, data in records]
    provenance = {"utility_sha256": digest(Path(__file__).read_bytes()),
                  "input_sha256": fingerprints, "inputs_unchanged": True,
                  "manifest_paths": manifests, "history": history,
                  "limitation": "Hashes prove inputs read here unchanged, not historical authenticity or current source equivalence."}
    (output / "PROVENANCE.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    png_status = "Not requested."
    if args.png:
        try:
            png(output, rows, generated.isoformat())
            png_status = "DASHBOARD.png generated from the same consolidated rows."
        except (ImportError, OSError, ValueError, TypeError) as exc:
            png_status = f"Optional PNG unavailable: {clean(exc)}. No dependency installed."
    readme = f"""# {TITLE}

Generated by `generate_preuat_dashboard.py{' --png' if args.png else ''}` at {generated.isoformat()}.
This is the consolidation timestamp, not an institutional test execution.

The utility reads assigned `*_result.txt` JSON records and adjacent SOURCE_MANIFEST,
PRESERVATION and ISOLATION manifests. It does not import application code, run tests,
start services, use Docker, access a database, or make provider requests. It writes
only new reports here; every input read was SHA-256 checked unchanged before export.
It does not read saved prompts or raw provider response artifacts.

Selection: 11 assigned UT, IT-007/009, seven ST-AI, and six PT IDs, each counted once.
Integration is pinned to the independently verified {INTEGRATION_RUN} Phase 2B-1
records. Later Phase 2A SKIPPED/not-authorized placeholders cannot supersede them.
Other deterministic cases use the latest recorded executed outcome (not file mtime).
AI-001/002/004 use the latest saved-live validation by recorded processing timestamp;
original provider timestamps remain distinct. AI-004's execution is numerical
validation of saved live output, not another provider call. Original provider artifact
references are disclosed in JSON, but raw provider files are not independently read.
Academic recommendation quality is not certified by automated PASS.

PT-004/005/006/007/009 retain genuine BLOCKED evidence; PT-008 retains SKIPPED.
Potential new performance outcomes are flagged REVIEW pending independent acceptance
and authorization verification. No invented thresholds or measurements are used.
Missing evidence, malformed records, same-time conflicting statuses and inconsistent
execution claims are REVIEW flags, not modified institutional results. Earlier failed
attempts followed by later executed results remain in PROVENANCE.json history.

DASHBOARD.txt is the genuine terminal text; DASHBOARD.json holds limitations and
source paths, DASHBOARD.csv supports form review, PROVENANCE.json inventories original
records/manifests and their hashes. {png_status}

These exports summarize stored assertions. They do not independently re-execute or
certify test behavior, authenticate historical evidence, prove current runtime safety,
resolve missing execution commits, or replace institutional sign-off. Missing historical
commit metadata is disclosed and never replaced with the dashboard generation commit.
Read original evidence and review flags before submission. No source result is edited.
To reproduce, run the utility with the existing Python interpreter and `-B`; each run
creates another uniquely timestamped directory under `dashboard_outputs/`.
"""
    (output / "README.md").write_text(readme, encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(summary, end="")
    print(f"Reports: {relative(output)}")
    print(png_status)
    if errors:
        print(f"Inventory issues: {len(errors)}; see DASHBOARD.json.")
    return 2 if errors or any(r["status"] == "REVIEW" for r in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
