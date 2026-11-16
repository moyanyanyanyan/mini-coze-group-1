import { useEffect, useState } from 'react';
import { logout } from '../auth/api/auth-api';
import { ApiError } from '../../shared/api/http';
import { getProfile, saveDisplayName } from './api/profile-api';
import { AccountSecurity } from './AccountSecurity';
import type { ProfileUser } from './api/profile-api';
import { navigate } from '../../shared/routing/navigation';
import './profile.css';

type ProfileSection = 'profile' | 'security' | 'account';

interface Feedback {
  type: 'ok' | 'error';
  text: string;
}

const profileSections: Array<{
  id: ProfileSection;
  label: string;
  description: string;
}> = [
  { id: 'profile', label: '个人资料', description: '头像与公开资料' },
  { id: 'security', label: '账号安全', description: '密码与登录方式' },
  { id: 'account', label: '账户信息', description: '账号标识与时间' },
];

export function ProfilePage() {
  const [activeSection, setActiveSection] = useState<ProfileSection>('profile');
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [copyLabel, setCopyLabel] = useState('复制');
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<Feedback | null>(null);

  const applyUser = (profile: ProfileUser) => {
    setUser(profile);
    setDisplayName(profile.displayName);
  };

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((profile) => {
        if (alive) applyUser(profile);
      })
      .catch((cause: unknown) => {
        if (alive) setLoadError(errorText(cause, '无法加载账户信息，请确认登录状态后重试。'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const copyUserId = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopyLabel('已复制');
    } catch {
      setCopyLabel('复制失败');
    }
  };

  const handleSaveName = async () => {
    if (!user || savingName) return;
    const next = displayName.trim();
    if (!next) {
      setNameFeedback({ type: 'error', text: '昵称不能为空' });
      return;
    }
    setSavingName(true);
    setNameFeedback(null);
    try {
      const updated = await saveDisplayName(next);
      // 页面数据以接口响应为准
      setUser((current) => (current ? { ...current, ...updated } : current));
      setDisplayName(updated.displayName);
      setNameFeedback({ type: 'ok', text: '昵称已保存' });
    } catch (cause) {
      setNameFeedback({ type: 'error', text: errorText(cause, '保存失败，请稍后再试') });
    } finally {
      setSavingName(false);
    }
  };

  const refreshProfile = () => {
    getProfile()
      .then(applyUser)
      .catch(() => {
        // 密码已改成功，刷新资料失败不覆盖成功提示
      });
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  return (
    <section className="feature-page profile-page" aria-labelledby="profile-title">
      <header className="profile-header">
        <p>Account / Profile</p>
        <h1 id="profile-title">个人中心</h1>
        <span>管理你的 MiniCoze 账户资料与安全设置。</span>
      </header>

      <div className="profile-layout">
        <nav className="profile-nav" aria-label="个人中心分类">
          {profileSections.map((section) => (
            <button
              type="button"
              className={activeSection === section.id ? 'is-active' : ''}
              aria-current={activeSection === section.id ? 'page' : undefined}
              onClick={() => setActiveSection(section.id)}
              key={section.id}
            >
              <span>{section.label}</span>
              <small>{section.description}</small>
            </button>
          ))}
        </nav>

        <div className="profile-panel">
          {loading ? (
            <div className="profile-state">正在加载账户信息…</div>
          ) : loadError || !user ? (
            <div className="profile-state profile-state--error">
              <strong>账户信息不可用</strong>
              <p>{loadError || '请重新登录后再试。'}</p>
              <button type="button" onClick={() => navigate('/login')}>前往登录</button>
            </div>
          ) : (
            <>
              {activeSection === 'profile' && (
                <ProfileDetails
                  user={user}
                  displayName={displayName}
                  onDisplayNameChange={(value) => {
                    setDisplayName(value);
                    setNameFeedback(null);
                  }}
                  onSave={() => void handleSaveName()}
                  saving={savingName}
                  dirty={displayName.trim() !== user.displayName}
                  feedback={nameFeedback}
                  copyLabel={copyLabel}
                  onCopyUserId={() => void copyUserId()}
                />
              )}
              {activeSection === 'security' && (
                <AccountSecurity
                  user={user}
                  loggingOut={loggingOut}
                  onLogout={() => void handleLogout()}
                  onPasswordChanged={refreshProfile}
                />
              )}
              {activeSection === 'account' && (
                <AccountInformation
                  user={user}
                  copyLabel={copyLabel}
                  onCopyUserId={() => void copyUserId()}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ProfileDetails({
  user,
  displayName,
  onDisplayNameChange,
  onSave,
  saving,
  dirty,
  feedback,
  copyLabel,
  onCopyUserId,
}: {
  user: ProfileUser;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  feedback: Feedback | null;
  copyLabel: string;
  onCopyUserId: () => void;
}) {
  const initial = (displayName || user.email).trim().charAt(0).toUpperCase() || '?';
  return (
    <section className="profile-section" aria-labelledby="profile-details-title">
      <div className="profile-section-heading">
        <div>
          <p>PROFILE</p>
          <h2 id="profile-details-title">个人资料</h2>
        </div>
      </div>

      <div className="profile-identity">
        <div className="profile-avatar">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="用户头像" /> : initial}
        </div>
        <div className="profile-identity-copy">
          <strong>{displayName || user.email}</strong>
          <span>{user.email}</span>
        </div>
        <button type="button" disabled title="头像上传暂未开放">更换头像</button>
      </div>

      <div className="profile-form">
        <label>
          <span>昵称</span>
          <input
            value={displayName}
            maxLength={20}
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
        </label>
        <label>
          <span>邮箱</span>
          <input value={user.email} readOnly />
        </label>
        <label>
          <span>用户 ID</span>
          <div className="profile-copy-row">
            <input value={user.id} readOnly />
            <button type="button" onClick={onCopyUserId}>{copyLabel}</button>
          </div>
        </label>
        <div className="profile-form-actions">
          <button type="button" onClick={onSave} disabled={saving || !dirty}>
            {saving ? '保存中…' : '保存资料'}
          </button>
          {feedback ? (
            <span className={`profile-form-message profile-form-message--${feedback.type}`} role="status">
              {feedback.text}
            </span>
          ) : (
            <span>昵称长度 1–20 字。</span>
          )}
        </div>
      </div>
    </section>
  );
}

function AccountInformation({
  user,
  copyLabel,
  onCopyUserId,
}: {
  user: ProfileUser;
  copyLabel: string;
  onCopyUserId: () => void;
}) {
  return (
    <section className="profile-section" aria-labelledby="profile-account-title">
      <div className="profile-section-heading">
        <div>
          <p>ACCOUNT</p>
          <h2 id="profile-account-title">账户信息</h2>
        </div>
      </div>

      <dl className="profile-info-list">
        <div>
          <dt>邮箱</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>用户 ID</dt>
          <dd className="profile-info-id">
            <code>{user.id}</code>
            <button type="button" onClick={onCopyUserId}>{copyLabel}</button>
          </dd>
        </div>
        <div>
          <dt>登录方式</dt>
          <dd>{user.hasPassword ? (user.googleLinked ? '邮箱密码 + Google' : '邮箱密码') : 'Google'}</dd>
        </div>
      </dl>
    </section>
  );
}

function errorText(cause: unknown, fallback: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return '登录状态已失效，请重新登录。';
    return cause.message || fallback;
  }
  return fallback;
}
