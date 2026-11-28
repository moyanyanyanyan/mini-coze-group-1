import type { ReactNode } from 'react';
import './agent-builder.css';

export interface AgentBuilderViewProps {
  loading: boolean;
  error: string | null;
  knowledgeError: boolean;
  pluginError: boolean;
  children: ReactNode;
  createDialog?: ReactNode;
}

export function AgentBuilderView({ loading, error, knowledgeError, pluginError, children, createDialog }: AgentBuilderViewProps) {
  return (
    <section className="feature-page agent-builder" aria-label="智能体创建">
      {error && <div className="agent-builder__error">{error}</div>}
      {loading ? (
        <div className="agent-builder__loading">加载中...</div>
      ) : (
        <>
          {children}
          {knowledgeError && <div className="agent-builder__note">知识库目录暂时不可用</div>}
          {pluginError && <div className="agent-builder__note">插件目录暂时不可用</div>}
          {createDialog}
        </>
      )}
    </section>
  );
}
