import logging
import sys
import structlog
from app.core.config import settings


def configure_logging():
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.DEBUG if settings.DEBUG else logging.INFO,
    )

    # In development or when stdout is a terminal, ConsoleRenderer makes logs readable at a glance
    if sys.stdout.isatty() or settings.DEBUG:
        renderer = structlog.dev.ConsoleRenderer(colors=True)
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S"),
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG if settings.DEBUG else logging.INFO),
        logger_factory=structlog.stdlib.LoggerFactory(),
    )


logger = structlog.get_logger()
