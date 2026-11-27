from functools import lru_cache
from typing import Any


@lru_cache(maxsize=1)
def _load_engine() -> Any:
    # Imported lazily: the OCR model and onnxruntime are heavy, and a missing
    # install must only affect this endpoint, not the whole service.
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def recognize_image(data: bytes) -> str:
    """Return recognized text joined in reading order."""
    engine = _load_engine()
    result, _ = engine(data)
    if not result:
        return ""
    lines: list[str] = []
    for item in result:
        if len(item) >= 2 and isinstance(item[1], str):
            text = item[1].strip()
            if text:
                lines.append(text)
    return "\n".join(lines)
