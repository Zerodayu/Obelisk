import os
import asyncio
from pathlib import Path
from uuid import uuid4
import aiofiles
from app.core.config import settings
from app.core.logging import logger


_upload_write_semaphore = asyncio.Semaphore(max(1, settings.MAX_CONCURRENT_UPLOAD_WRITES))


async def save_upload_file(uploaded_file, destination_filename: str | None = None) -> str:
    """Persist an UploadFile-like object to disk with size limits and atomic writes."""
    os.makedirs(settings.UPLOAD_FOLDER, exist_ok=True)
    original_name = destination_filename or getattr(uploaded_file, "filename", "upload.bin")
    safe_name = Path(original_name).name or "upload.bin"
    suffix = Path(safe_name).suffix
    final_name = f"{uuid4().hex}{suffix}"
    path = os.path.join(settings.UPLOAD_FOLDER, final_name)
    temp_path = f"{path}.part"

    chunk_size = max(1024, settings.UPLOAD_CHUNK_SIZE)
    max_size = max(1, settings.MAX_UPLOAD_SIZE)
    written = 0

    async with _upload_write_semaphore:
        try:
            async with aiofiles.open(temp_path, "wb") as f:
                while True:
                    chunk = await uploaded_file.read(chunk_size)
                    if not chunk:
                        break

                    written += len(chunk)
                    if written > max_size:
                        raise ValueError(f"Uploaded file exceeds MAX_UPLOAD_SIZE ({max_size} bytes)")

                    await f.write(chunk)

            os.replace(temp_path, path)
        except Exception:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise
        finally:
            await uploaded_file.close()

    logger.info("upload_saved", path=path, bytes_written=written, original_name=safe_name)
    return path

