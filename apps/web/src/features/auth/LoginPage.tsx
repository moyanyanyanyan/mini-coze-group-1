import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, login } from './api/auth-api';
import { AuthField } from './components/AuthField';
import { AuthLayout } from './components/AuthLayout';
import { navigate } from '../../shared/routing/navigation';
import styles from './auth.module.css';

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
    <AuthLayout
      title="登录 MiniCoze"
      description="用邮箱继续，进入你的智能体工作台。"
      footer={{ text: '还没有账号？', label: '免费注册', to: '/register' }}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <AuthField
          label="邮箱"
          type="email"
          value={email}
          placeholder="you@example.com"
          autoComplete="email"
          onChange={setEmail}
        />
        <AuthField
          label="密码"
          type="password"
          value={password}
          placeholder="请输入密码"
          autoComplete="current-password"
          onChange={setPassword}
        />

        {formError ? <p className={styles.alert} role="alert">{formError}</p> : null}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? '登录中…' : '登录'}
        </button>

        {/* 分隔线 */}
        <div className={styles.divider}>
          <span className={styles.dividerText}>或</span>
        </div>

        {/* Google 官方四色 G 标，内联 SVG 免依赖 */}
        <button className={styles.googleButton} type="button" onClick={handleGoogleLogin}>
          <svg className={styles.googleIcon} viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
          </svg>
          使用 Google 账号继续
        </button>
      </form>
    </AuthLayout>
  );
}
