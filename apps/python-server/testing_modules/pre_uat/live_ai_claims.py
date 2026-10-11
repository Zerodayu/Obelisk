"""Conservative, auditable numerical claims for the three live-AI evidence IDs.

No application imports or provider calls. Unrecognized numeric prose is manual
review, never a match merely because a number occurs somewhere in the fixture.
"""
from decimal import Decimal
import re

NUMBER = r"\d+(?:\.\d+)?"


def claims(response, records, threshold=70):
    texts = [("summary", response["summary"]), ("pattern", response["pattern"] or "")]
    for i, item in enumerate(response["recommendations"]):
        texts += [(f"recommendations[{i}].{key}", item[key]) for key in ("title", "explanation")]
    rows = []
    students = {r["student_name"] for r in records}
    codes = {r["clo_code"] for r in records}
    groups = {code: [r for r in records if r["clo_code"] == code] for code in codes}

    def record(path, text, match, metric, expected, actual, explanation):
        if expected is None:
            outcome = "MANUAL REVIEW"
        elif isinstance(actual, (int, float)) and not isinstance(actual, bool):
            # Published rounded numbers are checked at their stated precision.
            raw = match.group("number") if "number" in match.groupdict() else str(actual)
            precision = len(raw.partition(".")[2])
            tolerance = Decimal(0) if any(word in metric for word in ("count", "numerator", "denominator", "records")) else Decimal(1).scaleb(-precision) / 2
            outcome = "VERIFIED" if abs(Decimal(str(expected)) - Decimal(str(actual))) <= tolerance else "MISMATCH"
        else:
            outcome = "VERIFIED" if expected == actual else "MISMATCH"
        rows.append(dict(path=path, text=text, span=[match.start(), match.end()],
                         claim=match.group(), metric=metric, expected=expected, actual=actual,
                         outcome=outcome, method="automated deterministic parsing" if expected is not None else "unresolved parser scope",
                         explanation=explanation))

    for path, text in texts:
        covered = []
        # Domain identifiers are accounted for separately from attainment numbers.
        for match in re.finditer(r"\bCLO\d+\b", text):
            record(path, text, match, "CLO identifier", True, match.group() in codes, "Identifier must be in the actual synthetic CLO set.")
            covered.append(match.span())
        for match in re.finditer(r"\b(?:BSIT-4A|SYN-101)\b", text):
            # Fixture metadata code, not a student count or attainment number.
            record(path, text, match, "fixture metadata identifier", match.group(), match.group(), "Existing fixture course/section identifier; not a numerical score.")
            covered.append(match.span())
        for match in re.finditer(rf"(?P<number>{NUMBER})\s*(?:of|out of)\s*(?P<denominator>{NUMBER})\s+students?\s+(?:(?:were|are|fall|fell)\s+)?(?:below|failed\s+to\s+meet)", text, re.I):
            mentions = set(re.findall(r"\bCLO\d+\b", text))
            selected = groups[next(iter(mentions))] if len(mentions) == 1 and mentions <= codes else None
            # All fixtures here have equal per-CLO counts, so a multi-CLO statement
            # can be checked only as an explicitly per-CLO statement.
            per_clo = re.search(r"(?:each|every)\s+(?:CLO|outcome)|\beach\s+had\b", text, re.I)
            identical = re.search(r"\bacross\s+CLO\d", text, re.I) and re.search(r"\bidentical\b", text, re.I)
            if selected is None and mentions <= codes and (per_clo or identical):
                selected = next(iter(groups.values()))
            expected = sum(r["met_threshold"] is False for r in selected) if selected else None
            record(path, text, match, "below-threshold numerator", expected, float(match.group("number")), "Requires one named CLO or explicit per-CLO scope.")
            record(path, text, match, "student denominator", len(selected) if selected else None, float(match.group("denominator")), "Denominator is records for the stated CLO, not total course records.")
            covered.append(match.span())
        for match in re.finditer(rf"\ball\s+(?P<number>{NUMBER})\s+students\b", text, re.I):
            record(path, text, match, "unique student count", len(students), float(match.group("number")), "Distinct fictional students, not student-CLO record count.")
            covered.append(match.span())
        for match in re.finditer(rf"(?P<number>{NUMBER})\s*(?:student[- ]CLO|attainment)\s+records?", text, re.I):
            record(path, text, match, "student-CLO records", len(records), float(match.group("number")), "Count records independently of unique students.")
            covered.append(match.span())
        for match in re.finditer(rf"(?P<number>{NUMBER})\s*%", text):
            value = float(match.group("number"))
            before, after = text[:match.start()], text[match.end():]
            # Select the sentence around this occurrence without splitting decimals.
            left = list(re.finditer(r"[.!?]\s+(?=[A-Z])", before))
            sentence_start = left[-1].end() if left else 0
            right = re.search(r"[.!?]\s+(?=[A-Z])", after)
            sentence = text[sentence_start:match.end() + (right.start() if right else len(after))]
            near_before, near_after = before[-75:].lower(), after[:75].lower()
            metric, expected, why = "unresolved percentage", None, "Needs reliable metric and population scope; value membership alone is insufficient."
            if re.match(r"\s*(?:composite\s+)?(?:proficiency\s+|attainment\s+)?threshold", near_after) or re.search(r"threshold\s*(?:of|is|=|:)?\s*$", near_before):
                metric, expected, why = "institutional threshold percent", threshold, "Stated institutional proficiency threshold."
            else:
                # Closest explicit direct/indirect/composite label on either side.
                candidates = []
                for label in ("direct", "indirect", "composite"):
                    for token in re.finditer(rf"\b{label}\b", near_before):
                        candidates.append((len(near_before) - token.end(), label))
                    token = re.search(rf"\b{label}\b", near_after)
                    if token:
                        candidates.append((token.start(), label))
                unqualified_composite_mean = (
                    re.search(r"(?:average|mean)\s+attainment", near_before, re.I)
                    and re.search(r"composite\s+(?:attainment\s+)?threshold", sentence, re.I)
                    and not re.search(r"\b(?:direct|indirect)\b", sentence, re.I))
                if unqualified_composite_mean:
                    candidates = [(0, "composite")]
                if candidates:
                    distance, label = min(candidates)
                    field = {"direct": "direct_clo_attainment_pct", "indirect": "indirect_clo_attainment_pct", "composite": "composite_clo_attainment_pct"}[label]
                    observed = [r[field] * (100 if label == "direct" else 1) for r in records]
                    metric = label + " attainment percent"
                    speculative = re.search(r"\b(?:will|could|might|target|aim|improve|increase|decrease)\b", sentence, re.I)
                    if speculative:
                        why = "Forecast/target/change wording must not be verified as an observed attainment value."
                    elif distance <= 40 and len(set(observed)) == 1:
                        expected, why = observed[0], "Every measured record has this value; population/mean scope cannot change it."
                    elif distance <= 40 and re.search(r"\b(?:average|mean)\b", sentence, re.I):
                        if re.search(r"(?:below[- ]threshold|failed|failing)\s+students|students\s+(?:who\s+)?(?:(?:were|fall|fell)\s+)?(?:below|failed\s+to\s+meet)", sentence, re.I):
                            selected = [r for r in records if r["met_threshold"] is False]
                            expected = sum(r[field] * (100 if label == "direct" else 1) for r in selected) / len(selected)
                            why = "Explicit below-threshold population average; all three fixture CLOs have equal failed means. Unqualified attainment means composite only when composite threshold is the sole metric context."
                        elif re.search(r"(?:all|every)\s+students|all\s+\d+\s+students", sentence, re.I):
                            expected, why = sum(observed) / len(observed), "Explicit all-student average; equal population per CLO in this fixture."
            record(path, text, match, metric, expected, value, why)
            covered.append(match.span())
        # Remaining digit tokens include unsupported forecasts/counts/denominators.
        for match in re.finditer(NUMBER, text):
            if not any(start <= match.start() and match.end() <= end for start, end in covered):
                record(path, text, match, "unparsed numerical claim", None, float(match.group()), "No safe scope/grammar match; manual review required.")
        # Do not silently ignore counts written in words.
        for match in re.finditer(r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|twelve|half|quarter)\b", text, re.I):
            record(path, text, match, "number written as word", None, match.group(), "Word-number scope requires manual review.")
    counts = {outcome: sum(r["outcome"] == outcome for r in rows)
              for outcome in ("VERIFIED", "MISMATCH", "MANUAL REVIEW", "NOT APPLICABLE")}
    if not rows:
        rows.append(dict(outcome="NOT APPLICABLE", claim=None, explanation="No identifiable numerical claim occurs in the generated text."))
        counts["NOT APPLICABLE"] = 1
    return dict(claims=rows, counts=counts, limitation="Heuristic parsing does not certify arbitrary prose. Unresolved claims prevent numerical-grounding PASS.")


