from typing import Any


class OBELISKError(Exception):
    """Base exception for the application."""


class InvalidWorkbook(OBELISKError):
    def __init__(self, message: str = "Invalid workbook"):
        super().__init__(message)


class InvalidTemplate(OBELISKError):
    def __init__(self, message: str = "Invalid template"):
        super().__init__(message)


class MissingWorksheet(OBELISKError):
    def __init__(self, sheet_name: str | None = None):
        msg = f"Missing worksheet: {sheet_name}" if sheet_name else "Missing worksheet"
        super().__init__(msg)


class TransformationError(OBELISKError):
    pass


class LoaderError(OBELISKError):
    pass

