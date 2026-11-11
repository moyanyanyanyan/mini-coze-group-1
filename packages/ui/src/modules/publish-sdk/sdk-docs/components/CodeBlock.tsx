import { useEffect, useRef, useState } from 'react';
import type { NoticeType } from '../../../../hooks';
import type { CodeSample } from '../data/api-docs.data';

interface CodeBlockProps {
  sample: CodeSample;
  onNotice: (type: NoticeType, message: string) => void;
}

export type CodeTokenKind = 'plain' | 'comment' | 'string' | 'keyword' | 'type' | 'number';

export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

const TOKEN_PATTERN = /\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|const|await|async|new|try|catch|throw|return|for|of|if|break|continue)\b|\b(?:string|number|boolean|object|event|unknown)\b|\b\d+(?:\.\d+)?\b/g;
const TYPE_WORDS = new Set(['string', 'number', 'boolean', 'object', 'event', 'unknown']);

function getTokenKind(token: string): CodeTokenKind {
  if (token.startsWith('//') || token.startsWith('#')) {
    return 'comment';
  }

  if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
    return 'string';
  }

  if (/^\d/.test(token)) {
    return 'number';
  }

  return TYPE_WORDS.has(token) ? 'type' : 'keyword';
}

export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let cursor = 0;

  for (const match of code.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;

    if (index > cursor) {
      tokens.push({ text: code.slice(cursor, index), kind: 'plain' });
    }

    tokens.push({ text: match[0], kind: getTokenKind(match[0]) });
    cursor = index + match[0].length;
  }

  if (cursor < code.length) {
    tokens.push({ text: code.slice(cursor), kind: 'plain' });
  }

  return tokens;
}

export function CodeBlock({ sample, onNotice }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
  }, []);

  const copyCode = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }

      await navigator.clipboard.writeText(sample.code);
      setCopied(true);
      onNotice('success', '代码已复制');

      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }

      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 2000);
    } catch {
      setCopied(false);
      onNotice('error', '复制失败，请手动复制代码');
    }
  };

  return (
    <div className="api-doc-code">
      <div className="api-doc-code__header">
        <span>{sample.language}</span>
        <button type="button" onClick={() => void copyCode()}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>
        <code>
          {tokenizeCode(sample.code).map((token, index) => (
            <span className={`api-doc-code__token--${token.kind}`} key={index}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
      <span className="visually-hidden">{sample.label}</span>
    </div>
  );
}
