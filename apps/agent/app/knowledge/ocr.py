import threading
from functools import lru_cache

_load_lock = threading.Lock()


@lru_cache(maxsize=1)
def _create_engine():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def load_engine():
    with _load_lock:
        return _create_engine()


def recognize_image(data: bytes) -> str:
    engine = load_engine()
    result, _ = engine(data)
    if not result:
        return ""
    # 按文本框左上角坐标排序，尽量还原阅读顺序。
    lines = sorted(result, key=lambda item: (item[0][0][1], item[0][0][0]))
    return "\n".join(item[1] for item in lines)
