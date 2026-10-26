/**
 * 极简 JSON Schema 校验器，只覆盖内置工具实际用到的子集：
 * type(object/string/number/boolean/array)、required、properties、additionalProperties:false。
 *
 * 不引入 ajv 依赖；如后续工具需要 enum / nested / oneOf 等，再替换为正式 Schema 库。
 * 返回 null 表示通过，否则返回人类可读的错误信息。
 */

interface Schema {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true;
  }
}

export function validateAgainstSchema(
  value: unknown,
  schema: unknown,
  path = '$.arguments',
): string | null {
  const s = schema as Schema;

  if (s.type && !matchesType(value, s.type)) {
    return `${path} 期望类型 ${s.type}，实际为 ${Array.isArray(value) ? 'array' : typeof value}`;
  }

  if (s.type !== 'object' || typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const obj = value as Record<string, unknown>;

  if (s.required) {
    for (const key of s.required) {
      if (!(key in obj)) {
        return `${path}.${key} 为必填项`;
      }
    }
  }

  if (s.additionalProperties === false && s.properties) {
    for (const key of Object.keys(obj)) {
      if (!(key in s.properties)) {
        return `${path}.${key} 不被允许（additionalProperties: false）`;
      }
    }
  }

  if (s.properties) {
    for (const [key, childSchema] of Object.entries(s.properties)) {
      if (key in obj) {
        const childError = validateAgainstSchema(obj[key], childSchema, `${path}.${key}`);
        if (childError) return childError;
      }
    }
  }

  return null;
}
