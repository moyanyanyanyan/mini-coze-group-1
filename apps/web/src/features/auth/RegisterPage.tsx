import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, register } from './api/auth-api';
import { AuthField } from './components/AuthField';
import { AuthLayout } from './components/AuthLayout';
import { navigate } from '../../shared/routing/navigation';
import styles from './auth.module.css';

interface FieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (displayName.trim().length < 2 || displayName.trim().length > 20) {
      errors.displayName = '昵称长度需为 2~20 个字符';
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = '请输入有效的邮箱地址';
    }

    if (password.length < 8) {
      errors.password = '密码至少 8 位';
    }

    if (confirmPassword !== password) {
      errors.confirmPassword = '两次输入的密码不一致';
    }

    return errors;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const errors = validate();
    setFieldErrors(errors);
    setFormError('');

    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await register({ email: email.trim().toLowerCase(), password, displayName: displayName.trim() });
      navigate('/login');
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : '网络异常，请稍后再试');
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="创建账号"
      description="注册后即可搭建属于你的智能体。"
      footer={{ text: '已经有账号了？', label: '去登录', to: '/login' }}
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <AuthField
          label="昵称"
          type="text"
          value={displayName}
          placeholder="怎么称呼你"
          autoComplete="nickname"
          error={fieldErrors.displayName}
          onChange={setDisplayName}
        />
        <AuthField
          label="邮箱"
          type="email"
          value={email}
          placeholder="you@example.com"
          autoComplete="email"
          error={fieldErrors.email}
          onChange={setEmail}
        />
        <AuthField
          label="密码"
          type="password"
          value={password}
          placeholder="至少 8 位"
          autoComplete="new-password"
          error={fieldErrors.password}
          onChange={setPassword}
        />
        <AuthField
          label="确认密码"
          type="password"
          value={confirmPassword}
          placeholder="再输入一次密码"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          onChange={setConfirmPassword}
        />

        {formError ? <p className={styles.alert} role="alert">{formError}</p> : null}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? '注册中…' : '注册'}
        </button>
      </form>
    </AuthLayout>
  );
}
