import json
from pathlib import Path

import pytest

EXAMPLES = Path(__file__).resolve().parents[3] / "docs/workflows"


@pytest.fixture
def load_example():
    """返回读取 docs/workflows 下工作流样例的函数。"""
    return lambda name="example.workflow.json": json.loads((EXAMPLES / name).read_text())
