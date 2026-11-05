import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProfile, OAuthProvider } from './oauth-provider';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

@Injectable()
export class GoogleOAuthProvider implements OAuthProvider {
  private readonly logger = new Logger(GoogleOAuthProvider.name);

  constructor(private readonly config: ConfigService) {}

  /** 三个必需变量缺一个就直接抛，别等请求 Google 时才莫名其妙失败 */
  //   读取环境变量
  private mustGet(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Google OAuth 缺少环境变量 ${key}`);
    }
    return value;
  }

//   生成谷歌登录跳转链接
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.mustGet('GOOGLE_CLIENT_ID'),
      redirect_uri: this.mustGet('GOOGLE_CALLBACK_URL'),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      // 每次都能选账号，避免静默用浏览器里上一个登录过的
      prompt: 'select_account',
    });
    return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
  }


//   拿google返回的code来换accesstoken
  async exchangeCode(code: string): Promise<{ accessToken: string }> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.mustGet('GOOGLE_CLIENT_ID'),
        client_secret: this.mustGet('GOOGLE_CLIENT_SECRET'),
        redirect_uri: this.mustGet('GOOGLE_CALLBACK_URL'),
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      // 常见原因：code 过期 / 已被用过 / redirect_uri 与 Console 里不一致
      this.logger.error(`换 token 失败 ${res.status}: ${await res.text()}`);
      throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED');
    }

    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED');
    }
    return { accessToken: data.access_token };
  }


//   拿着accesstoken令牌去谷歌拿用户信息
  async fetchProfile(accessToken: string): Promise<OAuthProfile> {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      this.logger.error(`取用户资料失败 ${res.status}: ${await res.text()}`);
      throw new Error('GOOGLE_USERINFO_FAILED');
    }

    const data = (await res.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!data.sub || !data.email) {
      throw new Error('GOOGLE_USERINFO_FAILED');
    }

    return {
      providerUserId: data.sub,
      email: data.email,
      // 严格判 === true：Google 可能给字符串或 undefined，宽松判断会出安全洞
      emailVerified: data.email_verified === true,
      displayName: data.name || data.email.split('@')[0],
      avatarUrl: data.picture,
    };
  }
}
