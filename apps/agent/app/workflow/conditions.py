"""字段类型与条件算子，校验和执行共用。"""

SCALARS = {"string": str, "number": (int, float), "boolean": bool}
ARRAYS = {f"array<{kind}>": kind for kind in SCALARS}
MAX_ARRAY = 50
OPERATORS = {
    "string": {"eq", "ne", "contains", "not_contains", "empty", "not_empty"},
    "number": {"eq", "ne", "gt", "gte", "lt", "lte"},
    "boolean": {"eq", "ne"},
    "array": {"contains", "not_contains", "empty", "not_empty"},
}
UNARY = {"empty", "not_empty"}


def is_type(kind):
    """是否为合法字段类型：三种标量或其数组。"""
    return isinstance(kind, str) and (kind in SCALARS or kind in ARRAYS)


def matches(value, kind):
    """检查值类型；bool 不能作为 number，数组元素必须同类型且不超过上限。"""
    if not is_type(kind):
        return False
    if kind in ARRAYS:
        return (
            isinstance(value, list)
            and len(value) <= MAX_ARRAY
            and all(matches(item, ARRAYS[kind]) for item in value)
        )
    return isinstance(value, SCALARS[kind]) and not (
        kind == "number" and isinstance(value, bool)
    )


def operators(kind):
    """左值类型允许的算子集合。"""
    return OPERATORS["array"] if kind in ARRAYS else OPERATORS.get(kind, set())


def right_type(kind):
    """右值应有的类型：数组左值比较其元素。"""
    return ARRAYS.get(kind, kind)


def compare(left, op, right=None):
    """按算子比较已解析的值；字符串 eq/ne 先去掉首尾空白。"""
    if op == "empty":
        return left is None or len(left) == 0
    if op == "not_empty":
        return not compare(left, "empty")
    if op in ("eq", "ne") and isinstance(left, str) and isinstance(right, str):
        left, right = left.strip(), right.strip()
    if op == "eq":
        return left == right
    if op == "ne":
        return left != right
    if op == "contains":
        return left is not None and right in left
    if op == "not_contains":
        return left is None or right not in left
    if left is None or right is None:
        return False
    return {
        "gt": left > right,
        "gte": left >= right,
        "lt": left < right,
        "lte": left <= right,
    }[op]
