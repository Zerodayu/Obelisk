import os
import asyncio
from app.core.config import settings
from app.core.logging import logger


async def save_upload_file(uploaded_file, destination_filename: str | None = None) -> str:
    """Save an UploadFile-like object to disk using a thread to avoid blocking.
    Returns the path to the saved file.
    """
    os.makedirs(settings.UPLOAD_FOLDER, exist_ok=True)
    dest = destination_filename or getattr(uploaded_file, "filename", f"upload-{id(uploaded_file)}")
    path = os.path.join(settings.UPLOAD_FOLDER, dest)

    # Use blocking IO in a thread to keep async event loop responsive
    def _write():
        with open(path, "wb") as f:
            for chunk in getattr(uploaded_file, "file", [uploaded_file]):
                try:
                    data = chunk.read()
                    if not data:
                        break
                    f.write(data)
                except Exception:
                    # uploaded_file may be starlette UploadFile which has .file
                    break

    await asyncio.to_thread(_write)
    logger.info("upload_saved", path=path)
    return path

