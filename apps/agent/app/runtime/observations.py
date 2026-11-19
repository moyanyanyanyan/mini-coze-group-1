"""仅记录调用边界元数据；不保存提示词、模型正文或工具参数。"""
import asyncio
from contextlib import aclosing, contextmanager
from datetime import datetime, timezone
from time import perf_counter

from app.runtime.schemas import ModelResult, RuntimeStage


class StageRecorder:
    def __init__(self):
        self.stages: list[RuntimeStage] = []

    @contextmanager
    def measure(self, kind, **fields):
        stage = RuntimeStage(stageId=f"stage-{len(self.stages) + 1}", kind=kind,
                             startedAt=datetime.now(timezone.utc).isoformat(), **fields)
        self.stages.append(stage)
        started = perf_counter()
        try:
            yield stage
        except (asyncio.CancelledError, GeneratorExit):
            stage.status = "interrupted"
            raise
        except BaseException as exc:
            stage.status = "failed"
            stage.errorCode = getattr(exc, "code", "STAGE_FAILED")
            raise
        else:
            if stage.status == "running":
                stage.status = "completed"
        finally:
            stage.durationMs = max(0, round((perf_counter() - started) * 1000))

    async def model(self, source, model, round_number):
        with self.measure("model", model=model, round=round_number) as stage:
            async with aclosing(source) as events:
                async for item in events:
                    if not isinstance(item, str):
                        stage.usage = item.usage
                        stage.outcome = "answer" if isinstance(item, ModelResult) else "tool_calls"
                    yield item

    def export(self):
        return [stage.model_dump(exclude_none=True) for stage in self.stages]