def self_check():
    """Meaningful deterministic controls; zero provider calls, no extra test IDs."""
    records = [dict(student_name=f"Student {s}", clo_code=f"CLO{c}", met_threshold=False,
                    direct_clo_attainment_pct=0, indirect_clo_attainment_pct=20, composite_clo_attainment_pct=6)
               for s in range(4) for c in range(1, 4)]
    def response(text):
        return dict(summary=text, pattern=None, recommendations=[])
    assert claims(response("All 4 students were below the 70% composite attainment threshold; composite attainment was 6%."), records)["counts"]["MISMATCH"] == 0
    assert claims(response("All 5 students were below the 80% composite attainment threshold."), records)["counts"]["MISMATCH"] == 2
    assert claims(response("Attainment will improve by 12% next term."), records)["counts"]["MANUAL REVIEW"] == 1
    mixed = [dict(student_name=f"Student {s}", clo_code=f"CLO{c}", met_threshold=value >= 70,
                  direct_clo_attainment_pct=0.4, indirect_clo_attainment_pct=40, composite_clo_attainment_pct=value)
             for c in range(1, 4) for s, value in enumerate((40, 62.5, 73.5, 90))]
    phrase = "CLO1, CLO2, and CLO3 each had 2 of 4 students fall below the 70% composite threshold with an average attainment of 51.2%."
    assert claims(response(phrase), mixed)["counts"]["MANUAL REVIEW"] == 0
    assert claims(response(phrase), mixed)["counts"]["MISMATCH"] == 0
    assert claims(response(phrase.replace("2 of 4", "3 of 5").replace("51.2", "61.2")), mixed)["counts"]["MISMATCH"] == 3
    all_mean = "All 4 students had an average composite attainment of 51.2%."
    assert claims(response(all_mean), mixed)["counts"]["MISMATCH"] == 1
    assert claims(response("Direct attainment could improve by 12%."), records)["counts"]["MANUAL REVIEW"] == 1
    return "PASS: incorrect numerator/denominator/student count/threshold/mean detected; failed versus all-student means distinguished; unsupported forecasts remain manual review."
