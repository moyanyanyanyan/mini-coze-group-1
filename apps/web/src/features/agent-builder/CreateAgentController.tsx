import { useState } from 'react';
import { CreateAgentView, type AgentModelOption } from '@minicoze/ui/agent-builder';
import { defaultModelKey } from './agentModels';

interface Props {
  modelOptions: AgentModelOption[];
  modelNotice: string | null;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; model: string; openingMessage: string }) => void;
}

export function CreateAgentController({ modelOptions, modelNotice, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState(() => defaultModelKey(modelOptions));
  const [openingMessage, setOpeningMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请填写智能体名称');
      return;
    }
    if (name.length > 50) {
      setError('名称不能超过 50 字');
      return;
    }
    if (description.length > 200) {
      setError('描述不能超过 200 字');
      return;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      model,
      openingMessage: openingMessage.trim(),
    });
  };

  return (
    <CreateAgentView
      name={name}
      description={description}
      model={model}
      modelOptions={modelOptions}
      modelNotice={modelNotice}
      openingMessage={openingMessage}
      error={error}
      canSubmit={Boolean(name.trim())}
      onNameChange={(value) => { setName(value); setError(null); }}
      onDescriptionChange={(value) => { setDescription(value); setError(null); }}
      onModelChange={setModel}
      onOpeningMessageChange={setOpeningMessage}
      onClose={onClose}
      handleSubmit={handleSubmit}
    />
  );
}
