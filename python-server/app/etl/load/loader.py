import asyncio
from typing import Any

from app.etl.abstracts import Loader
from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment


class DummyLoader(Loader):
    async def load(self, payload: Any) -> dict:
        # payload is a tuple of (header, records)
        header, records = payload
        if not isinstance(header, ClassRecordHeader) or not isinstance(records, list):
            raise TypeError(f"Expected (ClassRecordHeader, list), got {type(header)}, {type(records)}")

        await asyncio.sleep(0.05)
        return {
            "status": "ok",
            "received_records": len(records),
            "header": header.model_dump(),
            "attainments": [record.model_dump() for record in records],
        }
