import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AvatarStorageService } from './avatar-storage.service';

// 头像本身是公开静态资源，浏览器 <img> 直接加载，所以不挂 JWT Guard
@Controller('users/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarStorageService) {}

  @Get(':file')
  async read(@Param('file') file: string, @Res() res: Response): Promise<void> {
    const absolute = this.avatars.resolveFile(file);
    await this.avatars.assertExists(absolute);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(absolute);
  }
}
