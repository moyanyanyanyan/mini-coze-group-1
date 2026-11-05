"""多节点工作流：多 LLM 串联、条件分支、循环。"""

import asyncio

import pytest
from app.workflow import execution
from app.workflow.conditions import compare
from app.workflow.execution import execute
from app.workflow.runtime_adapter import RuntimeAdapter
from app.workflow.validation import validate, validate_input


def node(nid, kind, data):
    return dict(id=nid, type=kind, position=dict(x=0, y=0), data=data)


def edge(source, target, handle=None):
    item = dict(id=f"{source}-{handle}-{target}", source=source, target=target)
    return dict(item, sourceHandle=handle) if handle else item


def start(*inputs):
    entries = inputs or (("query", "string"),)
    return node(
        "s",
        "start",
        {"inputs": [dict(name=n, type=t, required=True) for n, t in entries]},
    )


def llm(nid, prompt):
    return node(nid, "llm", {"model": "m", "userPromptTemplate": prompt})


def end(value_from, kind="string"):
    return node(
        "e",
        "end",
        {"outputs": [dict(name="result", type=kind, valueFrom=value_from)]},
    )


def graph(nodes, edges):
    return dict(version="1.0", nodes=nodes, edges=edges)


def codes(definition):
    return [e["code"] for e in validate(definition)["errors"]]


async def echo(**kwargs):
    return {"text": kwargs["user_prompt"]}


def run(definition, values, complete=echo, timeout=None):
    return asyncio.run(execute(definition, values, RuntimeAdapter(complete), timeout))


def statuses(result):
    return {r["nodeId"]: r["status"] for r in result["nodeResults"] if "parentId" not in r}


# ---------- P0：多 LLM 串联 ----------


def chain():
    return graph(
        [start(), llm("a", "A:{{s.query}}"), llm("b", "B:{{a.text}}"), end("b.text")],
        [edge("s", "a"), edge("a", "b"), edge("b", "e")],
    )


def test_multiple_llm_chain():
    definition = chain()
    assert validate(definition) == {"valid": True, "errors": []}
    result = run(definition, {"query": "hi"})
    assert result["status"] == "SUCCEEDED"
    assert result["output"] == {"result": "B:A:hi"}
    assert [r["nodeId"] for r in result["nodeResults"]] == ["s", "a", "b", "e"]
    assert result["nodeResults"][2]["input"] == {"text": "A:hi"}


def test_outbound_rules():
    definition = chain()
    definition["nodes"].append(llm("c", "{{s.query}}"))
    definition["edges"].append(edge("a", "c"))
    found = codes(definition)
    assert "NODE_OUTBOUND_INVALID" in found
    assert "NODE_OUTBOUND_REQUIRED" in found
    assert "GRAPH_NOT_SINGLE_CHAIN" not in found


def test_source_handle_ignored_for_plain_nodes():
    definition = chain()
    definition["edges"][0]["sourceHandle"] = "output"
    assert validate(definition)["valid"]


# ---------- P1：条件节点 ----------


def branching(conditions=None, logic="and"):
    """s → cond →(hit) a / (else) b → e，End 用候选列表汇合。"""
    conditions = conditions or [
        dict(left="s.query", op="contains", right=dict(type="literal", value="退款"))
    ]
    cond = node(
        "c",
        "condition",
        {"branches": [dict(id="hit", logic=logic, conditions=conditions)]},
    )
    return graph(
        [start(), cond, llm("a", "A"), llm("b", "B"), end(["a.text", "b.text"])],
        [
            edge("s", "c"),
            edge("c", "a", "hit"),
            edge("c", "b", "else"),
            edge("a", "e"),
            edge("b", "e"),
        ],
    )


def test_condition_routes_branches():
    definition = branching()
    assert validate(definition) == {"valid": True, "errors": []}
    hit = run(definition, {"query": "我要退款"})
    assert hit["output"] == {"result": "A"}
    assert statuses(hit) == dict(s="SUCCEEDED", c="SUCCEEDED", a="SUCCEEDED", e="SUCCEEDED", b="SKIPPED")
    assert hit["nodeResults"][1]["output"] == {"branch": "hit"}
    assert hit["nodeResults"][1]["input"]["conditions"][0]["result"] is True
    miss = run(definition, {"query": "开发票"})
    assert miss["output"] == {"result": "B"}
    assert statuses(miss)["a"] == "SKIPPED"
    assert miss["nodeResults"][-1]["nodeId"] == "a"


