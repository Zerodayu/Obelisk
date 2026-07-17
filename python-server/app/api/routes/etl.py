from fastapi import APIRouter
from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.etl.load.loader import DummyLoader
from app.etl.abstracts import run_full_pipeline
from app.core.logging import logger

router = APIRouter()


@router.post("/extract")
async def etl_extract():
    logger.info("api_etl_extract", message="Extraction endpoint called")
    extractor = ExcelExtractor()
    data = await extractor.extract(source={"placeholder": True})
    return {"status": "ok", "extracted": data}


@router.post("/transform")
async def etl_transform():
    logger.info("api_etl_transform", message="Transform endpoint called")
    transformer = SimpleTransformer()
    transformed = await transformer.transform({"rows": {"Sheet1": [[1, 2]]}})
    return {"status": "ok", "transformed": transformed}


@router.post("/load")
async def etl_load():
    logger.info("api_etl_load", message="Load endpoint called")
    loader = DummyLoader()
    result = await loader.load({"normalized": {"payloads": []}})
    return {"status": "ok", "result": result}


@router.post("/pipeline")
async def etl_pipeline():
    logger.info("api_etl_pipeline", message="Pipeline endpoint called")
    extractor = ExcelExtractor()
    transformer = SimpleTransformer()
    loader = DummyLoader()
    result = await run_full_pipeline(extractor, transformer, loader, source={"placeholder": True})
    return {"status": "ok", "pipeline": result}

