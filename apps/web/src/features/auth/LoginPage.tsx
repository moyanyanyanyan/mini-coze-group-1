import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, login } from './api/auth-api';
import { AuthField } from './components/AuthField';
import { AuthLayout } from './components/AuthLayout';
import { navigate } from '../../shared/routing/navigation';
import styles from './auth.module.css';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      </form>
    </AuthLayout>
  );
}
