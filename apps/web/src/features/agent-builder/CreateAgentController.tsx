import { useState } from 'react';
import { CreateAgentView } from '@minicoze/ui/agent-builder';

interface Props {
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => void;
}

export function CreateAgentController({ onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <CreateAgentView
      name={name}
      description={description}
      error={error}
      canSubmit={Boolean(name.trim())}
      onNameChange={(value) => { setName(value); setError(null); }}
      onDescriptionChange={(value) => { setDescription(value); setError(null); }}
      onClose={onClose}
      handleSubmit={handleSubmit}
    />
  );
}
