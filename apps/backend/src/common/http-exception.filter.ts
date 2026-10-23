import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * 全局异常过滤器。
 * 与 ResponseInterceptor 共同产出统一的 { code, message, data } 包络格式。
 * ValidationPipe 抛出的 BadRequestException.message 为 string[]，此处归一化 join 成单字符串，
 * 保证前端永远收到 string 类型的 message 字段。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const rawMessage: string | string[] =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? (exceptionResponse.message as string | string[])
        : exception instanceof HttpException
          ? exception.message
          : 'Internal server error';

    const message = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : rawMessage;

    response.status(status).json({
      code: status,
      message,
      data: null,
    });
  }
}
