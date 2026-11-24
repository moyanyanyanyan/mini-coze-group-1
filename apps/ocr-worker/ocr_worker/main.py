"""Internal-only OCR HTTP service. Run with a single Uvicorn worker."""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from hmac import compare_digest
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .engine import InputError, OcrEngine

DEFAULT_PDF_MAX_BYTES = 64 * 1024 * 1024
DEFAULT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
QUEUE_WAIT_SECONDS = 30  # Queue wait only; no timeout is imposed on OCR inference.


def configured_limit(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a positive integer of bytes") from exc
    if value < 1:
        raise ValueError(f"{name} must be a positive integer of bytes")
    return value


def check_file_size(size: int, maximum: int, kind: str) -> None:
    if size > maximum:
        raise HTTPException(status_code=413, detail=f"{kind} file exceeds upload limit ({maximum} bytes)")


class Region(BaseModel):
    text: str
    score: float = Field(ge=0, le=1)
    polygon: list[list[int]]


class PageResult(BaseModel):
    pageNumber: int
    method: Literal["ocr"]
    text: str
    regions: list[Region]
    elapsedMs: float
    renderDpi: int | None = None
    width: int | None = None
    height: int | None = None


class OcrResponse(BaseModel):
    status: Literal["ok"] = "ok"
    pages: list[PageResult]


def create_app(engine: OcrEngine | None = None, token: str | None = None) -> FastAPI:
    engine = engine or OcrEngine(Path(os.environ.get("OCR_MODEL_DIR", str(Path.home() / ".paddlex" / "official_models"))))
    configured_token = token if token is not None else os.environ.get("OCR_WORKER_TOKEN", "")
    pdf_max_bytes = configured_limit("PDF_MAX_BYTES", DEFAULT_PDF_MAX_BYTES)
    image_max_bytes = configured_limit("OCR_IMAGE_MAX_BYTES", DEFAULT_IMAGE_MAX_BYTES)
    # One processing slot and one waiting slot. Requests beyond these get 429.
    slots = asyncio.Semaphore(2)
    processing = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if not configured_token:
            raise RuntimeError("OCR_WORKER_TOKEN must be configured")
        engine.initialize()  # Startup fails loudly if either local model is missing.
        yield

    app = FastAPI(title="MiniCoze OCR Worker", lifespan=lifespan)
    app.state.pending = 0

    def authorize(authorization: str = Header(default="")) -> None:
        if not configured_token or not compare_digest(authorization, f"Bearer {configured_token}"):
            raise HTTPException(status_code=401, detail="Invalid service credential")

    async def read_file(file: UploadFile, maximum: int, kind: str) -> bytes:
        try:
            data = await file.read(maximum + 1)
        finally:
            await file.close()
        if not data:
            raise HTTPException(status_code=400, detail="File is empty")
        check_file_size(len(data), maximum, kind)
        return data

    async def execute(operation, *args):
        if slots.locked():
            raise HTTPException(status_code=429, detail="OCR worker is busy; retry later")
        async with slots:
            app.state.pending += 1
            try:
                try:
                    await asyncio.wait_for(processing.acquire(), timeout=QUEUE_WAIT_SECONDS)
                except TimeoutError as exc:
                    raise HTTPException(status_code=429, detail="OCR queue wait expired; retry later") from exc
                try:
                    # Keep the lock until the worker thread finishes even if the
                    # HTTP request is cancelled. OCR execution stays strictly serial.
                    task = asyncio.create_task(asyncio.to_thread(operation, *args))
                    try:
                        return await asyncio.shield(task)
                    except asyncio.CancelledError:
                        await asyncio.shield(task)
                        raise
                    except InputError as exc:
                        raise HTTPException(status_code=400, detail=str(exc)) from exc
                finally:
                    processing.release()
            finally:
                app.state.pending -= 1

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/ready")
    async def ready():
        if engine.model is None:
            raise HTTPException(status_code=503, detail="OCR model is not initialized")
        return {"status": "ok", "modelInitialized": True, "initializationMs": engine.initialization_ms}

    @app.post("/internal/ocr/image", response_model=OcrResponse)
    async def image(file: UploadFile = File(...), authorization: str = Header(default="")):
        authorize(authorization)
        data = await read_file(file, image_max_bytes, "Image")
        page = await execute(engine.image, data)
        return {"status": "ok", "pages": [page]}

    @app.post("/internal/ocr/pdf/pages", response_model=OcrResponse)
    async def pdf_pages(
        file: UploadFile = File(...),
        page_numbers: str = Form(..., alias="pageNumbers"),
        dpi: int = Form(200, ge=72, le=300),
        authorization: str = Header(default=""),
    ):
        authorize(authorization)
        try:
            numbers = json.loads(page_numbers)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail="pageNumbers must be a JSON array of PDF page numbers") from exc
        if (not isinstance(numbers, list) or not numbers or
                any(type(number) is not int or number < 1 for number in numbers) or
                len(numbers) != len(set(numbers))):
            raise HTTPException(status_code=422, detail="pageNumbers must contain distinct positive integers")
        data = await read_file(file, pdf_max_bytes, "PDF")
        if not data.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Invalid PDF header")
        pages = await execute(engine.pdf_pages, data, numbers, dpi)
        return {"status": "ok", "pages": pages}

    return app


app = create_app()
