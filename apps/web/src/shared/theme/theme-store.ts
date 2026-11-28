import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type AccentColor = 'purple' | 'blue' | 'green' | 'red';
export type FontSizePreference = 'small' | 'normal' | 'large';
export type DensityPreference = 'compact' | 'comfortable';

export interface Appearance {
  theme: ThemePreference;
  accent: AccentColor;
  fontSize: FontSizePreference;
  density: DensityPreference;
}

const STORAGE_KEYS = {
  theme: 'minicoze-theme',
  accent: 'minicoze-accent',
  fontSize: 'minicoze-font-size',
  density: 'minicoze-density',
} as const;

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const ACCENTS: readonly AccentColor[] = ['purple', 'blue', 'green', 'red'];
const FONT_SIZES: readonly FontSizePreference[] = ['small', 'normal', 'large'];
const DENSITIES: readonly DensityPreference[] = ['compact', 'comfortable'];

/** 与 index.html 首屏脚本保持一致：旧版只存 light/dark，这里继续兼容 */
const DEFAULTS: Appearance = {
  theme: 'light',
  accent: 'purple',
  fontSize: 'normal',
  density: 'comfortable',
};

const listeners = new Set<() => void>();

function readStored<K extends keyof Appearance>(key: K, allowed: readonly Appearance[K][]): Appearance[K] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[key]);
    return allowed.includes(raw as Appearance[K]) ? (raw as Appearance[K]) : DEFAULTS[key];
  } catch {
    return DEFAULTS[key];
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: ThemePreference): ResolvedTheme {
  if (theme === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return theme;
}

function applyAppearance(value: Appearance): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(value.theme);
  root.dataset.accent = value.accent;
  root.dataset.fontSize = value.fontSize;
  root.dataset.density = value.density;
}

let appearance: Appearance = typeof window === 'undefined'
  ? { ...DEFAULTS }
  : {
      theme: readStored('theme', THEMES),
      accent: readStored('accent', ACCENTS),
      fontSize: readStored('fontSize', FONT_SIZES),
      density: readStored('density', DENSITIES),
    };

if (typeof window !== 'undefined') {
  applyAppearance(appearance);

  // 跟随系统时，系统主题一变就重新应用
  if (typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = () => {
      if (appearance.theme !== 'system') {
        return;
      }
      applyAppearance(appearance);
      for (const listener of listeners) {
        listener();
      }
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onSystemThemeChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(onSystemThemeChange);
    }
  }
}

function persist<K extends keyof Appearance>(key: K, value: Appearance[K]): void {
  try {
    localStorage.setItem(STORAGE_KEYS[key], value);
  } catch {
    // 隐私模式下写不进去也不影响本次会话
  }
}

export function setAppearance(patch: Partial<Appearance>): void {
  const next: Appearance = { ...appearance, ...patch };
  if (
    next.theme === appearance.theme &&
    next.accent === appearance.accent &&
    next.fontSize === appearance.fontSize &&
    next.density === appearance.density
  ) {
    return;
  }
  appearance = next;
  applyAppearance(next);
  if (patch.theme !== undefined) persist('theme', next.theme);
  if (patch.accent !== undefined) persist('accent', next.accent);
  if (patch.fontSize !== undefined) persist('fontSize', next.fontSize);
  if (patch.density !== undefined) persist('density', next.density);
  for (const listener of listeners) {
    listener();
  }
}

export function setTheme(theme: ThemePreference): void {
  setAppearance({ theme });
}

export function setAccent(accent: AccentColor): void {
  setAppearance({ accent });
}

export function setFontSize(fontSize: FontSizePreference): void {
  setAppearance({ fontSize });
}

export function setDensity(density: DensityPreference): void {
  setAppearance({ density });
}

export function toggleTheme(): void {
  setTheme(resolveTheme(appearance.theme) === 'dark' ? 'light' : 'dark');
}

export function getAppearance(): Appearance {
  return appearance;
}

/** 当前实际生效的主题（跟随系统时已解析），工作流画布等需要具体颜色时用这个 */
export function getTheme(): ResolvedTheme {
  return resolveTheme(appearance.theme);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, getAppearance, getAppearance);
}

export function useTheme(): ResolvedTheme {
  return resolveTheme(useAppearance().theme);
}