def test_condition_or_logic_and_ref_operand():
    conditions = [
        dict(left="s.query", op="eq", right=dict(type="literal", value="x")),
        dict(left="s.query", op="eq", right=dict(type="ref", value="s.keyword")),
    ]
    definition = branching(conditions, logic="or")
    definition["nodes"][0] = start(("query", "string"), ("keyword", "string"))
    assert validate(definition)["valid"]
    assert run(definition, {"query": " k ", "keyword": "k"})["output"] == {"result": "A"}
    definition["nodes"][1]["data"]["branches"][0]["logic"] = "and"
    assert run(definition, {"query": "k", "keyword": "k"})["output"] == {"result": "B"}


def first_branch(d):
    return d["nodes"][1]["data"]["branches"][0]


def first_condition(d):
    return first_branch(d)["conditions"][0]


@pytest.mark.parametrize(
    "mutation,code",
    [
        (lambda d: d["edges"].pop(2), "CONDITION_PORT_UNCONNECTED"),
        (lambda d: d["edges"][1].update(sourceHandle="nope"), "EDGE_HANDLE_INVALID"),
        (lambda d: d["edges"].append(edge("c", "e", "hit")), "NODE_OUTBOUND_INVALID"),
        (lambda d: first_branch(d).update(id="else"), "CONDITION_BRANCH_ID_INVALID"),
        (
            lambda d: d["nodes"][1]["data"]["branches"].append(dict(first_branch(d))),
            "CONDITION_BRANCH_ID_DUPLICATE",
        ),
        (lambda d: d["nodes"][1]["data"].update(branches=[]), "CONDITION_BRANCH_REQUIRED"),
        (lambda d: first_branch(d).update(conditions=[]), "CONDITION_BRANCH_REQUIRED"),
        (lambda d: first_branch(d).update(logic="xor"), "CONDITION_OPERATOR_INVALID"),
        (lambda d: first_condition(d).update(op="gt"), "CONDITION_OPERATOR_INVALID"),
        (
            lambda d: first_condition(d).update(right=dict(type="literal", value=1)),
            "CONDITION_VALUE_TYPE_MISMATCH",
        ),
        (lambda d: first_condition(d).update(right=None), "CONDITION_VALUE_TYPE_MISMATCH"),
        (lambda d: first_condition(d).update(left="a.text"), "INVALID_REFERENCE"),
    ],
)
def test_condition_invalid(mutation, code):
    definition = branching()
    mutation(definition)
    assert code in codes(definition)


def test_unary_operator_needs_no_right():
    definition = branching([dict(left="s.query", op="empty")])
    assert validate(definition)["valid"]
    assert run(definition, {"query": ""})["output"] == {"result": "A"}


def test_reference_to_skipped_branch_fails():
    definition = branching()
    definition["nodes"][-1] = end("a.text")
    assert validate(definition)["valid"]
    result = run(definition, {"query": "其他"})
    assert result["status"] == "FAILED"
    failed = next(r for r in result["nodeResults"] if r["status"] == "FAILED")
    assert failed["nodeId"] == "e"
    assert failed["error"]["code"] == "REFERENCE_NOT_EXECUTED"
    assert result["error"]["nodeId"] == "e"


def test_branches_may_share_target():
    definition = branching()
    definition["edges"][2] = edge("c", "a", "else")
    definition["nodes"] = [n for n in definition["nodes"] if n["id"] != "b"]
    definition["edges"] = [e for e in definition["edges"] if e["source"] != "b"]
    definition["nodes"][-1] = end("a.text")
    assert validate(definition)["valid"]


