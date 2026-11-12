import { useState, type FormEvent } from 'react';
import { ModelFormDrawer, type ModelFormErrors, type ModelFormValues } from '@minicoze/ui/model-management';
import {
  createModel,
  getModelErrorMessage,
  updateModel,
  type ModelProvider,
  type ModelSummary,
} from './model.api';

interface Props {
  mode: 'create' | 'edit';
  model?: ModelSummary | null;
  onClose: () => void;
  onSaved: (model: ModelSummary) => void;
}

export const MODEL_KEY_PATTERN = /^[a-zA-Z0-9._:\/-]{1,100}$/;

const FIELD_KEYWORDS: Array<{ field: keyof ModelFormValues; keyword: string }> = [
  { field: 'displayName', keyword: 'displayName' },
  { field: 'key', keyword: 'key' },
  { field: 'description', keyword: 'description' },
  { field: 'provider', keyword: 'provider' },
  { field: 'upstreamModel', keyword: 'upstreamModel' },
  { field: 'contextWindow', keyword: 'contextWindow' },
  { field: 'maxOutputTokens', keyword: 'maxOutputTokens' },
  { field: 'sortOrder', keyword: 'sortOrder' },
];

export function validateModelForm(
  values: ModelFormValues,
  mode: 'create' | 'edit',
  isDefault: boolean,
): ModelFormErrors {
  const errors: ModelFormErrors = {};
  const displayName = values.displayName.trim();
  const upstreamModel = values.upstreamModel.trim();
  const contextWindow = Number(values.contextWindow);
  const maxOutputTokens = Number(values.maxOutputTokens);
  const sortOrder = Number(values.sortOrder || '0');

  if (!displayName) {
    errors.displayName = '请填写显示名称';
  } else if (displayName.length > 50) {
    errors.displayName = '显示名称不能超过 50 字';
  }

  if (mode === 'create' && !MODEL_KEY_PATTERN.test(values.key.trim())) {
    errors.key = '模型标识需为 1-100 位字母、数字或 . _ : / -';
  }

  if (values.description.length > 200) {
    errors.description = '描述不能超过 200 字';
  }

  if (!upstreamModel) {
    errors.upstreamModel = '请填写上游模型 ID';
  } else if (upstreamModel.length > 100) {
    errors.upstreamModel = '上游模型 ID 不能超过 100 字';
  }

  if (!Number.isInteger(contextWindow) || contextWindow < 1024 || contextWindow > 1048576) {
    errors.contextWindow = '上下文窗口需为 1024-1048576 的整数';
  }

  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8192) {
    errors.maxOutputTokens = '最大输出需为 1-8192 的整数';
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    errors.sortOrder = '排序需为 0-100000 的整数';
  }

  if (isDefault && !values.enabled) {
    errors.enabled = '默认模型不可停用，请先切换默认模型';
  }

  return errors;
}

function toFormValues(model?: ModelSummary | null): ModelFormValues {
  if (!model) {
    return {
      key: '',
      displayName: '',
      description: '',
      provider: 'deepseek' as ModelProvider,
      upstreamModel: '',
      contextWindow: '32768',
      maxOutputTokens: '8192',
      supportsVision: false,
      enabled: true,
      sortOrder: '0',
    };
  }

  return {
    key: model.key,
    displayName: model.displayName,
    description: model.description ?? '',
    provider: model.provider,
    upstreamModel: model.upstreamModel,
    contextWindow: String(model.contextWindow),
    maxOutputTokens: String(model.maxOutputTokens),
    supportsVision: model.supportsVision,
    enabled: model.enabled,
    sortOrder: String(model.sortOrder),
  };
}

function matchServerField(message: string): keyof ModelFormValues | undefined {
  return FIELD_KEYWORDS.find((item) => message.includes(item.keyword))?.field;
}

export function ModelFormController({ mode, model, onClose, onSaved }: Props) {
  const [values, setValues] = useState<ModelFormValues>(() => toFormValues(model));
  const [errors, setErrors] = useState<ModelFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isDefault = mode === 'edit' && Boolean(model?.isDefault);

  const handleChange = <K extends keyof ModelFormValues>(field: K, value: ModelFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateModelForm(values, mode, isDefault);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      displayName: values.displayName.trim(),
      description: values.description.trim() || undefined,
      provider: values.provider,
      upstreamModel: values.upstreamModel.trim(),
      contextWindow: Number(values.contextWindow),
      maxOutputTokens: Number(values.maxOutputTokens),
      supportsVision: values.supportsVision,
      enabled: values.enabled,
      sortOrder: Number(values.sortOrder || '0'),
    };

    try {
      const saved = mode === 'create'
        ? await createModel({ ...payload, key: values.key.trim() })
        : await updateModel(model?.key ?? values.key, payload);
      onSaved(saved);
    } catch (cause) {
      const message = getModelErrorMessage(cause, '保存模型失败');
      const field = matchServerField(message);
      if (field) {
        setErrors((current) => ({ ...current, [field]: message }));
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModelFormDrawer
      mode={mode}
      isDefault={isDefault}
      values={values}
      errors={errors}
      submitting={submitting}
      submitError={submitError}
      onChange={handleChange}
      onClose={onClose}
      onSubmit={(event) => { void handleSubmit(event); }}
    />
  );
}
