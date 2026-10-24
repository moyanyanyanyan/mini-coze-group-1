from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .validation import validate, validate_input
from .execution import execute
from .runtime_adapter import RuntimeAdapter

router = APIRouter(prefix="/internal/workflow")


class ValidateBody(BaseModel):
    definition: Any = None
    input: dict[str, Any] | None = None


class RunBody(ValidateBody):
    input: dict[str, Any] = Field(default_factory=dict)


@router.post("/validate")
def validate_workflow(body: ValidateBody):
    """校验定义，可选校验运行输入；业务校验失败仍返回 HTTP 200。"""
    result = validate(body.definition)
    if result["valid"] and body.input is not None:
        errors = validate_input(body.definition, body.input)
        return dict(valid=not errors, errors=errors)
    return result


@router.post("/run")
async def run_workflow(body: RunBody, request: Request):
    """执行前校验定义和输入，再使用启动时注入的 Runtime Provider 运行。"""
    validation = validate(body.definition)
    if not validation["valid"]:
        raise HTTPException(422, detail=validation["errors"])
    errors = validate_input(body.definition, body.input)
    if errors:
        raise HTTPException(400, detail=errors)
    provider = getattr(request.app.state, "workflow_complete", None)
    return await execute(body.definition, body.input, RuntimeAdapter(provider))
