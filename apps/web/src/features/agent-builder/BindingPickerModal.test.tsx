import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BindingPickerModal } from './BindingPickerModal';

const props = {
  title: '添加插件', items: [{ id: 'plugin_echo', title: '回显' }],
  selectedIds: ['plugin_echo'], onConfirm: () => undefined, onClose: () => undefined,
};

describe('BindingPickerModal', () => {
  it('保存时禁用选择、确认和关闭按钮并显示进度', () => {
    const markup = renderToStaticMarkup(<BindingPickerModal {...props} saving />);
    const controls = markup.match(/<(?:button|input)\b[^>]*>/g) ?? [];
    expect(controls).toHaveLength(4);
    expect(controls.every((control) => control.includes('disabled'))).toBe(true);
    expect(markup).toContain('保存中…');
  });

  it('失败后显示错误，保留勾选并允许重试', () => {
    const markup = renderToStaticMarkup(<BindingPickerModal {...props} error="保存失败，请重试" />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('保存失败，请重试');
    expect(markup).toContain('checked=""');
    expect(markup).not.toContain('disabled');
  });
});
