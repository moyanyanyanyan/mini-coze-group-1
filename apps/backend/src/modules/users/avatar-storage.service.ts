import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_URL_PREFIX = '/api/users/avatar/';
const FILE_NAME_PATTERN = /^[0-9a-zA-Z-]+\.(png|jpg|webp)$/;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface UploadedAvatarFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

type AvatarExtension = 'png' | 'jpg' | 'webp';

// 只按文件头判断真实类型，不信任文件名和 Content-Type
export function detectAvatarExtension(buffer: Buffer): AvatarExtension | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp';
  return null;
}

@Injectable()
export class AvatarStorageService {
  private get directory(): string {
    // 测试或部署时可用 AVATAR_STORAGE_DIR 指向可写目录
    return process.env.AVATAR_STORAGE_DIR ?? join(process.cwd(), 'uploads', 'avatars');
  }

  async save(userId: string, file: UploadedAvatarFile | undefined): Promise<string> {
    if (!file) {
      throw new BadRequestException('请选择要上传的图片');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('头像大小不能超过 5MB');
    }
    const extension = detectAvatarExtension(file.buffer);
    if (!extension) {
      throw new BadRequestException('仅支持 JPG、PNG、WebP 格式的图片');
    }

    await mkdir(this.directory, { recursive: true });
    const filename = `${userId}-${Date.now()}-${randomBytes(4).toString('hex')}.${extension}`;
    await writeFile(join(this.directory, filename), file.buffer, { flag: 'wx' });
    return `${AVATAR_URL_PREFIX}${filename}`;
  }

  resolveFile(name: string): string {
    if (!FILE_NAME_PATTERN.test(name)) {
      throw new NotFoundException('头像不存在');
    }
    const absolute = resolve(this.directory, name);
    if (!absolute.startsWith(resolve(this.directory) + sep)) {
      throw new NotFoundException('头像不存在');
    }
    return absolute;
  }

  async assertExists(absolute: string): Promise<void> {
    try {
      await stat(absolute);
    } catch {
      throw new NotFoundException('头像不存在');
    }
  }

  // 换头像后清理旧文件，失败不影响主流程
  async removeByUrl(url: string | null | undefined): Promise<void> {
    if (!url || !url.startsWith(AVATAR_URL_PREFIX)) return;
    const name = url.slice(AVATAR_URL_PREFIX.length);
    if (!FILE_NAME_PATTERN.test(name)) return;
    await unlink(join(this.directory, name)).catch(() => undefined);
  }
}