@pytest.mark.parametrize(
    "left,op,right,expected",
    [
        (" 退款\n", "eq", "退款", True),
        ("abc", "ne", "abc", False),
        ("abc", "not_contains", "d", True),
        (3, "gte", 3, True),
        (2, "lt", 1, False),
        (True, "eq", True, True),
        (["a", "b"], "contains", "b", True),
        ([], "not_empty", None, False),
        ([None], "contains", "a", False),
    ],
)
def test_compare(left, op, right, expected):
    assert compare(left, op, right) is expected


# ---------- P2：循环节点 ----------


def looping(mode="array", body=None, body_edges=None, outputs=None, **extra):
    """s → loop(body: x) → e，End 引用循环输出数组。"""
    body = body or [llm("x", "Q{{l.index}}:{{l.item}}")]
    outputs = outputs or [dict(name="answers", type="array<string>", valueFrom="x.text")]
    data = dict(mode=mode, body=dict(nodes=body, edges=body_edges or []), outputs=outputs)
    data.update(items="s.questions") if mode == "array" else data.update(count=2)
    data.update(extra)
    return graph(
        [start(("questions", "array<string>")), node("l", "loop", data), end("l.answers", "array<string>")],
        [edge("s", "l"), edge("l", "e")],
    )


def test_loop_over_array():
    definition = looping()
    assert validate(definition) == {"valid": True, "errors": []}
    result = run(definition, {"questions": ["a", "b", "c"]})
    assert result["status"] == "SUCCEEDED"
    assert result["output"] == {"result": ["Q0:a", "Q1:b", "Q2:c"]}
    body = [r for r in result["nodeResults"] if r.get("parentId") == "l"]
    assert [(r["nodeId"], r["iteration"]) for r in body] == [("x", 0), ("x", 1), ("x", 2)]
    loop = next(r for r in result["nodeResults"] if r["nodeId"] == "l")
    assert loop["output"]["count"] == 3
    assert loop["input"] == {"items": ["a", "b", "c"]}
    assert [r["nodeId"] for r in result["nodeResults"]].index("l") == 4


def test_loop_empty_array_and_count_mode():
    assert run(looping(), {"questions": []})["output"] == {"result": []}
    definition = looping("count", body=[llm("x", "第{{l.index}}轮 {{s.questions}}")])
    assert validate(definition)["valid"]
    result = run(definition, {"questions": ["q"]})
    assert result["output"] == {"result": ['第0轮 ["q"]', '第1轮 ["q"]']}


def test_loop_body_condition_may_produce_null():
    is_a = dict(left="l.item", op="eq", right=dict(type="literal", value="a"))
    cond = node("c", "condition", {"branches": [dict(id="yes", conditions=[is_a])]})
    definition = looping(body=[cond, llm("x", "{{l.item}}")], body_edges=[edge("c", "x", "yes")])
    assert validate(definition) == {"valid": True, "errors": []}
    assert run(definition, {"questions": ["a", "b"]})["output"] == {"result": ["a", None]}


@pytest.mark.parametrize(
    "build,code",
    [
        (lambda: looping(mode="while"), "LOOP_MODE_INVALID"),
        (lambda: looping("count", count=51), "LOOP_COUNT_OUT_OF_RANGE"),
        (lambda: looping(items="s.missing"), "LOOP_ITEMS_INVALID"),
        (lambda: looping(body=[dict(end("s.questions"), id="z")]), "LOOP_BODY_INVALID"),
        (lambda: looping(body=[llm("x", "1"), llm("y", "2")]), "LOOP_BODY_INVALID"),
        (
            lambda: looping(outputs=[dict(name="answers", type="string", valueFrom="x.text")]),
            "LOOP_OUTPUT_INVALID",
        ),
        (
            lambda: looping(outputs=[dict(name="answers", type="array<number>", valueFrom="x.text")]),
            "OUTPUT_TYPE_MISMATCH",
        ),
        (lambda: looping("count", body=[llm("x", "{{l.item}}")]), "INVALID_REFERENCE"),
        (lambda: looping(body=[llm("x", "{{e.result}}")]), "INVALID_REFERENCE"),
    ],
)
def test_loop_invalid(build, code):
    assert code in codes(build())


def test_outside_cannot_reference_body_node():
    definition = looping()
    definition["nodes"][-1] = end("x.text")
    assert "INVALID_REFERENCE" in codes(definition)


