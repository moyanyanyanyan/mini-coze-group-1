import { useState } from 'react';
import { ApiError } from '../../shared/api/http';
import { changePassword } from './api/profile-api';
import type { ProfileUser } from './api/profile-api';
import { Icon } from '@minicoze/ui/components';

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
    <div className="settings-list">
      <div className="settings-row">
        <div className="settings-label">
          <span>登录密码</span>
          <p>
            {notice || (user.hasPassword
              ? '已设置登录密码，可随时更换。'
              : '尚未设置密码，设置后可用邮箱密码登录。')}
          </p>
        </div>
        <div className="settings-value">
          <span className="settings-status">{user.hasPassword ? '已设置' : '未设置'}</span>
          <button
            type="button"
            className="profile-link-btn"
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
      </div>

      {passwordOpen ? (
        <PasswordForm
          hasPassword={user.hasPassword}
          onSaved={handleSaved}
          onCancel={() => setPasswordOpen(false)}
        />
      ) : null}

      <div className="settings-row">
        <div className="settings-label">
          <span>Google 登录</span>
          <p>{user.googleLinked ? '已绑定 Google 账号，可直接用 Google 登录。' : '当前未绑定 Google 账号。'}</p>
        </div>
        <div className="settings-value">
          <span className="settings-status">{user.googleLinked ? '已绑定' : '未绑定'}</span>
        </div>
      </div>

      <div className="settings-row settings-row--logout">
        <div className="settings-label">
          <span>退出登录</span>
          <p>退出后需要重新验证身份才能进入工作台。</p>
        </div>
        <div className="settings-value">
          <button type="button" className="profile-link-btn is-logout" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? '正在退出…' : '退出登录'}
          </button>
        </div>
      </div>
    </div>
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
      className="settings-inline-form"
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
      <div className="settings-inline-actions">
        <button type="submit" className="profile-btn is-primary" disabled={saving}>
          {saving ? '保存中…' : '保存密码'}
        </button>
        <button type="button" className="profile-btn is-secondary" onClick={onCancel} disabled={saving}>
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
        className="profile-input"
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
        title={visible ? `隐藏${label}` : `显示${label}`}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} />
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
