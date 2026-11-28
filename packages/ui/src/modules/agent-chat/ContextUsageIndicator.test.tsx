import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContextUsageIndicator } from './ContextUsageIndicator';

describe('ContextUsageIndicator', () => {
  it('renders the usage percentage and details for an actual Runtime value', () => {
    const markup = renderToStaticMarkup(
      <ContextUsageIndicator usage={{ usedTokens: 32_000, maxTokens: 128_000, source: 'actual' }} />,
    );

    expect(markup).toContain('上下文用量 25%');
    expect(markup.split('</button>')[0]).not.toContain('>25%<');
    expect(markup).toContain('当前使用');
    expect(markup).toContain('32,000 Tokens');
    expect(markup).toContain('使用比例</dt><dd>25%</dd>');
    expect(markup).not.toContain('来源：');
    expect(markup).toContain('stroke-dasharray="14.137166941154069 56.548667764616276"');
  });

  it.each([
    [60, 'contextUsageWarning'],
    [85, 'contextUsageDanger'],
    [100, 'contextUsageDanger'],
  ])('uses the expected tone at %i%%', (percentage, tone) => {
    const markup = renderToStaticMarkup(
      <ContextUsageIndicator usage={{ usedTokens: percentage, maxTokens: 100, source: 'estimated' }} />,
    );
    expect(markup).toContain(tone);
    expect(markup).toContain(`>${percentage}%<`);
  });

  it('handles unavailable estimates without invalid SVG geometry', () => {
    const markup = renderToStaticMarkup(
      <ContextUsageIndicator usage={{ usedTokens: null, maxTokens: 0, source: 'estimated' }} />,
    );
    expect(markup).toContain('上下文用量 暂无数据');
    expect(markup).not.toContain('NaN');
    expect(markup).toContain('当前使用</dt><dd>--</dd>');
  });
});
