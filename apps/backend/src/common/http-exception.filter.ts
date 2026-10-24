import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, resolveErrorCode } from './errors/error-codes';

/** 全站统一的错误响应体。前端按这个结构写解析，永远拿得到 code */
interface ErrorResponse {
  statusCode: number;
  code: ErrorCode;
  message: string | string[];
  path: string;
  timestamp: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    // 异常里的 payload 有三种可能，分别处理：
    //   1. throw new HttpException({ code, message }, status)  → 对象，有 code
    //   2. throw new HttpException('就是一句话', status)        → 纯字符串
    //   3. 压根不是 HttpException（代码真崩了）                 → undefined，按 500 处理
    let rawCode: unknown;
    let message: string | string[] = 'Internal server error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse !== null && typeof exceptionResponse === 'object') {
      const payload = exceptionResponse as { code?: unknown; message?: unknown };
      rawCode = payload.code;

      if (typeof payload.message === 'string' || Array.isArray(payload.message)) {
        message = payload.message as string | string[];
      } else if (exception instanceof HttpException) {
        message = exception.message;
      }
    }

    // 500 只记日志，详情不外泄：堆栈里可能有数据库连接串、文件路径等敏感信息
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → 500`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = {
      statusCode: status,
      code: resolveErrorCode(status, rawCode),
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (request.path === '/internal/knowledge/retrieval') {
      response.status(status).json({ code: status, message: Array.isArray(message) ? message.join('; ') : message, data: null });
      return;
    }
    response.status(status).json(body);
  }
}
