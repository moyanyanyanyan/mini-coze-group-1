import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { PublicApiModule } from '../src/modules/public-api/public-api.module';

describe('Public API run endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PublicApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid run request and reports the incomplete business chain', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好' })
      .expect(501)
      .expect({
        code: 501,
        message: '公开 Run 业务链路尚未接入',
        data: null,
      });
  });

  it('accepts an optional conversationId', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '继续', conversationId: 'conv_existing' })
      .expect(501);
  });

  it('rejects a missing or empty message', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '' })
      .expect(400);
  });

  it('rejects an empty conversationId when provided', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/run')
      .send({ message: '你好', conversationId: '' })
      .expect(400);
  });
});
