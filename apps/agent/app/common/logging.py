import logging


class ImageRequestFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # HTTPX 默认 INFO 会记录完整取图地址；业务层只报告错误码。
        return '/internal/chat/images/' not in record.getMessage()


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logging.getLogger('httpx').addFilter(ImageRequestFilter())
