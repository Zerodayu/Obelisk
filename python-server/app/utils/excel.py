from typing import Any, Dict, List
import asyncio


async def list_sheets(path: str) -> List[str]:
    # Placeholder implementation; in future: openpyxl load_workbook
    await asyncio.sleep(0.01)
    return ["Sheet1", "Sheet2"]


async def read_rows(path: str, sheet_name: str) -> List[List[Any]]:
    # Placeholder; return fake rows
    await asyncio.sleep(0.01)
    return [["col1", "col2"], [1, 2], [3, 4]]


async def validate_headers(rows: List[List[Any]], expected: List[str]) -> Dict[str, Any]:
    # Very simple placeholder header check
    headers = rows[0] if rows else []
    missing = [h for h in expected if h not in headers]
    return {"valid": len(missing) == 0, "missing": missing}

