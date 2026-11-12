import { useEffect, useState } from 'react';
import { useConfirm } from '@minicoze/ui/hooks';
import { ModelListView, type ModelListItem } from '@minicoze/ui/model-management';
import {
  deleteModel,
  getModelErrorMessage,
  listModels,
  setDefaultModel,
  updateModel,
  type ModelSummary,
} from './model.api';

interface Props {
  includeDisabled: boolean;
  refreshKey: number;
  onToggleIncludeDisabled: (value: boolean) => void;
  onCreate: () => void;
  onEdit: (model: ModelSummary) => void;
}

function toListItem(model: ModelSummary): ModelListItem {
  return {
    key: model.key,
    displayName: model.displayName,
    description: model.description,
    provider: model.provider,
    upstreamModel: model.upstreamModel,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    supportsVision: model.supportsVision,
    enabled: model.enabled,
    isDefault: model.isDefault,
    sortOrder: model.sortOrder,
    usageCount: model.usageCount,
  };
}

export function ModelListController({
  includeDisabled, refreshKey, onToggleIncludeDisabled, onCreate, onEdit,
}: Props) {
  const { confirm, confirmation } = useConfirm();
  const [items, setItems] = useState<ModelListItem[] | null>(null);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    listModels(includeDisabled).then((data) => {
      if (!active) return;
      setItems(data.items.map(toListItem));
    }).catch((cause: unknown) => {
      if (!active) return;
      setItems(null);
      setError(getModelErrorMessage(cause, '加载模型列表失败'));
    });
    return () => { active = false; };
  }, [includeDisabled, refreshKey, revision]);

  const runAction = async (key: string, action: () => Promise<unknown>, fallback: string) => {
    setBusyKey(key);
    setError('');
    try {
      await action();
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(getModelErrorMessage(cause, fallback));
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleEnabled = async (item: ModelListItem) => {
    if (item.enabled) {
      const message = item.usageCount > 0
        ? `该模型已被 ${item.usageCount} 个智能体使用，停用后这些智能体的调用会失败。确定停用「${item.displayName}」吗？`
        : `确定停用「${item.displayName}」吗？停用后新建智能体将无法选择该模型。`;
      if (!(await confirm(message))) return;
    }
    await runAction(item.key, () => updateModel(item.key, { enabled: !item.enabled }), '更新模型状态失败');
  };

  const handleDelete = async (item: ModelListItem) => {
    if (item.usageCount > 0) return;
    if (!(await confirm(`确定要删除模型「${item.displayName}」吗？删除后不可恢复。`))) return;
    await runAction(item.key, () => deleteModel(item.key), '删除模型失败');
  };

  return (
    <>
      <ModelListView
        items={items}
        error={error}
        includeDisabled={includeDisabled}
        busyKey={busyKey}
        onToggleIncludeDisabled={onToggleIncludeDisabled}
        onRetry={() => setRevision((value) => value + 1)}
        onCreate={onCreate}
        onEdit={onEdit}
        onSetDefault={(item) => {
          void runAction(item.key, () => setDefaultModel(item.key), '设为默认失败');
        }}
        onToggleEnabled={(item) => { void handleToggleEnabled(item); }}
        onDelete={(item) => { void handleDelete(item); }}
      />
      {confirmation}
    </>
  );
}
