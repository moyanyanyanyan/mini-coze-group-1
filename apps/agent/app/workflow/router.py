from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .validation import validate, validate_input
from .execution import execute
from .runtime_adapter import RuntimeAdapter

router = APIRouter(prefix='/internal/workflow')


class ValidateBody(BaseModel):
    definition: Any = None
    input: dict[str, Any] | None = None


class RunBody(ValidateBody):
    input: dict[str, Any] = Field(default_factory=dict)


@router.post('/validate')
def validate_workflow(body: ValidateBody):
    result = validate(body.definition)
    if result['valid'] and body.input is not None:
        errors = validate_input(body.definition, body.input)
        return dict(valid=not errors, errors=errors)
    return result


@router.post('/run')
async def run_workflow(body: RunBody, request: Request):
    validation = validate(body.definition)
    if not validation['valid']:
        raise HTTPException(422, detail=validation['errors'])
    errors = validate_input(body.definition, body.input)
    if errors:
        raise HTTPException(400, detail=errors)
    provider = getattr(request.app.state, 'workflow_complete', None)
    return await execute(body.definition, body.input, RuntimeAdapter(provider))
