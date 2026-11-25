import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { CurrentUser as CurrentUserPayload } from '@minicoze/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { ConversationsService } from '../conversations/conversations.service';
import { AttachmentsService } from './attachments.service';
import type { AttachmentView } from './attachment.types';
import { MAX_UPLOAD_BYTES } from './parsers/file-type';

@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(ResponseInterceptor)
export class AttachmentsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly attachments: AttachmentsService,
  ) {}

  /**
   * 单文件上传：前端连续调用即可传多个。
   * 解析同步完成，失败也返回 202（status=FAILED），由前端提示并允许移除。
   */
  @Post(':id/attachments')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(
    @Param('id') conversationId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AttachmentView> {
    // 先校验会话归属，避免拿别人的会话 id 传文件
    await this.conversations.assertOwned(conversationId, user.id);
    return this.attachments.upload(conversationId, file);
  }
}
