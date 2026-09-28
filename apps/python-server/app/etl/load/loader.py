import asyncio
from typing import Any

from app.etl.abstracts import Loader
from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment


class DummyLoader(Loader):
    async def load(self, payload: Any) -> dict:
        if isinstance(payload, tuple) and len(payload) >= 6:
            header, records, clo_plo_mapping, section, section_extraction, setup = payload[:6]
        elif isinstance(payload, tuple) and len(payload) >= 3:
            header, records, clo_plo_mapping = payload[:3]
            section = getattr(header, "_section_data", None)
            section_extraction = getattr(header, "_section_extraction", "missing_sheet")
            setup = getattr(header, "_setup_data", None)
        else:
            raise TypeError(f"Expected at least 3-tuple, got {type(payload)}")

        if not isinstance(header, ClassRecordHeader) or not isinstance(records, list):
            raise TypeError(f"Expected (ClassRecordHeader, list, ...), got {type(header)}, {type(records)}")

        section_dict = (
            section.model_dump()
            if hasattr(section, "model_dump")
            else (
                section
                if isinstance(section, dict)
                else {
                    "code": None,
                    "program": None,
                    "year_level": None,
                    "section_letter": None,
                    "raw": None,
                }
            )
        )

        setup_dict = (
            setup.model_dump()
            if hasattr(setup, "model_dump")
            else (
                setup
                if isinstance(setup, dict)
                else {
                    "course_code": None,
                    "course_title": None,
                    "term": None,
                    "faculty_name": None,
                    "program": None,
                }
            )
        )

        await asyncio.sleep(0.05)
        return {
            "status": "ok",
            "received_records": len(records),
            "header": header.model_dump(),
            "section": section_dict,
            "section_extraction": section_extraction,
            "setup": setup_dict,
            "attainments": [record.model_dump() for record in records],
            "clo_plo_mapping": clo_plo_mapping,
        }
