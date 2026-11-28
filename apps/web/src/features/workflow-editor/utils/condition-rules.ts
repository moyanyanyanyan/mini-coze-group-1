import type { ConditionItem, ConditionOperator } from '../types/workflow';
import type { UpstreamField } from './upstream';

const OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  string: ['eq', 'ne', 'contains', 'not_contains', 'empty', 'not_empty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
  boolean: ['eq', 'ne'],
  'array<string>': ['contains', 'not_contains', 'empty', 'not_empty'],
  'array<number>': ['contains', 'not_contains', 'empty', 'not_empty'],
  'array<boolean>': ['contains', 'not_contains', 'empty', 'not_empty'],
};

function opsForFieldType(type?: string): ConditionOperator[] {
  return (type && OPERATORS_BY_TYPE[type]) || OPERATORS_BY_TYPE.string;
}

function needsRight(op: ConditionOperator): boolean {
  return op !== 'empty' && op !== 'not_empty';
}

export function describeCondition(c: ConditionItem, upstream: UpstreamField[]) {
  const leftField = upstream.find(f => f.ref === c.left);
  const ops = opsForFieldType(leftField?.type);
  const booleanValue = leftField?.type === 'boolean' || leftField?.type === 'array<boolean>';
  const opValid = ops.includes(c.op);
  const simpleBoolean = leftField?.type === 'boolean' && opValid;
  const literal = c.right?.value;
  const booleanChoice = c.right?.type === 'ref' ? c.op
    : typeof literal === 'boolean' ? `${c.op}-${literal}` : '';
  return { ops, booleanValue, opValid, simpleBoolean, literal, booleanChoice, needsRight: needsRight(c.op) };
}
