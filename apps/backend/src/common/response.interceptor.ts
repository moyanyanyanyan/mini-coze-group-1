import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * 全局响应包络拦截器。
 * 成功响应统一输出 { code, message: "ok", data } 格式，
 * 其中 code 取自 response.statusCode（200/201 等），
 * data 为空时统一转 null。
 *
 * 注意：本拦截器只覆盖正常返回路径，异常路径由 HttpExceptionFilter 独立产出包络。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Envelope<T>> {
    const http = context.switchToHttp();
    const response = http.getResponse();

    return next.handle().pipe(
      map((data) => ({
        code: response.statusCode,
        message: 'ok',
        data: data ?? null,
      })),
    );
  }
}
