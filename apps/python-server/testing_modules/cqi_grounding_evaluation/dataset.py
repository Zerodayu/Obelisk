"""
Benchmark dataset for CQI Narrative Grounding Evaluation.
Contains test payloads and pre-recorded reference outputs for offline replay.
"""

from typing import Any, Dict, List

BENCHMARK_CASES: List[Dict[str, Any]] = [
    {
        "id": "CASE-BSIT-CLO1-GAP",
        "description": "BSIT Program: CLO1 below 75% target with loop reassessment.",
        "payload": {
            "program_term": {
                "program_code": "BSIT",
                "program_name": "BS in Information Technology",
                "term_label": "SY 2025-2026, 1st Sem",
                "academic_year": "2025-2026",
            },
            "counts": {
                "enrolled_count": 50,
                "assessed_count": 48,
            },
            "outcomes": [
                {
                    "outcome_type": "CLO",
                    "outcome_code": "CLO1",
                    "target_pct": 75.0,
                    "direct_pct": 65.0,
                    "indirect_pct": 80.0,
                    "composite_pct": 69.5,
                    "is_complete": True,
                    "prior_cycle_composite_pct": 72.0,
                    "status": "NOT MET",
                },
                {
                    "outcome_type": "CLO",
                    "outcome_code": "CLO2",
                    "target_pct": 75.0,
                    "direct_pct": 82.0,
                    "indirect_pct": 85.0,
                    "composite_pct": 82.9,
                    "is_complete": True,
                    "prior_cycle_composite_pct": 80.0,
                    "status": "MET",
                },
            ],
            "cqi_entries": [
                {
                    "outcome_code": "CLO1",
                    "status": "NOT MET",
                    "loop_status": "OPEN_REASSESS",
                    "is_escalated": False,
                    "intervention": "Implement supplemental laboratory coding workshops.",
                    "named_owner": "Course Coordinator",
                    "timeline": "Within 4 weeks",
                    "kpi": "Achieve 75.0% cohort attainment next cycle",
                    "root_cause_category": "3-Assessment Design",
                }
            ],
        },
        "recorded_output": {
            "summary": "Cohort attainment in CLO1 fell below the 75.0% target for the term, while CLO2 met the threshold at 82.9%.",
            "recommendations": [
                {
                    "problem": "Performance in CLO1 is below the expected institutional benchmark.",
                    "evidence_fact_ids": [
                        "fact_clo_CLO1_target",
                        "fact_clo_CLO1_composite",
                        "fact_clo_CLO1_status",
                    ],
                    "intervention": "Implement supplemental laboratory coding workshops and align practical rubric assessments.",
                    "responsible_role": "Faculty",
                    "timeline": "Within 4 weeks",
                    "success_indicator": "Achievement of the 75.0% composite target in the subsequent evaluation cycle.",
                    "target": 75.0,
                    "verification_method": "Midterm laboratory rubrics and final departmental exam results.",
                }
            ],
            "possible_contributing_factors": [
                {
                    "hypothesis": "Practical assessment rubrics in introductory laboratory modules may not fully evaluate formative programming fundamentals.",
                    "root_cause_category": "3-Assessment Design",
                    "evidence_fact_ids": [
                        "fact_clo_CLO1_direct",
                        "fact_cqi_CLO1_1_root_cause_category",
                    ],
                }
            ],
            "pattern": {
                "description": "Direct assessment attainment (65.0%) is notably lower than student indirect survey satisfaction (80.0%).",
                "evidence_fact_ids": [
                    "fact_clo_CLO1_direct",
                    "fact_clo_CLO1_indirect",
                ],
            },
            "data_limitations": [],
        },
    },
    {
        "id": "CASE-BSCS-ALL-MET",
        "description": "BSCS Program: All outcomes met targets, maintaining current practice.",
        "payload": {
            "program_term": {
                "program_code": "BSCS",
                "program_name": "BS in Computer Science",
                "term_label": "SY 2025-2026, 1st Sem",
                "academic_year": "2025-2026",
            },
            "counts": {
                "enrolled_count": 35,
                "assessed_count": 35,
            },
            "outcomes": [
                {
                    "outcome_type": "CLO",
                    "outcome_code": "CLO1",
                    "target_pct": 70.0,
                    "direct_pct": 85.0,
                    "indirect_pct": 90.0,
                    "composite_pct": 86.5,
                    "is_complete": True,
                    "status": "MET",
                }
            ],
            "cqi_entries": [
                {
                    "outcome_code": "CLO1",
                    "status": "MET",
                    "loop_status": "CLOSED",
                    "is_escalated": False,
                    "intervention": "Maintain current pedagogical delivery.",
                    "named_owner": "Faculty Lead",
                    "kpi": "Maintain attainment above 70.0%",
                    "root_cause_category": "2-Instruction & Pedagogy",
                }
            ],
        },
        "recorded_output": {
            "summary": "All assessed learning outcomes have successfully met their target attainment benchmarks.",
            "recommendations": [
                {
                    "problem": "Sustain high attainment consistency across future instructional terms.",
                    "evidence_fact_ids": [
                        "fact_clo_CLO1_target",
                        "fact_clo_CLO1_composite",
                        "fact_clo_CLO1_status",
                    ],
                    "intervention": "Maintain current practice and continue regular peer teaching reviews.",
                    "responsible_role": "Faculty",
                    "timeline": "To be set by Program Chair",
                    "success_indicator": "Attainment remains at or above the 70.0% benchmark.",
                    "target": 70.0,
                    "verification_method": "Semester-end departmental outcomes report.",
                }
            ],
            "possible_contributing_factors": [],
            "pattern": None,
            "data_limitations": [],
        },
    },
]
