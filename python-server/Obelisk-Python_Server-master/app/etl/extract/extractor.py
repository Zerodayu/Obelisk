from app.etl.abstracts import Extractor
from typing import Any, Dict
import asyncio


class ExcelExtractor(Extractor):
    async def extract(self, source: Any) -> Dict[str, Any]:
        # Placeholder implementation. In the future: openpyxl/pandas reading and validation
        await asyncio.sleep(0.05)  # simulate IO
        return {
            "sheets": ["Sheet1", "Sheet2"],
            "rows": {"Sheet1": [["A", "B"], [1, 2]], "Sheet2": [["X", "Y"], [3, 4]]},
            "meta": {"filename": getattr(source, "filename", str(source))},
        }

