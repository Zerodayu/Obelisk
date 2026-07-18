from abc import ABC, abstractmethod
from typing import Any, Dict
import asyncio
from app.core.logging import logger


class Extractor(ABC):
    @abstractmethod
    async def extract(self, source: Any) -> Any:
        """Extract data from the provided source (e.g. an uploaded workbook)."""

    async def pipeline(self, source: Any) -> Any:
        logger.info("extract_started")
        data = await self.extract(source)
        logger.info("extract_completed")
        return data


class Transformer(ABC):
    @abstractmethod
    async def transform(self, extracted: Any) -> Any:
        """Transform extracted raw data into normalized payloads."""

    async def pipeline(self, extracted: Any) -> Any:
        logger.info("transform_started")
        result = await self.transform(extracted)
        logger.info("transform_completed")
        return result


class Loader(ABC):
    @abstractmethod
    async def load(self, payload: Any) -> Dict[str, Any]:
        """Load normalized payloads to destination (e.g. send to backend API)."""

    async def pipeline(self, payload: Any) -> Dict[str, Any]:
        logger.info("load_started")
        res = await self.load(payload)
        logger.info("load_completed")
        return res


async def run_full_pipeline(extractor: Extractor, transformer: Transformer, loader: Loader, source: Any) -> Dict[str, Any]:
    # Orchestrator - simple sequential pipeline
    extracted = await extractor.pipeline(source)
    transformed = await transformer.pipeline(extracted)
    # The transformer only returns the records, so we need to pass the header from the extractor to the loader.
    header, _ = extracted
    loaded = await loader.pipeline((header, transformed))
    return {"extracted": extracted, "transformed": transformed, "loaded": loaded}
