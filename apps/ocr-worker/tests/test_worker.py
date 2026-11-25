"""Offline contract tests. Never import or initialize PaddleOCR."""

import io
import os
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from ocr_worker.engine import OcrEngine, order_regions, validate_models
from ocr_worker.main import (
    DEFAULT_IMAGE_MAX_BYTES, DEFAULT_PDF_MAX_BYTES, check_file_size,
    configured_limit, create_app,
)

REPOSITORY = Path(__file__).resolve().parents[3]
# Tracked two-page, US Letter fixture shared with the real PDF parser regression.
# Do not depend on an untracked local experiment directory.
PDF_FIXTURE = REPOSITORY / "apps/backend/test/fixtures/pdf-detach-regression.pdf"
EXPERIMENT_DIR = Path.home() / "AppData/Local/Temp/minicoze-paddleocr-experiment/t65-translation"
REAL_IMAGE = Path.home() / "AppData/Local/minicoze-paddleocr-output/original_image.png"
RENDERED_PAGE = EXPERIMENT_DIR / "translation-page-096-200dpi.png"
AUTH = {"Authorization": "Bearer test-token"}


class FakePrediction:
    json = {"res": {
        "rec_texts": ["4.", "中文识别"],
        "rec_scores": [0.8, 0.97],
        "rec_polys": [
            [[2, 10], [17, 10], [17, 20], [2, 20]],
            [[20, 10], [110, 10], [110, 20], [20, 20]],
        ],
    }}


class FakeModel:
    def __init__(self):
        self.calls = 0
        self.sizes = []

    def predict(self, filename):
        with Image.open(filename) as image:
            self.sizes.append(image.size)
        self.calls += 1
        return [FakePrediction()]


class FakeEngine(OcrEngine):
    def __init__(self):
        super().__init__(Path("unused"))
        self.initializations = 0
        self.fake_model = FakeModel()

    def initialize(self):
        self.initializations += 1
        self.model = self.fake_model
        self.initialization_ms = 1.0


def png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (120, 30), "white").save(buffer, format="PNG")
    return buffer.getvalue()


class WorkerContractTests(unittest.TestCase):
    def test_http_pdf_and_image_use_their_own_configured_limits(self):
        with patch.dict(os.environ, {"PDF_MAX_BYTES": "16", "OCR_IMAGE_MAX_BYTES": "4"}):
            with TestClient(create_app(FakeEngine(), token="test-token")) as client:
                pdf = client.post("/internal/ocr/pdf/pages", headers=AUTH,
                                  files={"file": ("a.pdf", b"%PDF-" + b"x" * 12, "application/pdf")},
                                  data={"pageNumbers": "[1]"})
                self.assertEqual(pdf.status_code, 413)
                self.assertIn("PDF", pdf.json()["detail"])
                image = client.post("/internal/ocr/image", headers=AUTH,
                                    files={"file": ("a.png", png(), "image/png")})
                self.assertEqual(image.status_code, 413)
                self.assertIn("Image", image.json()["detail"])

    def setUp(self):
        self.engine = FakeEngine()
        self.client = TestClient(create_app(self.engine, token="test-token"))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def test_health_ready_image_twice_and_model_reuse(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})
        self.assertEqual(self.client.get("/ready").status_code, 200)
        for _ in range(2):
            response = self.client.post("/internal/ocr/image", headers=AUTH, files={"file": ("picture.png", png(), "image/png")})
            self.assertEqual(response.status_code, 200, response.text)
            page = response.json()["pages"][0]
            self.assertEqual(page["text"], "4. 中文识别")
            self.assertEqual(page["pageNumber"], 1)
            self.assertEqual(len(page["regions"]), 2)
            self.assertEqual(page["regions"][0]["score"], 0.8)
            self.assertEqual(page["regions"][1]["polygon"][0], [20, 10])
        self.assertEqual(self.engine.initializations, 1)
        self.assertEqual(self.engine.fake_model.calls, 2)

    def test_pdf_selects_page_and_renders_at_200_dpi(self):
        data = PDF_FIXTURE.read_bytes()
        response = self.client.post("/internal/ocr/pdf/pages", headers=AUTH,
                                    files={"file": ("sample.pdf", data, "application/pdf")},
                                    data={"pageNumbers": "[2]"})
        self.assertEqual(response.status_code, 200, response.text)
        page = response.json()["pages"][0]
        self.assertEqual(page["pageNumber"], 2)
        self.assertEqual(page["renderDpi"], 200)
        self.assertEqual(self.engine.fake_model.sizes, [(1700, 2200)])
        self.assertEqual((page["width"], page["height"]), (1700, 2200))

    def test_pdf_page_order_is_explicit(self):
        response = self.client.post("/internal/ocr/pdf/pages", headers=AUTH,
                                    files={"file": ("sample.pdf", PDF_FIXTURE.read_bytes(), "application/pdf")},
                                    data={"pageNumbers": "[2,1]"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([p["pageNumber"] for p in response.json()["pages"]], [2, 1])

    def test_existing_experiment_images_follow_same_contract(self):
        # These are input/response checks with the fake model, not OCR results.
        for path in (REAL_IMAGE, RENDERED_PAGE):
            if not path.is_file():
                self.skipTest(f"Local experimental image is unavailable: {path}")
            response = self.client.post("/internal/ocr/image", headers=AUTH,
                                        files={"file": (path.name, path.read_bytes(), "image/png")})
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.engine.initializations, 1)
        self.assertEqual(self.engine.fake_model.calls, 2)

    def test_invalid_inputs_and_auth(self):
        url = "/internal/ocr/pdf/pages"
        file = {"file": ("sample.pdf", PDF_FIXTURE.read_bytes(), "application/pdf")}
        self.assertEqual(self.client.post("/internal/ocr/image", files={"file": ("a.png", png())}).status_code, 401)
        for value in ("[0]", "[3]", "[1,1]", "[]", "[true]", "hello"):
            response = self.client.post(url, headers=AUTH, files=file, data={"pageNumbers": value})
            self.assertIn(response.status_code, (400, 422), response.text)
        response = self.client.post(url, headers=AUTH,
                                    files={"file": ("fake.pdf", b"%PDF-fake", "application/pdf")},
                                    data={"pageNumbers": "[1]"})
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/internal/ocr/image", headers=AUTH,
                                    files={"file": ("invalid.png", b"not an image", "image/png")})
        self.assertEqual(response.status_code, 400)

    def test_serial_execution_with_one_waiter_and_reject_third(self):
        entered = threading.Event()
        release = threading.Event()
        count = 0
        count_lock = threading.Lock()

        def slow_image(_data):
            nonlocal count
            with count_lock:
                count += 1
                entered.set()
            release.wait(5)
            return {"pageNumber": 1, "method": "ocr", "text": "ok", "regions": [], "elapsedMs": 1}

        self.engine.image = slow_image

        def request():
            return self.client.post("/internal/ocr/image", headers=AUTH, files={"file": ("image.png", png())})

        with ThreadPoolExecutor(max_workers=3) as pool:
            first = pool.submit(request)
            self.assertTrue(entered.wait(2))
            second = pool.submit(request)
            try:
                for _ in range(200):
                    if self.client.app.state.pending == 2:
                        break
                    time.sleep(0.01)
                self.assertEqual(self.client.app.state.pending, 2)
                busy = request()
                self.assertEqual(busy.status_code, 429)
                self.assertEqual(count, 1)
            finally:
                release.set()
            self.assertEqual(first.result(timeout=5).status_code, 200)
            self.assertEqual(second.result(timeout=5).status_code, 200)
        self.assertEqual(count, 2)


