import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, login } from './api/auth-api';
import { LoginView } from '@minicoze/ui/auth';
import { AppLink } from '../../shared/routing/AppLink';
import { navigate } from '../../shared/routing/navigation';

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_STATE_MISMATCH: '登录会话已过期，请重新点一次 Google 登录',
  GOOGLE_TOKEN_EXCHANGE_FAILED: 'Google 登录暂时失败，请稍后再试',
  GOOGLE_EMAIL_NOT_VERIFIED: '该 Google 账号的邮箱未验证，请换一个账号',
  INTERNAL_ERROR: '登录失败，请稍后再试',
};

/** 一次性读取 query 里的错误码（Google 登录失败时后端 302 回 /login?error=码） */
function readOAuthError(): string {
  const code = new URLSearchParams(window.location.search).get('error');
  if (!code) {
    return '';
  }
  // 读一次就擦掉地址栏的 query，用户刷新页面时不重复报错
  window.history.replaceState({}, '', window.location.pathname);
  return GOOGLE_ERROR_MESSAGES[code] ?? '登录失败，请稍后再试';
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 惰性初始化：只在页面首次渲染时读一次 query，之后 setFormError 照常用
  const [formError, setFormError] = useState(readOAuthError);
  const [submitting, setSubmitting] = useState(false);

  const handleGoogleLogin = () => {
    // 必须整页跳转，不能 fetch：用户要亲眼看到 Google 的授权页。
    // 用相对路径：走的是和 fetch 一样的 /api 代理，不用写死后端地址、没有跨域问题
    window.location.href = '/api/auth/google';
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      await login({ email: email.trim().toLowerCase(), password });
      navigate('/workspace');
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : '网络异常，请稍后再试');
      setSubmitting(false);
    }
  };

  return (
    <LoginView
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      formError={formError}
      submitting={submitting}
      handleSubmit={handleSubmit}
      LinkComponent={AppLink}
      footerRoute="/register"
      handleGoogleLogin={handleGoogleLogin}
    />
  );
}
