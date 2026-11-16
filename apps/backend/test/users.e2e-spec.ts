import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const avatarDir = join(tmpdir(), 'minicoze-avatar-e2e-' + Date.now());

const newEmail = () => `e2e_users_${Date.now()}_${Math.floor(Math.random() * 1000)}@test.com`;

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const created: string[] = [];

  beforeAll(async () => {
    // 头像写到临时目录，测试结束整体删除
    process.env.AVATAR_STORAGE_DIR = avatarDir;
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // 复刻 main.ts 的三行，否则测到的不是真实行为
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    if (prisma && created.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: created } } });
    }
    await app?.close();
    await rm(avatarDir, { recursive: true, force: true });
  });

  async function registerUser(displayName = 'E2E') {
    const email = newEmail();
    created.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: '12345678', displayName })
      .expect(201);
    return { email, token: res.body.accessToken as string, userId: res.body.user.id as string };
  }

  describe('GET /api/users/me', () => {
    it('返回资料与安全状态，且不含密码哈希', async () => {
      const { email, token } = await registerUser('资料用户');

      const res = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.code).toBe(200);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        email,
        displayName: '资料用户',
        avatarUrl: null,
        googleLinked: false,
        hasPassword: true,
      });
      expect(res.body.data.passwordHash).toBeUndefined();
    });
  });

  describe('PATCH /api/users/me', () => {
    it('改昵称后 /api/auth/me 立刻是新值', async () => {
      const { token } = await registerUser('旧昵称');

      await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: '  新昵称  ' })
        .expect(200);

      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(me.body.displayName).toBe('新昵称');
    });

    it('请求体里的 id 不生效，只能改自己', async () => {
      const victim = await registerUser('受害者');
      const attacker = await registerUser('攻击者');

      await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${attacker.token}`)
        .send({ displayName: '被改了吗', id: victim.userId })
        .expect(200);

      const victimMe = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${victim.token}`)
        .expect(200);
      expect(victimMe.body.data.displayName).toBe('受害者');
    });
  });

  describe('PATCH /api/users/me/password', () => {
    it('旧密码正确：改密成功，新密码可登录', async () => {
      const { email, token } = await registerUser();

      await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: '12345678', newPassword: 'newpass888' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'newpass888' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: '12345678' })
        .expect(401);
    });

    it('旧密码错误：返回 401', async () => {
      const { token } = await registerUser();

      const res = await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong-password', newPassword: 'newpass888' })
        .expect(401);

      expect(res.body.code).toBe(401);
    });

    it('纯 Google 账号：不用旧密码即可首次设置密码', async () => {
      const email = newEmail();
      created.push(email);
      const user = await prisma.user.create({
        data: {
          email,
          displayName: 'Google 用户',
          googleId: `google_sub_${Date.now()}`,
          passwordHash: null,
        },
      });
      const token = await jwt.signAsync({ sub: user.id, email: user.email });

      const before = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(before.body.data.hasPassword).toBe(false);
      expect(before.body.data.googleLinked).toBe(true);

      await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'googlepass888' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'googlepass888' })
        .expect(200);
    });
  });

  describe('POST /api/users/me/avatar', () => {
    // 1x1 透明 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    it('上传成功后保存地址，刷新资料仍是该地址', async () => {
      const { token } = await registerUser('头像用户');

      const res = await request(app.getHttpServer())
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(201);

      const avatarUrl = res.body.data.avatarUrl as string;
      expect(avatarUrl).toMatch(/^\/api\/users\/avatar\/.+\.png$/);

      const me = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(me.body.avatarUrl).toBe(avatarUrl);

      const file = await request(app.getHttpServer()).get(avatarUrl).expect(200);
      expect(file.headers['content-type']).toContain('image/png');
    });

    it('文件头不是图片时拒绝，即使扩展名是 png', async () => {
      const { token } = await registerUser('假图片用户');

      const res = await request(app.getHttpServer())
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' })
        .expect(400);

      expect(res.body.message).toContain('仅支持 JPG、PNG、WebP');
    });

    it('超过 5MB 时拒绝', async () => {
      const { token } = await registerUser('大图用户');
      const big = Buffer.alloc(5 * 1024 * 1024 + 1);
      big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);

      const res = await request(app.getHttpServer())
        .post('/api/users/me/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', big, { filename: 'big.png', contentType: 'image/png' })
        .expect(400);

      expect(res.body.message).toContain('不能超过 5MB');
    });

    it('未登录不能上传', async () => {
      await request(app.getHttpServer())
        .post('/api/users/me/avatar')
        .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(401);
    });
  });
  describe('未登录', () => {
    it('三个个人中心接口都返回 401', async () => {
      await request(app.getHttpServer()).get('/api/users/me').expect(401);
      await request(app.getHttpServer()).patch('/api/users/me').send({ displayName: 'x' }).expect(401);
      await request(app.getHttpServer())
        .patch('/api/users/me/password')
        .send({ newPassword: 'newpass888' })
        .expect(401);
    });
  });
});
