"""Real HTTP smoke test; requires migrated PostgreSQL and a real Runtime provider.
Run from repository root: .venv/bin/python docs/workflows/smoke.py
"""

import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://localhost:3000/api")
args = parser.parse_args()


def request(path, method="GET", body=None):
    data = None if body is None else json.dumps(body).encode()
    req = Request(
        args.base_url.rstrip("/") + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(req, timeout=90) as response:
        return json.load(response)


definition = json.loads(Path(__file__).with_name("example.workflow.json").read_text())
workflow = request("/workflows", "POST", {"name": "Week2 真实闭环验收"})
path = "/workflows/" + workflow["id"]
request(path + "/draft", "PUT", {"definition": definition})
assert request(path)["draftDefinition"] == definition
assert request(path + "/validate", "POST", {}) == {"valid": True, "errors": []}
result = request(path + "/run", "POST", {"input": {"query": "请用一句话介绍工作流。"}})
print(
    json.dumps({"workflowId": workflow["id"], **result}, ensure_ascii=False, indent=2)
)
assert result["status"] == "SUCCEEDED", "未通过真实闭环验收；检查 Runtime 接入与数据库"
assert isinstance(result["output"]["result"], str)
assert len(result["nodeResults"]) == 3
print(
    "HTTP 保存/加载/校验/运行已通过。"
    "仍须确认 Provider 使用真实 DeepSeek，并查询数据库核对记录。"
)