def test_loop_counts_body_nodes_toward_limit():
    definition = looping(body=[llm(f"x{i}", "1") for i in range(50)])
    definition["nodes"][1]["data"]["body"]["edges"] = [edge(f"x{i}", f"x{i + 1}") for i in range(49)]
    definition["nodes"][1]["data"]["outputs"][0]["valueFrom"] = "x0.text"
    assert "WORKFLOW_TOO_LARGE" in codes(definition)


def test_loop_failure_stops_run():
    async def flaky(**kwargs):
        if kwargs["user_prompt"].startswith("Q1"):
            raise RuntimeError("secret")
        return {"text": kwargs["user_prompt"]}

    result = run(looping(), {"questions": ["a", "b", "c"]}, flaky)
    assert result["status"] == "FAILED"
    assert result["error"]["nodeId"] == "l"
    body = [(r["iteration"], r["status"]) for r in result["nodeResults"] if r.get("parentId")]
    assert body == [(0, "SUCCEEDED"), (1, "FAILED")]
    assert statuses(result) == dict(s="SUCCEEDED", l="FAILED", e="SKIPPED")
    assert "secret" not in str(result)


def test_step_limit(monkeypatch):
    monkeypatch.setattr(execution, "MAX_STEPS", 3)
    result = run(looping(), {"questions": ["a", "b", "c"]})
    failed = [r for r in result["nodeResults"] if r.get("parentId") and r["status"] == "FAILED"]
    assert failed[0]["error"]["code"] == "WORKFLOW_STEP_LIMIT_EXCEEDED"


def test_workflow_timeout():
    async def slow(**kwargs):
        await asyncio.sleep(1)
        return {"text": "late"}

    result = run(chain(), {"query": "hi"}, slow, timeout=0.05)
    assert result["status"] == "FAILED"
    assert result["nodeResults"][1]["error"]["code"] == "WORKFLOW_TIMEOUT"


def test_array_input_validation():
    definition = looping()
    assert not validate_input(definition, {"questions": ["a"]})
    assert validate_input(definition, {"questions": "a"})
    assert validate_input(definition, {"questions": [1]})
    assert validate_input(definition, {"questions": ["a"] * 51})


def test_missing_optional_input_resolves_to_none():
    definition = branching([dict(left="s.query", op="empty")])
    definition["nodes"][0]["data"]["inputs"][0]["required"] = False
    definition["nodes"][2] = llm("a", "[{{s.query}}]")
    assert validate(definition)["valid"]
    assert run(definition, {})["output"] == {"result": "[]"}
    definition["nodes"][-1] = end("s.query")
    assert run(definition, {})["output"] == {"result": None}


def test_record_values_are_truncated():
    long = "x" * 600
    definition = branching([dict(left="s.query", op="contains", right=dict(type="literal", value="y"))])
    record = run(definition, {"query": long})["nodeResults"][1]
    assert record["input"]["conditions"][0]["left"] == "x" * 500 + "…"
    looped = run(looping(), {"questions": [long]})
    loop = next(r for r in looped["nodeResults"] if r["nodeId"] == "l")
    assert loop["input"]["items"] == ["x" * 500 + "…"]
    assert looped["output"]["result"] == [f"Q0:{long}"]


# ---------- docs/workflows 中的样例 ----------


def test_condition_example(load_example):
    definition = load_example("example.condition.workflow.json")
    assert validate(definition) == {"valid": True, "errors": []}

    async def intent(**kwargs):
        if "意图" in kwargs["system_prompt"]:
            return {"text": " 发票\n"}
        return {"text": kwargs["system_prompt"]}

    result = run(definition, {"query": "帮我开张发票"}, intent)
    assert result["output"] == {"result": "你是发票客服", "intent": "invoice"}


def test_loop_example(load_example):
    definition = load_example("example.loop.workflow.json")
    assert validate(definition) == {"valid": True, "errors": []}
    result = run(definition, {"questions": ["a", "b"]})
    assert result["output"]["answers"] == ["第 0 题：a", "第 1 题：b"]
    assert result["output"]["summary"] == '汇总以下回答：["第 0 题：a", "第 1 题：b"]'