class EngineUnitTests(unittest.TestCase):
    def test_pdf_and_image_have_independent_byte_limits(self):
        self.assertEqual(DEFAULT_PDF_MAX_BYTES, 64 * 1024 * 1024)
        self.assertEqual(DEFAULT_IMAGE_MAX_BYTES, 10 * 1024 * 1024)
        for size in (10 * 1024 * 1024, round(50.8 * 1024 * 1024), DEFAULT_PDF_MAX_BYTES):
            check_file_size(size, DEFAULT_PDF_MAX_BYTES, "PDF")
        with self.assertRaises(HTTPException) as pdf_error:
            check_file_size(DEFAULT_PDF_MAX_BYTES + 1, DEFAULT_PDF_MAX_BYTES, "PDF")
        self.assertEqual(pdf_error.exception.status_code, 413)
        check_file_size(DEFAULT_IMAGE_MAX_BYTES, DEFAULT_IMAGE_MAX_BYTES, "Image")
        with self.assertRaises(HTTPException) as image_error:
            check_file_size(DEFAULT_IMAGE_MAX_BYTES + 1, DEFAULT_IMAGE_MAX_BYTES, "Image")
        self.assertEqual(image_error.exception.status_code, 413)

    def test_worker_byte_limits_are_configurable(self):
        with patch.dict(os.environ, {"PDF_MAX_BYTES": "33554432", "OCR_IMAGE_MAX_BYTES": "1048576"}):
            self.assertEqual(configured_limit("PDF_MAX_BYTES", DEFAULT_PDF_MAX_BYTES), 33554432)
            self.assertEqual(configured_limit("OCR_IMAGE_MAX_BYTES", DEFAULT_IMAGE_MAX_BYTES), 1048576)
        with patch.dict(os.environ, {"PDF_MAX_BYTES": "0"}):
            with self.assertRaisesRegex(ValueError, "PDF_MAX_BYTES"):
                configured_limit("PDF_MAX_BYTES", DEFAULT_PDF_MAX_BYTES)

    def test_missing_models_fail_before_any_download(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                validate_models(Path(directory))
            with self.assertRaises(FileNotFoundError):
                with TestClient(create_app(OcrEngine(Path(directory)), token="test-token")):
                    pass

    def test_reading_order_groups_line_before_next_paragraph(self):
        regions = FakePrediction.json["res"]
        shaped = [{"text": text, "polygon": polygon}
                  for text, polygon in zip(regions["rec_texts"], regions["rec_polys"])]
        self.assertEqual(order_regions(shaped[::-1]), "4. 中文识别")


if __name__ == "__main__":
    unittest.main()
