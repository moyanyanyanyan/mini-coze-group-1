import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const CIPHER_VERSION = 'v1';

/**
 * 模型凭据加解密。API Key 只以密文入库，接口与日志都不返回明文。
 * 密钥来自 MODEL_CREDENTIAL_SECRET，缺失时不静默降级为明文。
 */
@Injectable()
export class ModelCredentialCipher {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const secret = (config.get<string>('MODEL_CREDENTIAL_SECRET') ?? '').trim();
    this.key = secret.length >= 16
      ? scryptSync(secret, 'minicoze:model-credential', 32)
      : null;
  }

  encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      CIPHER_VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      data.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const key = this.requireKey();
    const [version, iv, tag, data] = payload.split('.');
    if (version !== CIPHER_VERSION || !iv || !tag || !data) {
      throw new InternalServerErrorException('模型凭据格式无效');
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('模型凭据无法解密');
    }
  }

  /** 页面只展示前 4 位。 */
  prefixOf(plaintext: string): string {
    return plaintext.slice(0, 4);
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException(
        '模型凭据加密密钥未配置（MODEL_CREDENTIAL_SECRET 至少 16 位）',
      );
    }
    return this.key;
  }
}
