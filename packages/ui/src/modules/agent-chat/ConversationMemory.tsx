import type { ConversationMemoryData as Memory } from './types';
import './conversation-memory.css';

export function ConversationMemory({ memory, error, loading, onRefresh }: {
  memory?: Memory; error?: string; loading?: boolean; onRefresh?: () => void;
}) {
  return <details className="conversation-memory">
    <summary>上下文与记忆 · {loading ? '更新中…' : memory ? `约剩 ${memory.remainingTokens.toLocaleString()} Token` : '暂不可用'}</summary>
    <div className="conversation-memory-body" aria-busy={loading || undefined}>
      {error && <p role="alert">{error}</p>}
      {onRefresh && <button type="button" disabled={loading} onClick={onRefresh}>刷新记忆</button>}
      {memory && <>
        <div className="conversation-memory-metrics">
          <span>服务上下文预算 <strong>{memory.tokenLimit.toLocaleString()} Token</strong></span>
          <span>输入保守估算 <strong>{memory.estimatedInputTokens.toLocaleString()} Token</strong></span>
          <span>预留输出 <strong>{memory.reservedOutputTokens.toLocaleString()} Token</strong></span>
          <span>可用余量（估算） <strong>{memory.remainingTokens.toLocaleString()} Token</strong></span>
        </div>
        <progress aria-label="上下文预算占用（保守估算）" value={memory.tokenLimit - memory.remainingTokens} max={memory.tokenLimit} />
        <p>{memory.effectiveTurns === 0 ? '历史记忆已关闭，不带入之前的问答。' : <>短期滑动窗口：保留 {memory.retainedTurns} / {memory.effectiveTurns} 轮完整问答，空余 {memory.availableTurns} 轮位置；窗口满后移除最旧问答，不会停止聊天。</>}</p>
        {memory.configuredTurns > memory.effectiveTurns && <p>智能体配置 {memory.configuredTurns} 轮，当前 Runtime 最多支持 {memory.effectiveTurns} 轮。</p>}
        {memory.droppedTurns > 0 && <p>本次预算预检另外移除了最旧的 {memory.droppedTurns} 轮。</p>}
        <p>按 UTF-8 字节数保守估算，并非模型精确 Token 数。这里按智能体当前配置预览下一轮的基础上下文；尚未计入新问题、待发送附件、检索结果和工具定义，实际发送时可能继续移除旧问答。</p>
        <details><summary>系统提示词</summary><pre>{memory.systemPrompt || '未配置系统提示词'}</pre></details>
        <h4>当前可带入的记忆内容</h4>
        <p>仅带入已完成的完整问答；附件按现有规则保留正文或摘要。没有独立的长期记忆或自动总结。</p>
        {!memory.history.length && <p>当前没有可带入的历史问答。</p>}
        {memory.history.map((message, index) => <details key={message.id}>
          <summary>第 {Math.floor(index / 2) + 1} 轮 · {message.role === 'user' ? '用户' : '助手'}</summary>
          <pre>{message.content}</pre>
        </details>)}
        <small>预览更新于 {new Date(memory.asOf).toLocaleString('zh-CN')}</small>
      </>}
    </div>
  </details>;
}
