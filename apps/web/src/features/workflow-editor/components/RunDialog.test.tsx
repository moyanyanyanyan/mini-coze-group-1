import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RunDialogController } from './RunDialogController';
import type { WorkflowRunResult } from '../types/workflow';

function renderOutput(output: WorkflowRunResult['output']) {
  return renderToStaticMarkup(
    <RunDialogController
      workflowId="workflow"
      startNode={null}
      initialResult={{ runId: 'run', status: 'SUCCEEDED', output, nodeResults: [], error: null }}
      onClose={() => {}}
      onComplete={() => {}}
    />,
  );
}

it('多字段和数组输出显示为普通段落', () => {
  const html = renderOutput({ menu: '冬日菜单', preparation: ['提前备菜', '出锅即分餐'], season_branch: 'winter' });
  expect(html).toContain('<div class="wf-run-text">冬日菜单\n\n提前备菜\n\n出锅即分餐\n\nwinter</div>');
  expect(html).not.toContain('<pre');
});

it('保留单段正文换行，空结果显示提示', () => {
  expect(renderOutput({ text: '第一行\n第二行' })).toContain('第一行\n第二行');
  for (const output of [null, {}, { text: '' }]) {
    expect(renderOutput(output)).toContain('（空文本）');
  }
});

it('嵌套值保留数字零和布尔值，跳过空值', () => {
  expect(renderOutput({ data: { count: 0, enabled: false, missing: null } }))
    .toContain('<div class="wf-run-text">0\n\nfalse</div>');
});
