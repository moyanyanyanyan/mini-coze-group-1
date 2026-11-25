import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  AttachmentError,
  type AttachmentSourceType,
  type AttachmentView,
} from './attachment.types';
import { AttachmentParserRegistry } from './parsers/parser.registry';
import {
  assertMagicBytes,
  maxBytesFor,
  mimeTypeFor,
  normalizeFileName,
  resolveSourceType,
} from './parsers/file-type';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parsers: AttachmentParserRegistry,
  ) {}

  /**
   * 上传即解析。
   * 解析失败不抛 500，而是把 status/errorCode 写进记录并返回 202，
   * 这样前端能展示失败原因并让用户移除或重试。
   */
  async upload(
    conversationId: string,
    file: Express.Multer.File | undefined,
  ): Promise<AttachmentView> {
    if (!file || !file.buffer) {
      throw new HttpException(
        { code: ErrorCode.VALIDATION_FAILED, message: '缺少文件字段 file' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const fileName = normalizeFileName(file.originalname);
    // 前置校验直接拒绝，不建记录；必须转成 HttpException，否则会被当成未捕获异常返回 500
    let sourceType: AttachmentSourceType;
    try {
      sourceType = resolveSourceType(fileName);
    } catch (error) {
      throw toHttpException(error);
    }
    const maxBytes = maxBytesFor(sourceType);
    if (file.size > maxBytes) {
      throw new HttpException(
        {
          code: ErrorCode.FILE_TOO_LARGE,
          message: `文件超过 ${Math.round(maxBytes / 1024 / 1024)} MB 上限`,
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const bytes = new Uint8Array(file.buffer);
    try {
      assertMagicBytes(sourceType, bytes);
    } catch (error) {
      throw toHttpException(error);
    }

    const record = await this.prisma.messageAttachment.create({
      data: {
        conversationId,
        fileName,
        mimeType: file.mimetype || mimeTypeFor(sourceType),
        sourceType,
        byteSize: file.size,
        status: 'PARSING',
      },
    });

    try {
      const text = await this.parsers.parse({
        fileName,
        mimeType: record.mimeType,
        sourceType,
        bytes,
      });
      const textBytes = Buffer.byteLength(text, 'utf8');
      await this.prisma.messageAttachment.update({
        where: { id: record.id },
        data: { status: 'READY', extractedText: text, textBytes },
      });
      this.logger.log(
        `附件解析完成 attachmentId=${record.id} sourceType=${sourceType} byteSize=${file.size} textBytes=${textBytes}`,
      );
      return {
        id: record.id,
        fileName,
        mimeType: record.mimeType,
        sourceType,
        byteSize: file.size,
        status: 'READY',
        textBytes,
        preview: text.slice(0, 200),
      };
    } catch (error) {
      const failure = toFailure(error);
      await this.prisma.messageAttachment.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          errorCode: failure.code,
          errorMessage: failure.message,
          extractedText: null,
          textBytes: 0,
        },
      });
      // 只记录元信息，不输出正文
      this.logger.warn(
        `附件解析失败 attachmentId=${record.id} sourceType=${sourceType} byteSize=${file.size} errorCode=${failure.code}`,
      );
      return {
        id: record.id,
        fileName,
        mimeType: record.mimeType,
        sourceType,
        byteSize: file.size,
        status: 'FAILED',
        textBytes: 0,
        preview: '',
        errorCode: failure.code,
        errorMessage: failure.message,
      };
    }
  }
}

function toFailure(error: unknown): { code: string; message: string } {
  if (error instanceof AttachmentError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'CORRUPT_FILE', message: '文件解析失败' };
}

/** 把解析前置校验错误翻译成对应 HTTP 状态，避免 500 */
function toHttpException(error: unknown): HttpException {
  if (!(error instanceof AttachmentError)) {
    return new HttpException(
      { code: ErrorCode.CORRUPT_FILE, message: '文件无法识别' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  const status = error.code === 'UNSUPPORTED_FILE'
    ? HttpStatus.UNSUPPORTED_MEDIA_TYPE
    : error.code === 'FILE_TOO_LARGE'
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : error.code === 'CORRUPT_FILE'
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.BAD_REQUEST;
  return new HttpException({ code: error.code, message: error.message }, status);
}
