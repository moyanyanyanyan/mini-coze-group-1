import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, register } from './api/auth-api';
import { RegisterView } from '@minicoze/ui/auth';
import { AppLink } from '../../shared/routing/AppLink';
import { navigate } from '../../shared/routing/navigation';

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
    <RegisterView
      displayName={displayName}
      onDisplayNameChange={setDisplayName}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      confirmPassword={confirmPassword}
      onConfirmPasswordChange={setConfirmPassword}
      formError={formError}
      submitting={submitting}
      handleSubmit={handleSubmit}
      LinkComponent={AppLink}
      footerRoute="/login"
      fieldErrors={fieldErrors}
    />
  );
}
