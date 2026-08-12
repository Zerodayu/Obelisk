from typing import Any, Dict, List


class OBELISKError(Exception):
    """Base exception for the application."""
    def to_dict(self) -> Dict[str, Any]:
        return {"error_type": self.__class__.__name__, "message": str(self)}


class InvalidWorkbook(OBELISKError):
    def __init__(self, file_path: str, underlying_error: str):
        self.file_path = file_path
        self.underlying_error = underlying_error
        message = f"Invalid workbook: Could not open or read '{file_path}'."
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": "InvalidWorkbook",
            "message": str(self),
            "details": {
                "file_path": self.file_path,
                "reason": self.underlying_error,
            },
        }


class InvalidTemplate(OBELISKError):
    def __init__(self, sheet_name: str, cell: str, expected: str, found: str):
        self.sheet_name = sheet_name
        self.cell = cell
        self.expected = expected
        self.found = found
        message = f"Invalid template in sheet '{sheet_name}': Cell {cell} did not match."
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": "InvalidTemplate",
            "message": str(self),
            "details": {
                "sheet_name": self.sheet_name,
                "cell": self.cell,
                "expected_value": self.expected,
                "found_value": self.found,
            },
        }


class MissingWorksheet(OBELISKError):
    def __init__(self, expected_sheet_name: str, available_sheets: List[str]):
        self.expected_sheet_name = expected_sheet_name
        self.available_sheets = available_sheets
        message = f"Missing required worksheet: '{expected_sheet_name}'."
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": "MissingWorksheet",
            "message": str(self),
            "details": {
                "expected_sheet_name": self.expected_sheet_name,
                "available_sheets": self.available_sheets,
            },
        }


class TransformationError(OBELISKError):
    def __init__(self, message: str, details: Dict[str, Any] | None = None):
        self.details = details or {}
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": "TransformationError",
            "message": str(self),
            "details": self.details,
        }


class LoaderError(OBELISKError):
    pass


class QueueOverloadedError(OBELISKError):
    def __init__(self, queue_size: int, max_size: int):
        self.queue_size = queue_size
        self.max_size = max_size
        message = "Job queue is full and cannot accept new jobs."
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": "QueueOverloadedError",
            "message": str(self),
            "details": {
                "queue_size": self.queue_size,
                "max_size": self.max_size,
            },
        }


class JobNotFound(OBELISKError):
    def __init__(self, job_id: str):
        self.job_id = job_id
        message = f"Job with ID '{job_id}' not found."
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_type": "JobNotFound",
            "message": str(self),
            "details": {"job_id": self.job_id},
        }
