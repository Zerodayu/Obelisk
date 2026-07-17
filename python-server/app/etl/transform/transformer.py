from app.etl.abstracts import Transformer
from typing import Any, Dict
import asyncio


class SimpleTransformer(Transformer):
    async def transform(self, extracted: Dict[str, Any]) -> Dict[str, Any]:
        # Placeholder normalization
        await asyncio.sleep(0.05)
        # pretend to normalize rows into JSON objects
        normalized = {"payloads": []}
        for sheet, rows in extracted.get("rows", {}).items():
            normalized["payloads"].append({"sheet": sheet, "records": rows})
        return {"normalized": normalized, "meta": extracted.get("meta")}

