import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../agent-chat.module.css';

/**
 * 把模型输出的 markdown 渲染成排版好的富文本。
 *
 * 两个安全约定：
 *   1. 不加载 rehype-raw —— 模型输出里的 HTML 一律按纯文本处理，避免 XSS；
 *   2. 链接强制新窗口 + noreferrer，防止被诱导跳转后拿到 window.opener。
 *
 * 流式期间会随着 delta 反复重渲染，所以上层做了 rAF 批量刷新（见 AgentChatPage）。
 */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className={styles.markdown}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" />
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
