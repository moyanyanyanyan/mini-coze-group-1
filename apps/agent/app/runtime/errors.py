class ModelError(Exception):
    """可安全展示的模型或 Runtime 依赖错误，不携带供应商原始响应。"""

    def __init__(self, code: str, message: str, status: int = 502, retryable: bool = False, *, stages: list | None = None):
        super().__init__(message)
        self.stages = stages
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable
