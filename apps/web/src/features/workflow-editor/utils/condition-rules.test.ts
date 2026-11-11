import { expect, it } from 'vitest';
import { describeCondition } from './condition-rules';
import { getUpstreamFields, getUpstreamNodes, type UpstreamField } from './upstream';
import type { Node, Edge } from '@xyflow/react';

const field = (type: string): UpstreamField => ({
  ref: 'start.value', nodeId: 'start', field: 'value', nodeLabel: '开始', type,
});

it('保留布尔假值及变量比较的展示语义', () => {
  const literal = describeCondition({ left: 'start.value', op: 'eq', right: { type: 'literal', value: false } }, [field('boolean')]);
  expect(literal).toMatchObject({ simpleBoolean: true, booleanChoice: 'eq-false', literal: false });
  const reference = describeCondition({ left: 'start.value', op: 'ne', right: { type: 'ref', value: 'other.flag' } }, [field('boolean')]);
  expect(reference.booleanChoice).toBe('ne');
});

it('字段类型变化后标记不适用运算符，空值判断不需要右值', () => {
  const numeric = describeCondition({ left: 'start.value', op: 'gt' }, [field('number')]);
  expect(numeric.ops).toContain('gt');
  const text = describeCondition({ left: 'start.value', op: 'gt' }, [field('string')]);
  expect(text.opValid).toBe(false);
  expect(describeCondition({ left: 'start.value', op: 'empty' }, [field('array<boolean>')]))
    .toMatchObject({ needsRight: false, booleanValue: true, simpleBoolean: false });
});

it('上游遍历遇到环时终止，且不包含不相连的节点', () => {
  const nodes: Node[] = ['a', 'b', 'target', 'isolated'].map(id => ({ id, position: { x: 0, y: 0 }, data: {} }));
  const edges: Edge[] = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'ba', source: 'b', target: 'a' },
    { id: 'bt', source: 'b', target: 'target' },
  ];
  expect(getUpstreamNodes(nodes, edges, 'target').map(node => node.id)).toEqual(['b', 'a']);
});

it('循环体变量同时保留局部上游和外部字段，仅数组模式提供 item', () => {
  const external: Node = { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { inputs: [{ name: 'query', type: 'string' }] } };
  const local: Node = { id: 'llm', type: 'llm', position: { x: 0, y: 0 }, data: {} };
  const edges: Edge[] = [{ id: 'lc', source: 'llm', target: 'condition' }];
  const count = getUpstreamFields([local], edges, 'condition', { loopId: 'loop', mode: 'count', externalNodes: [external] });
  expect(count.map(item => item.ref)).toEqual(['llm.text', 'start.query', 'loop.index']);
  const array = getUpstreamFields([local], edges, 'condition', { loopId: 'loop', mode: 'array', externalNodes: [external] });
  expect(array.map(item => item.ref)).toEqual(['llm.text', 'start.query', 'loop.item', 'loop.index']);
});
