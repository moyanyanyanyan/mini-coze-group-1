import {
  BadGatewayException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ResponseInterceptor } from '../../common/response.interceptor';
import type { RuntimeSseEvent } from '../../chat/runtime-client.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyPrincipal } from '../api-keys/api-key-principal.decorator';
import type { ApiKeyPrincipal as ApiKeyPrincipalPayload } from '../api-keys/api-key-principal';
import { RunDto } from './dto/run.dto';
import { PublicApiService } from './public-api.service';

export const STREAM_HEARTBEAT_MS = 15_000;

@Controller('v1')
export class PublicApiController {
  private readonly logger = new Logger(PublicApiController.name);

  constructor(private readonly publicApi: PublicApiService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(ResponseInterceptor)
  run(
    @Body() dto: RunDto,
    @ApiKeyPrincipal() principal: ApiKeyPrincipalPayload,
  ) {
    return this.publicApi.run(dto, principal);
  }

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  async stream(
    @Body() dto: RunDto,
    @ApiKeyPrincipal() principal: ApiKeyPrincipalPayload,
    @Res() res: Response,
  ): Promise<void> {
    const plan = await this.publicApi.prepareStream(dto, principal);
    const controller = new AbortController();
    const iterator = this.publicApi
      .stream(plan, dto.message, controller.signal)
      [Symbol.asyncIterator]();
    let lastEvent: RuntimeSseEvent | null = null;
    let finished = false;
    let headersWritten = false;
    let iteratorDone = false;
    let lockReleased = false;
    let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;

    const abortOnClose = () => {
      if (!finished) controller.abort();
    };
    const releaseLock = () => {
      if (lockReleased) return;
      lockReleased = true;
      this.publicApi.releaseStream(plan.conversationId);
    };
    const clearHeartbeat = () => {
      if (heartbeatTimer !== undefined) {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = undefined;
      }
    };
    const scheduleHeartbeat = () => {
      clearHeartbeat();
      if (finished || res.writableEnded || res.destroyed) return;
      heartbeatTimer = setTimeout(() => {
        heartbeatTimer = undefined;
        if (finished || res.writableEnded || res.destroyed) return;
        try {
          res.write(': heartbeat\n\n');
          scheduleHeartbeat();
        } catch (error) {
          controller.abort(error);
        }
      }, STREAM_HEARTBEAT_MS);
    };
    res.once('close', abortOnClose);

    try {
      const first = await iterator.next();
      if (first.done) {
        iteratorDone = true;
        throw new BadGatewayException('Runtime 未返回流式事件');
      }

      res.writeHead(HttpStatus.OK, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      headersWritten = true;
      res.flushHeaders();
      res.write(': stream-open\n\n');
      lastEvent = first.value;
      res.write(formatSseFrame(first.value));
      scheduleHeartbeat();

      while (true) {
        const next = await iterator.next();
        if (next.done) {
          iteratorDone = true;
          break;
        }
        lastEvent = next.value;
        res.write(formatSseFrame(next.value));
        scheduleHeartbeat();
      }
    } catch (error) {
      const cancelledByClient = controller.signal.aborted;
      if (!cancelledByClient) {
        controller.abort(error);
      }
      if (!headersWritten) throw error;

      if (!cancelledByClient) {
        this.logger.error('公开 Stream 异常', error as Error);
      }
      if (!res.destroyed && lastEvent && !isTerminalEvent(lastEvent)) {
        try {
          res.write(formatSseFrame({
            ...lastEvent,
            seq: lastEvent.seq + 1,
            timestamp: new Date().toISOString(),
            type: 'run.failed',
            data: {
              code: 'INTERNAL_ERROR',
              message: '流式响应异常',
              retryable: false,
            },
          }));
        } catch (writeError) {
          controller.abort(writeError);
        }
      }
    } finally {
      finished = true;
      clearHeartbeat();
      res.off('close', abortOnClose);
      if (!iteratorDone) {
        controller.abort();
        try {
          await iterator.return?.(undefined);
        } catch (error) {
          this.logger.error('关闭公开 Stream 迭代器失败', error as Error);
        }
      }
      releaseLock();
      if (headersWritten && !res.writableEnded) res.end();
    }
  }
}

export function formatSseFrame(event: RuntimeSseEvent): string {
  return `id: ${event.runId}:${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function isTerminalEvent(event: RuntimeSseEvent): boolean {
  return event.type === 'run.completed' || event.type === 'run.failed';
}
