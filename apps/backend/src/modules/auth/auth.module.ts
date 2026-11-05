import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions, type JwtSignOptions } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google-auth.controller';
import { OAUTH_PROVIDER } from './oauth/oauth-provider';
import { GoogleOAuthProvider } from './oauth/google-oauth.provider';


@Module({
  // AuthController 管密码注册/登录；GoogleAuthController 管 Google 那两个 302 路由
  controllers: [AuthController, GoogleAuthController],
  imports: [
    PassportModule.register({}),
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // 返回值显式标成 JwtModuleOptions。
      // 普通 string 塞不进去，所以下面那行要断言一次（只影响类型，运行时照常）
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '7d') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  // 登记 AuthService，它 constructor 里的 UsersService / JwtService 才有人提供
  providers: [
    AuthService,
    JwtStrategy,
    // 关键一行：把「接口」和「实现」绑起来。
    // 以后 Mock 上场，只改这一处按环境挑实现，别的文件一行不动
    { provide: OAUTH_PROVIDER, useClass: GoogleOAuthProvider },
  ],
  exports: [AuthService],
})
export class AuthModule {}
