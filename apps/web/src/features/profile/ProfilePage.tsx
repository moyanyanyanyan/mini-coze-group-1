import { useEffect, useRef, useState, type ReactNode } from 'react';
import { logout } from '../auth/api/auth-api';
import { ApiError } from '../../shared/api/http';
import { getProfile, saveBio, saveDisplayName, saveGlobalPrompt, uploadAvatar, AVATAR_MIME_TYPES, MAX_AVATAR_BYTES } from './api/profile-api';
import { AccountSecurity } from './AccountSecurity';
import { ProfileParticles } from './ProfileParticles';
import type { ProfileUser } from './api/profile-api';
import { navigate } from '../../shared/routing/navigation';
import { setCurrentUser } from '../../shared/user/current-user';
import {
  useAppearance,
  setTheme,
  setAccent,
  setFontSize,
  setDensity,
  type AccentColor,
  type Appearance,
  type DensityPreference,
  type FontSizePreference,
  type ThemePreference,
} from '../../shared/theme/theme-store';
import { Icon } from '@minicoze/ui/components';
import './profile.css';

type ProfileSection = 'profile' | 'security' | 'account' | 'appearance' | 'personalization';

interface Feedback {
  type: 'ok' | 'error';
  text: string;
}

const NAV_GROUPS: Array<{
  id: string;
  label: string;
  items: Array<{ id: ProfileSection; label: string; short: string }>;
}> = [
  {
    id: 'account',
    label: '账户信息',
    items: [
      { id: 'profile', label: '个人资料', short: '资料' },
      { id: 'security', label: '账户安全', short: '安全' },
      { id: 'account', label: '账户信息', short: '信息' },
    ],
  },
  {
    id: 'appearance',
    label: '个性化设置',
    items: [
      { id: 'appearance', label: '外观', short: '外观' },
      { id: 'personalization', label: '全局 Prompt', short: 'Prompt' },
    ],
  },
];

const SECTION_TITLES: Record<ProfileSection, string> = {
  profile: '个人资料',
  security: '账户安全',
  account: '账户信息',
  appearance: '外观',
  personalization: '全局 Prompt',
};

const PROMPT_MAX_LENGTH = 4000;
const BIO_MAX_LENGTH = 120;
const NAV_STORAGE_KEY = 'minicoze-profile-nav-collapsed';

