import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LoginView } from './LoginView';
import { RegisterView } from './RegisterView';
import type { LinkProps } from '../../layouts/types';

const noop = () => undefined;
const Link = ({ to, ...props }: LinkProps) => <a href={to} {...props} />;

describe('authentication views', () => {
  it('renders login errors and pending state without accessing the URL or authentication API', () => {
    const html = renderToStaticMarkup(
      <LoginView email="test@example.com" password="" formError="登录失败"
        submitting onEmailChange={noop} onPasswordChange={noop} handleSubmit={noop}
        handleGoogleLogin={noop} LinkComponent={Link} footerRoute="/custom-register" />,
    );
    expect(html).toContain('role="alert">登录失败');
    expect(html).toMatch(/type="submit" disabled="">登录中…/);
    expect(html).toContain('href="/custom-register"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('使用 Google 账号继续');
  });

  it('renders registration field errors separately from server errors', () => {
    const html = renderToStaticMarkup(
      <RegisterView displayName="" email="" password="" confirmPassword=""
        fieldErrors={{ email: '邮箱错误', confirmPassword: '密码不一致' }} formError="注册失败"
        submitting={false} onDisplayNameChange={noop} onEmailChange={noop}
        onPasswordChange={noop} onConfirmPasswordChange={noop} handleSubmit={noop}
        LinkComponent={Link} footerRoute="/custom-login" />,
    );
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(html).toContain('邮箱错误');
    expect(html).toContain('密码不一致');
    expect(html).toContain('role="alert">注册失败');
    expect(html).toContain('href="/custom-login"');
    expect(html).toContain('noValidate=""');
  });
});
