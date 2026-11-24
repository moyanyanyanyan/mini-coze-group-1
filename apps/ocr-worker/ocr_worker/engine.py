"""Local-only PP-OCRv5 Mobile inference and single-page PDF rendering."""

from __future__ import annotations

import io
import math
import statistics
import tempfile
import time
from pathlib import Path

from PIL import Image, UnidentifiedImageError

MODEL_NAMES = ("PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec")
MODEL_FILES = ("inference.json", "inference.pdiparams", "inference.yml")
IMAGE_FORMATS = {"PNG", "JPEG", "WEBP"}
MAX_RENDER_PIXELS = 25_000_000  # Defensive ceiling; revisit using real documents.
MAX_IMAGE_PIXELS = 25_000_000


class InputError(ValueError):
    """The supplied document cannot be processed."""


def validate_models(model_root: Path) -> None:
    for model in MODEL_NAMES:
        for filename in MODEL_FILES:
            path = model_root / model / filename
            if not path.is_file() or path.stat().st_size == 0:
                raise FileNotFoundError(f"Local OCR model file missing or empty: {path}")


def order_regions(regions: list[dict]) -> str:
    """Order a single-column page and preserve paragraph spacing."""
    if not regions:
        return ""
    items = []
    for region in regions:
        ys = [point[1] for point in region["polygon"]]
        xs = [point[0] for point in region["polygon"]]
        items.append((sum(ys) / len(ys), min(xs), max(ys) - min(ys), region["text"]))
    heights = [max(1, item[2]) for item in items]
    median_height = statistics.median(heights)
    lines: list[list[tuple]] = []
    for item in sorted(items, key=lambda it: (it[0], it[1])):
        if lines and abs(item[0] - statistics.mean(piece[0] for piece in lines[-1])) <= median_height * 0.55:
            lines[-1].append(item)
        else:
            lines.append([item])

    output: list[str] = []
    previous_y: float | None = None
    for line in lines:
        y = statistics.mean(item[0] for item in line)
        if previous_y is not None and y - previous_y > median_height * 1.8:
            output.append("")
        text = ""
        for _, _, _, fragment in sorted(line, key=lambda it: it[1]):
            fragment = fragment.strip()
            if text and fragment:
                if text[-1].isascii() and fragment[0].isascii() and text[-1].isalnum() and fragment[0].isalnum():
                    text += " "
                elif text[-1] == "." and fragment[0].isascii() is False:
                    text += " "
            text += fragment
        output.append(text)
        previous_y = y
    return "\n".join(output).strip()


class OcrEngine:
    def __init__(self, model_root: Path):
        self.model_root = model_root
        self.model = None
        self.initialization_ms: float | None = None

    def initialize(self) -> None:
        validate_models(self.model_root)
        if self.model is not None:
            return
        # Import only after verifying local weights: startup cannot download a model.
        import paddlex

        paddlex.pretrain_dir = str(self.model_root)
        from paddleocr import PaddleOCR

        start = time.perf_counter()
        self.model = PaddleOCR(
            text_detection_model_name=MODEL_NAMES[0],
            text_detection_model_dir=str(self.model_root / MODEL_NAMES[0]),
            text_recognition_model_name=MODEL_NAMES[1],
            text_recognition_model_dir=str(self.model_root / MODEL_NAMES[1]),
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
            enable_mkldnn=False,
        )
        self.initialization_ms = round((time.perf_counter() - start) * 1000, 1)

    def recognize(self, image: Image.Image, page_number: int) -> dict:
        if self.model is None:
            raise RuntimeError("OCR model is not initialized")
        start = time.perf_counter()
        # The experiment verified predict(path). Keep this input form until the
        # in-memory predict API has been independently checked.
        with tempfile.TemporaryDirectory(prefix="minicoze-ocr-") as temporary:
            image_path = Path(temporary) / "page.png"
            image.save(image_path, format="PNG")
            results = list(self.model.predict(str(image_path)))
        if len(results) != 1:
            raise RuntimeError("OCR must return exactly one image result")
        payload = results[0].json["res"]
        texts, scores, polygons = (payload.get(key, []) for key in ("rec_texts", "rec_scores", "rec_polys"))
        if not (len(texts) == len(scores) == len(polygons)):
            raise RuntimeError("OCR result has mismatched text, score, and polygon counts")
        regions = []
        for text, score, polygon in zip(texts, scores, polygons):
            points = [[int(x), int(y)] for x, y in polygon]
            if len(points) != 4 or not isinstance(text, str) or not math.isfinite(float(score)):
                raise RuntimeError("OCR result contains an invalid region")
            regions.append({"text": text, "score": float(score), "polygon": points})
        return {
            "pageNumber": page_number,
            "method": "ocr",
            "text": order_regions(regions),
            "regions": regions,
            "elapsedMs": round((time.perf_counter() - start) * 1000, 1),
        }

    def image(self, data: bytes) -> dict:
        try:
            with Image.open(io.BytesIO(data)) as decoded:
                if decoded.format not in IMAGE_FORMATS:
                    raise InputError("Only PNG, JPEG, and WebP images are supported")
                if decoded.width * decoded.height > MAX_IMAGE_PIXELS:
                    raise InputError("Image exceeds the pixel safety limit")
                decoded.verify()
            with Image.open(io.BytesIO(data)) as decoded:
                image = decoded.convert("RGB")
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise InputError("Invalid or oversized image") from exc
        try:
            return self.recognize(image, 1)
        finally:
            image.close()

    def pdf_pages(self, data: bytes, page_numbers: list[int], dpi: int) -> list[dict]:
        import pypdfium2 as pdfium

        try:
            document = pdfium.PdfDocument(data)
        except Exception as exc:
            raise InputError("Invalid PDF") from exc
        try:
            if any(page < 1 or page > len(document) for page in page_numbers):
                raise InputError(f"PDF page number must be between 1 and {len(document)}")
            pages = []
            for number in page_numbers:
                page = document[number - 1]
                try:
                    width, height = page.get_size()
                    scale = dpi / 72
                    if width <= 0 or height <= 0 or math.ceil(width * scale) * math.ceil(height * scale) > MAX_RENDER_PIXELS:
                        raise InputError("Rendered PDF page exceeds the pixel safety limit")
                    bitmap = page.render(scale=scale)
                    try:
                        image = bitmap.to_pil().convert("RGB")
                        try:
                            result = self.recognize(image, number)
                            result["renderDpi"] = dpi
                            result["width"] = image.width
                            result["height"] = image.height
                            pages.append(result)
                        finally:
                            image.close()
                    finally:
                        bitmap.close()
                finally:
                    page.close()
            return pages
        finally:
            document.close()
