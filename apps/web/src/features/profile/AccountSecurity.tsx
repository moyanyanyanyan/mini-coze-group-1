import { useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError } from '../../shared/api/http';
import { changePassword } from './api/profile-api';
import type { ProfileUser } from './api/profile-api';

interface Feedback {
  type: 'ok' | 'error';
  text: string;
}

export function AccountSecurity({
  user,
  loggingOut,
  onLogout,
  onPasswordChanged,
}: {
  user: ProfileUser;
  loggingOut: boolean;
  onLogout: () => void;
  onPasswordChanged: () => void;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const handleSaved = (text: string) => {
    setPasswordOpen(false);
    setNotice(text);
    onPasswordChanged();
  };

  return (
    <section className="profile-section" aria-labelledby="profile-security-title">
      <div className="profile-section-heading">
        <div>
          <p>SECURITY</p>
          <h2 id="profile-security-title">账号安全</h2>
        </div>
      </div>

      <div className="profile-security-card profile-security-card--stack">
        <div className="profile-security-row">
          <span className="profile-security-icon" aria-hidden="true"><LockIcon /></span>
          <div className="profile-security-copy">
            <strong>登录密码</strong>
            <p>
              {notice || (user.hasPassword
                ? '已设置登录密码，可随时更换。'
                : '尚未设置密码，设置后可用邮箱密码登录。')}
            </p>
          </div>
          <span className="profile-status-badge">{user.hasPassword ? '已设置' : '未设置'}</span>
          <button
            type="button"
            aria-expanded={passwordOpen}
            aria-controls="profile-password-form"
            onClick={() => {
              setPasswordOpen((open) => !open);
              setNotice('');
            }}
          >
            {passwordOpen ? '收起' : user.hasPassword ? '修改密码' : '设置密码'}
          </button>
        </div>

        {passwordOpen ? (
          <PasswordForm
            hasPassword={user.hasPassword}
            onSaved={handleSaved}
            onCancel={() => setPasswordOpen(false)}
          />
        ) : null}
      </div>

      <div className="profile-security-card">
        <div className="profile-security-row">
          <span className="profile-security-icon" aria-hidden="true"><GoogleIcon /></span>
          <div className="profile-security-copy">
            <strong>Google 登录</strong>
            <p>{user.googleLinked ? '已绑定 Google 账号，可直接用 Google 登录。' : '当前未绑定 Google 账号。'}</p>
          </div>
          <span className="profile-status-badge">{user.googleLinked ? '已绑定' : '未绑定'}</span>
        </div>
      </div>

      <div className="profile-danger-zone">
        <div>
          <strong>退出当前账号</strong>
          <p>退出后需要重新验证身份才能进入工作台。</p>
        </div>
        <button type="button" onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? '正在退出…' : '退出登录'}
        </button>
      </div>
    </section>
  );
}

function PasswordForm({
  hasPassword,
  onSaved,
  onCancel,
}: {
  hasPassword: boolean;
  onSaved: (text: string) => void;
  onCancel: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const submit = async () => {
    if (saving) return;
    if (hasPassword && !currentPassword) {
      setFeedback({ type: 'error', text: '请输入当前密码' });
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 64) {
      setFeedback({ type: 'error', text: '新密码长度需为 8–64 位' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', text: '两次输入的新密码不一致' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await changePassword(hasPassword ? { currentPassword, newPassword } : { newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onSaved(hasPassword ? '密码已更新。' : '密码已设置，之后可用邮箱密码登录。');
    } catch (cause) {
      setFeedback({ type: 'error', text: passwordErrorText(cause, hasPassword) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      id="profile-password-form"
      className="profile-password-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {hasPassword ? (
        <PasswordInput
          label="当前密码"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
      ) : null}
      <PasswordInput
        label="新密码（8–64 位）"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
      />
      <PasswordInput
        label="确认新密码"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      <div className="profile-password-actions">
        <button type="submit" disabled={saving}>
          {saving ? '保存中…' : '保存密码'}
        </button>
        <button type="button" className="profile-password-cancel" onClick={onCancel} disabled={saving}>
          取消
        </button>
        {feedback ? (
          <span className={`profile-form-message profile-form-message--${feedback.type}`} role="status">
            {feedback.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function PasswordInput({
  label,
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="profile-password-field">
      <input
        type={visible ? 'text' : 'password'}
        placeholder={label}
        aria-label={label}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="profile-eye"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? `隐藏${label}` : `显示${label}`}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function passwordErrorText(cause: unknown, hasPassword: boolean) {
  if (cause instanceof ApiError) {
    if (cause.status === 401) {
      return hasPassword ? '当前密码不正确' : '登录状态已失效，请重新登录。';
    }
    return cause.message || '修改失败，请稍后再试';
  }
  return '修改失败，请稍后再试';
}

function IconShell({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function LockIcon() {
  return (
    <IconShell>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </IconShell>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22 12.2c0-.7-.06-1.2-.19-1.8H12v3.3h5.6a4.8 4.8 0 0 1-2.08 3.14v2.6h3.36C20.76 17.6 22 15.2 22 12.2Z" />
      <path fill="#34A853" d="M12 22c2.5 0 4.6-.83 6.13-2.25l-3.36-2.6c-.93.62-2.12.99-3.37.99-2.6 0-4.8-1.75-5.58-4.1H2.4v2.68A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.42 14.04a6 6 0 0 1 0-3.84V7.5H2.4a10 10 0 0 0 0 9l4.02-3.13Z" />
      <path fill="#EA4335" d="M12 5.9c1.41 0 2.68.49 3.68 1.44l2.76-2.76A9.7 9.7 0 0 0 12 2a10 10 0 0 0-8.94 5.5l4.02 3.14C7.86 7.65 9.74 5.9 12 5.9Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <IconShell>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </IconShell>
  );
}

function EyeOffIcon() {
  return (
    <IconShell>
      <path d="M10.6 5.6A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9" />
      <path d="M6.4 6.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.26 3.3-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </IconShell>
  );
}
