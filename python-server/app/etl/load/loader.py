from app.etl.abstracts import Loader
from typing import Any, Dict
import asyncio


class DummyLoader(Loader):
    async def load(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Placeholder: would call external API, DB, or message bus
        await asyncio.sleep(0.05)
        return {"status": "ok", "received_records": len(payload.get("normalized", {}).get("payloads", []))}

