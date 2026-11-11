import { RunDialogView } from '@minicoze/ui/workflow-editor';
// src/features/workflow-editor/components/RunDialogController.tsx
import React from 'react';
import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { runWorkflow } from '../services/workflow';
import type {
  WorkflowRunResult,
  StartNodeData,
  StartInput,
} from '../types/workflow';

interface Props {
  workflowId: string;
  startNode: Node | null;
  initialResult: WorkflowRunResult | null;
  onClose: () => void;
  onComplete: (result: WorkflowRunResult) => void;
}

/** 数组字段输入校验：JSON.parse 后检查类型 / 长度 / null */
function validateArrayInput(raw: string, fieldType: string): string | null {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return 'JSON 格式错误';
  }
  if (!Array.isArray(arr)) return '必须是 JSON 数组';
  if (arr.length > 50) return '最多 50 个元素';
  if (arr.some((x) => x === null)) return '元素不能为 null';

  const expect = fieldType.replace('array<', '').replace('>', '');
  const typeOk = arr.every((x) => {
    if (expect === 'string') return typeof x === 'string';
    if (expect === 'number') return typeof x === 'number';
    if (expect === 'boolean') return typeof x === 'boolean';
    return false;
  });
  if (!typeOk) return `元素必须是 ${expect} 类型`;
  return null;
}

/** 把表单里的字符串值按 type 转成后端要求的类型；返回错误消息或 payload */
function buildPayload(
  inputs: StartInput[],
  values: Record<string, string>,
): { payload?: Record<string, unknown>; error?: string } {
  const payload: Record<string, unknown> = {};
  for (const inp of inputs) {
    const raw = (values[inp.name] ?? '').trim();

    if (raw === '') {
      if (inp.required) return { error: `请填写「${inp.name}」` };
      continue;
    }

    if (inp.type === 'string') {
      payload[inp.name] = raw;
    } else if (inp.type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) return { error: `「${inp.name}」必须是数字` };
      payload[inp.name] = n;
    } else if (inp.type === 'boolean') {
      if (raw !== 'true' && raw !== 'false') {
        return { error: `「${inp.name}」必须是 true 或 false` };
      }
      payload[inp.name] = raw === 'true';
    } else if (inp.type.startsWith('array<')) {
      const err = validateArrayInput(raw, inp.type);
      if (err) return { error: `「${inp.name}」${err}` };
      payload[inp.name] = JSON.parse(raw);
    }
  }
  return { payload };
}

export function RunDialogController({ workflowId, startNode, initialResult, onClose, onComplete }: Props) {
  const inputs = startNode
    ? ((startNode.data as unknown as StartNodeData).inputs || [])
    : [];

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    inputs.forEach((i) => {
      init[i.name] = '';
    });
    return init;
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorkflowRunResult | null>(initialResult);
  const [error, setError] = useState<string | null>(null);

  const setValue = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
  };

  const handleRun = async () => {
    const { payload, error: err } = buildPayload(inputs, values);
    if (err || !payload) {
      setError(err || '输入有误');
      return;
    }
    setError(null);
    setRunning(true);
    try {
      const res = await runWorkflow(workflowId, payload);
      setResult(res);
      onComplete(res);
    } catch (e: any) {
      setError(e.message || '运行失败');
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  return <RunDialogView
    inputs={inputs}
    values={values}
    running={running}
    result={result}
    error={error}
    setValue={setValue}
    handleRun={handleRun}
    handleReset={handleReset}
    onClose={onClose}
  />;
}