export function ProfilePage() {
  const [activeSection, setActiveSection] = useState<ProfileSection>('profile');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(NAV_STORAGE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [copyLabel, setCopyLabel] = useState('复制');
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<Feedback | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback | null>(null);
  const [globalPrompt, setGlobalPrompt] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptFeedback, setPromptFeedback] = useState<Feedback | null>(null);
  const [bio, setBio] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [bioFeedback, setBioFeedback] = useState<Feedback | null>(null);

  const appearance = useAppearance();

  const applyUser = (profile: ProfileUser) => {
    setUser(profile);
    setDisplayName(profile.displayName);
    setGlobalPrompt(profile.globalPrompt ?? '');
    setBio(profile.bio ?? '');
    setCurrentUser(profile);
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

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(NAV_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const selectSection = (section: ProfileSection) => {
    setActiveSection(section);
    setMobileOpen(false);
  };

  const copyUserId = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopyLabel('已复制');
    } catch {
      setCopyLabel('复制失败');
    }
  };

  const handleSaveName = async (): Promise<boolean> => {
    if (!user || savingName) return false;
    const next = displayName.trim();
    if (!next) {
      setNameFeedback({ type: 'error', text: '昵称不能为空' });
      return false;
    }
    setSavingName(true);
    setNameFeedback(null);
    try {
      const updated = await saveDisplayName(next);
      const merged = { ...user, ...updated };
      setUser(merged);
      setCurrentUser(merged);
      setDisplayName(updated.displayName);
      setNameFeedback({ type: 'ok', text: '昵称已保存' });
      return true;
    } catch (cause) {
      setNameFeedback({ type: 'error', text: errorText(cause, '保存失败，请稍后再试') });
      return false;
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveBio = async (value: string): Promise<boolean> => {
    if (!user || savingBio) return false;
    const next = value.trim();
    setSavingBio(true);
    setBioFeedback(null);
    try {
      const updated = await saveBio(next);
      const merged = { ...user, ...updated };
      setUser(merged);
      setCurrentUser(merged);
      setBio(updated.bio ?? '');
      setBioFeedback({ type: 'ok', text: '简介已保存' });
      return true;
    } catch (cause) {
      setBioFeedback({ type: 'error', text: errorText(cause, '保存失败，请稍后再试') });
      return false;
    } finally {
      setSavingBio(false);
    }
  };

  const handleAvatarFile = async (file: File) => {
    if (!user || avatarUploading) return;
    if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
      setAvatarFeedback({ type: 'error', text: '仅支持 JPG、PNG、WebP 格式的图片' });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarFeedback({ type: 'error', text: '头像大小不能超过 5MB' });
      return;
    }
    setAvatarUploading(true);
    setAvatarFeedback(null);
    try {
      const updated = await uploadAvatar(file);
      const merged = { ...user, ...updated };
      setUser(merged);
      setCurrentUser(merged);
      setAvatarFeedback({ type: 'ok', text: '头像已更新' });
    } catch (cause) {
      setAvatarFeedback({ type: 'error', text: errorText(cause, '头像上传失败，请稍后再试') });
    } finally {
      setAvatarUploading(false);
    }
  };

  const persistPrompt = async (value: string, successText: string) => {
    if (!user || savingPrompt) return;
    setSavingPrompt(true);
    setPromptFeedback(null);
    try {
      const updated = await saveGlobalPrompt(value);
      setUser(updated);
      setCurrentUser(updated);
      setGlobalPrompt(updated.globalPrompt ?? '');
      setPromptFeedback({ type: 'ok', text: successText });
    } catch (cause) {
      setPromptFeedback({ type: 'error', text: errorText(cause, '保存失败，请稍后再试') });
    } finally {
      setSavingPrompt(false);
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
    <section className="feature-page profile-page" aria-labelledby="profile-page-title">
      <div className={`profile-shell${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}>
        <button
          type="button"
          className="profile-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />

        <aside className="profile-sidebar" aria-label="个人中心导航">
          <div className="profile-sidebar-top">
            <button
              type="button"
              className="profile-icon-btn"
              aria-label={collapsed ? '展开导航' : '收起导航'}
              title={collapsed ? '展开导航' : '收起导航'}
              onClick={toggleCollapsed}
            >
              <Icon name={collapsed ? 'arrow-right' : 'arrow-left'} />
            </button>
            {!collapsed ? (
              <button type="button" className="profile-link-btn" onClick={() => navigate('/workspace')}>
                返回工作台
              </button>
            ) : null}
          </div>

          <nav className="profile-nav">
            {NAV_GROUPS.map((group) => (
              <div className="profile-nav-group" key={group.id}>
                {!collapsed ? <p className="profile-nav-group-title">{group.label}</p> : null}
                {group.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`profile-nav-item${activeSection === item.id ? ' is-active' : ''}`}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                    title={item.label}
                    onClick={() => selectSection(item.id)}
                  >
                    {collapsed ? item.short : item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="profile-body">
          <ProfileParticles />

          <div className="profile-mobile-bar">
            <button
              type="button"
              className="profile-icon-btn"
              aria-label="打开导航"
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span>{SECTION_TITLES[activeSection]}</span>
          </div>

          <div className="profile-scroll">
            <div
              className={`profile-content${activeSection === 'profile' ? ' is-identity' : ''}${activeSection === 'security' ? ' is-narrow' : ''}`}
            >
              {activeSection !== 'profile' ? (
                <h1 className="profile-title" id="profile-page-title">{SECTION_TITLES[activeSection]}</h1>
              ) : null}
              {activeSection === 'security' ? (
                <p className="profile-subtitle">管理您的登录凭证与第三方账号绑定</p>
              ) : null}

              {loading ? (
                <p className="profile-state">正在加载账户信息…</p>
              ) : loadError || !user ? (
                <div className="profile-state profile-state--error">
                  <strong>账户信息不可用</strong>
                  <p>{loadError || '请重新登录后再试。'}</p>
                  <button type="button" className="profile-btn is-secondary" onClick={() => navigate('/login')}>
                    前往登录
                  </button>
                </div>
              ) : (
                <>
                  {activeSection === 'profile' && (
                    <ProfileIdentity
                      user={user}
                      displayName={displayName}
                      onDisplayNameChange={(value) => {
                        setDisplayName(value);
                        setNameFeedback(null);
                      }}
                      onSave={handleSaveName}
                      saving={savingName}
                      feedback={nameFeedback}
                      bio={bio}
                      onBioChange={(value) => {
                        setBio(value);
                        setBioFeedback(null);
                      }}
                      onSaveBio={handleSaveBio}
                      savingBio={savingBio}
                      bioFeedback={bioFeedback}
                      avatarUploading={avatarUploading}
                      avatarFeedback={avatarFeedback}
                      onAvatarFile={(file) => void handleAvatarFile(file)}
                      copyLabel={copyLabel}
                      onCopyUserId={() => void copyUserId()}
                    />
                  )}
                  {activeSection === 'account' && (
                    <AccountInformation
                      user={user}
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
                  {activeSection === 'appearance' && (
                    <AppearanceSection appearance={appearance} />
                  )}
                  {activeSection === 'personalization' && (
                    <PersonalizationSection
                      prompt={globalPrompt}
                      saving={savingPrompt}
                      dirty={globalPrompt !== (user.globalPrompt ?? '')}
                      feedback={promptFeedback}
                      onChange={(value) => {
                        setGlobalPrompt(value);
                        setPromptFeedback(null);
                      }}
                      onSave={() => void persistPrompt(globalPrompt, '全局 Prompt 已保存')}
                      onClear={() => void persistPrompt('', '全局 Prompt 已清空')}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <span>{label}</span>
        {hint ? <p>{hint}</p> : null}
      </div>
      <div className="settings-value">{children}</div>
    </div>
  );
}

function ProfileIdentity({
  user,
  displayName,
  onDisplayNameChange,
  onSave,
  saving,
  feedback,
  bio,
  onBioChange,
  onSaveBio,
  savingBio,
  bioFeedback,
  avatarUploading,
  avatarFeedback,
  onAvatarFile,
  copyLabel,
  onCopyUserId,
}: {
  user: ProfileUser;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  onSave: () => Promise<boolean>;
  saving: boolean;
  feedback: Feedback | null;
  bio: string;
  onBioChange: (value: string) => void;
  onSaveBio: (value: string) => Promise<boolean>;
  savingBio: boolean;
  bioFeedback: Feedback | null;
  avatarUploading: boolean;
  avatarFeedback: Feedback | null;
  onAvatarFile: (file: File) => void;
  copyLabel: string;
  onCopyUserId: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const initial = (displayName || user.email).trim().charAt(0).toUpperCase() || '?';
  const avatarInput = useRef<HTMLInputElement>(null);

  const openAvatarPicker = () => {
    if (!avatarUploading) avatarInput.current?.click();
  };

  const submitName = async () => {
    if (await onSave()) {
      setEditingName(false);
    }
  };

  const submitBio = async () => {
    if (await onSaveBio(bio)) {
      setEditingBio(false);
    }
  };

  const joinedAt = user.createdAt?.slice(0, 7) || '—';

  return (
    <div className="identity-card">
      <input
        ref={avatarInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="profile-avatar-input"
        disabled={avatarUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onAvatarFile(file);
        }}
      />

      <div className={`identity-avatar${avatarUploading ? ' is-uploading' : ''}`}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="用户头像" /> : <span>{initial}</span>}
        <button
          type="button"
          className="identity-camera"
          aria-label={avatarUploading ? '正在上传头像' : '更换头像'}
          title={avatarUploading ? '正在上传头像' : '更换头像'}
          onClick={openAvatarPicker}
          disabled={avatarUploading}
        >
          <Icon name="camera" />
        </button>
      </div>
      {avatarFeedback ? (
        <p className={`profile-form-message profile-form-message--${avatarFeedback.type}`} role="status">
          {avatarFeedback.text}
        </p>
      ) : null}

      {editingName ? (
        <div className="identity-name-edit">
          <input
            className="profile-input"
            value={displayName}
            maxLength={20}
            autoFocus
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
          <div className="identity-name-actions">
            <button type="button" className="profile-btn is-primary" onClick={() => void submitName()} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              className="profile-btn is-secondary"
              onClick={() => setEditingName(false)}
              disabled={saving}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="identity-name">
          <h2 className="identity-name-text" id="profile-page-title">{displayName}</h2>
          <button
            type="button"
            className="identity-icon-btn"
            aria-label="编辑昵称"
            title="编辑昵称"
            onClick={() => setEditingName(true)}
          >
            <Icon name="edit" />
          </button>
        </div>
      )}
      {feedback ? (
        <p className={`profile-form-message profile-form-message--${feedback.type}`} role="status">
          {feedback.text}
        </p>
      ) : null}

      <p className="identity-email">{user.email}</p>

      {editingBio ? (
        <div className="identity-bio-edit">
          <input
            className="profile-input"
            value={bio}
            maxLength={BIO_MAX_LENGTH}
            placeholder="用一句话介绍自己"
            autoFocus
            onChange={(event) => onBioChange(event.target.value)}
          />
          <div className="identity-name-actions">
            <button type="button" className="profile-btn is-primary" onClick={() => void submitBio()} disabled={savingBio}>
              {savingBio ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              className="profile-btn is-secondary"
              onClick={() => setEditingBio(false)}
              disabled={savingBio}
            >
              取消
            </button>
          </div>
          <span className="identity-bio-count">
            {bio.trim().length} / {BIO_MAX_LENGTH}
          </span>
        </div>
      ) : (
        <div className="identity-bio">
          <p className={`identity-bio-text${user.bio ? '' : ' is-empty'}`}>{user.bio || '暂无简介'}</p>
          <button
            type="button"
            className="identity-icon-btn"
            aria-label="编辑简介"
            title="编辑简介"
            onClick={() => setEditingBio(true)}
          >
            <Icon name="edit" />
          </button>
        </div>
      )}
      {bioFeedback ? (
        <p className={`profile-form-message profile-form-message--${bioFeedback.type}`} role="status">
          {bioFeedback.text}
        </p>
      ) : null}

      <div className="identity-id">
        <span className="identity-id-value">{user.id}</span>
        <button
          type="button"
          className="identity-icon-btn"
          aria-label={`复制用户 ID（${copyLabel}）`}
          title={copyLabel === '复制' ? '复制用户 ID' : copyLabel}
          onClick={onCopyUserId}
        >
          <Icon name="clipboard" />
        </button>
        <span className="visually-hidden" role="status">{copyLabel}</span>
      </div>

      <dl className="identity-stats">
        <div className="identity-stat">
          <dt>加入时间</dt>
          <dd>{joinedAt}</dd>
        </div>
        <div className="identity-stat">
          <dt>创建 Agent</dt>
          <dd>{user.stats.agentCount}</dd>
        </div>
        <div className="identity-stat">
          <dt>累计对话</dt>
          <dd>{user.stats.conversationCount}</dd>
        </div>
      </dl>
    </div>
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
    <div className="settings-list">
      <SettingsRow label="邮箱">
        <span className="settings-current">{user.email}</span>
      </SettingsRow>
      <SettingsRow label="用户 ID">
        <span className="settings-current settings-mono">{user.id}</span>
        <button type="button" className="profile-link-btn" onClick={onCopyUserId}>{copyLabel}</button>
      </SettingsRow>
      <SettingsRow label="登录方式">
        <span className="settings-current">
          {user.hasPassword ? (user.googleLinked ? '邮箱密码 + Google' : '邮箱密码') : 'Google'}
        </span>
      </SettingsRow>
    </div>
  );
}

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

const ACCENT_OPTIONS: ReadonlyArray<{ value: AccentColor; label: string }> = [
  { value: 'purple', label: '紫色' },
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' },
  { value: 'red', label: '红色' },
];

const FONT_SIZE_OPTIONS: ReadonlyArray<{ value: FontSizePreference; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'normal', label: '标准' },
  { value: 'large', label: '大' },
];

const DENSITY_OPTIONS: ReadonlyArray<{ value: DensityPreference; label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'comfortable', label: '舒适' },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="settings-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AppearanceSection({ appearance }: { appearance: Appearance }) {
  return (
    <div className="settings-list">
      <SettingsRow label="主题模式">
        <Segmented label="主题模式" value={appearance.theme} options={THEME_OPTIONS} onChange={setTheme} />
      </SettingsRow>
      <SettingsRow label="强调色">
        <div className="accent-swatches" role="group" aria-label="强调色">
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`accent-swatch${appearance.accent === option.value ? ' is-active' : ''}`}
              data-swatch={option.value}
              aria-pressed={appearance.accent === option.value}
              aria-label={option.label}
              title={option.label}
              onClick={() => setAccent(option.value)}
            >
              <span className="accent-swatch-dot" aria-hidden="true" />
            </button>
          ))}
        </div>
      </SettingsRow>
      <SettingsRow label="字号">
        <Segmented label="字号" value={appearance.fontSize} options={FONT_SIZE_OPTIONS} onChange={setFontSize} />
      </SettingsRow>
      <SettingsRow label="界面密度">
        <Segmented label="界面密度" value={appearance.density} options={DENSITY_OPTIONS} onChange={setDensity} />
      </SettingsRow>
    </div>
  );
}

function PersonalizationSection({
  prompt,
  saving,
  dirty,
  feedback,
  onChange,
  onSave,
  onClear,
}: {
  prompt: string;
  saving: boolean;
  dirty: boolean;
  feedback: Feedback | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onClear: () => void;
}) {
  return (
    <div className="settings-list">
      <p className="settings-description">
        全局 Prompt 是你对 AI 助手的长期偏好设置。保存后会在每次运行 Agent 时自动生效，
        不会替代 Agent 自身的人设指令。
      </p>
      <label className="profile-prompt-field">
        <span className="profile-prompt-label">全局 Prompt</span>
        <textarea
          className="profile-prompt-input"
          rows={8}
          maxLength={PROMPT_MAX_LENGTH}
          placeholder="例如：我是初学者，请用简单易懂的语言回答。"
          value={prompt}
          disabled={saving}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="profile-prompt-footer">
        <button type="button" className="profile-btn is-primary" onClick={onSave} disabled={saving || !dirty}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button type="button" className="profile-link-btn is-danger" onClick={onClear} disabled={saving || !prompt}>
          清空
        </button>
        <span className="profile-prompt-count">{prompt.length} / {PROMPT_MAX_LENGTH}</span>
        {feedback ? (
          <span className={`profile-form-message profile-form-message--${feedback.type}`} role="status">
            {feedback.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function errorText(cause: unknown, fallback: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return '登录状态已失效，请重新登录。';
    return cause.message || fallback;
  }
  return fallback;
}
