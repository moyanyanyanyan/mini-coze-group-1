import type { FormEvent } from 'react';
import type { LinkComponentType } from '../../layouts/types';
import { AuthField } from './AuthField';
import { AuthLayout } from './AuthLayout';
import styles from './auth.module.css';

export interface RegistrationFieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export interface RegisterViewProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  formError: string;
  submitting: boolean;
  handleSubmit: (event: FormEvent) => void;
  LinkComponent: LinkComponentType;
  footerRoute: string;
  fieldErrors: RegistrationFieldErrors;
}

export function RegisterView({
  displayName, onDisplayNameChange, email, onEmailChange, password, onPasswordChange, confirmPassword, onConfirmPasswordChange, formError, submitting, handleSubmit, LinkComponent, footerRoute, fieldErrors
}: RegisterViewProps) {
  return (
    <AuthLayout
      LinkComponent={LinkComponent}
      title="创建账号"
      description="注册后即可搭建属于你的智能体。"
      footer={{ text: '已经有账号了？', label: '去登录', to: footerRoute }}
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <AuthField
          label="昵称"
          type="text"
          value={displayName}
          placeholder="怎么称呼你"
          autoComplete="nickname"
          error={fieldErrors.displayName}
          onChange={onDisplayNameChange}
        />
        <AuthField
          label="邮箱"
          type="email"
          value={email}
          placeholder="you@example.com"
          autoComplete="email"
          error={fieldErrors.email}
          onChange={onEmailChange}
        />
        <AuthField
          label="密码"
          type="password"
          value={password}
          placeholder="至少 8 位"
          autoComplete="new-password"
          error={fieldErrors.password}
          onChange={onPasswordChange}
        />
        <AuthField
          label="确认密码"
          type="password"
          value={confirmPassword}
          placeholder="再输入一次密码"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          onChange={onConfirmPasswordChange}
        />

        {formError ? <p className={styles.alert} role="alert">{formError}</p> : null}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? '注册中…' : '注册'}
        </button>
      </form>
    </AuthLayout>
  );
}
