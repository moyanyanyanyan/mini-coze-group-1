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

interface AuthErrorResponse {
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
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;

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

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Auth 使用字符串业务错误码；Agent 和知识库使用数字 HTTP 外壳。
    if (request.path.startsWith('/api/auth/')) {
      const body: AuthErrorResponse = {
        statusCode: status,
        code: resolveErrorCode(status, rawCode),
        message,
        path: request.url,
        timestamp: new Date().toISOString(),
      };
      response.status(status).json(body);
      return;
    }

    response.status(status).json({
      code: status,
      message: Array.isArray(message) ? message.join('; ') : message,
      data: null,
    });
  }
}
