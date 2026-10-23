import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

// 每次跑都换一个新邮箱，否则第二次跑就撞「邮箱已注册」的唯一约束
const newEmail = () => `e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}@test.com`;

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const created: string[] = [];

  beforeAll(async () => {
    // 数据库连接交给 AppModule 从根 .env 读（本机是 5433），别手改 process.env
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // 这三行必须复刻 main.ts，不然测出来的不是真实行为（比如少 ValidationPipe，短密码就不会报 400）
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // 清掉本次测试造出来的用户，别把开发库弄脏
    if (prisma && created.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: created } } });
    }
    // beforeAll 失败时 app 是 undefined，别让清理逻辑再炸一次盖掉真正的报错
    await app?.close();
  });

  describe('POST /api/auth/register', () => {
    it('注册成功：返回 token 和用户，且不含 passwordHash', async () => {
      const email = newEmail();
      created.push(email);

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: '12345678', displayName: 'E2E' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('邮箱重复：返回 409 + EMAIL_ALREADY_REGISTERED', async () => {
      const email = newEmail();
      created.push(email);
      const payload = { email, password: '12345678', displayName: 'E2E' };

      await request(app.getHttpServer()).post('/api/auth/register').send(payload).expect(201);
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(payload)
        .expect(409);

      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('密码过短：返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: newEmail(), password: '123', displayName: 'x' })
        .expect(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('密码正确：返回 200', async () => {
      const email = newEmail();
      created.push(email);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: '12345678', displayName: 'E2E' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: '12345678' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it('密码错误：返回 401 + INVALID_CREDENTIALS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'whatever123' })
        .expect(401);

      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/auth/me', () => {
    it('不带 token：返回 401', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('带 token：返回本人信息', async () => {
      const email = newEmail();
      created.push(email);
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: '12345678', displayName: 'E2E' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(200);

      expect(res.body.email).toBe(email);
      expect(res.body.passwordHash).toBeUndefined();
    });
  });
});
