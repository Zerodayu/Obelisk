from fastapi import Header, HTTPException, status
from secrets import compare_digest

from app.core.config import settings
from app.core.exceptions import UnauthorizedCaller


async def verify_webapp_secret(x_webapp_secret: str | None = Header(default=None, alias="X-Webapp-Secret")) -> None:
    if settings.WEBAPP_SHARED_SECRET is None:
        return

    if x_webapp_secret is None or not compare_digest(x_webapp_secret, settings.WEBAPP_SHARED_SECRET):
        error = UnauthorizedCaller(
            header_name="X-Webapp-Secret",
            reason="missing_or_invalid_secret",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error.to_dict())

