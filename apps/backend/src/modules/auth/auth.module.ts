import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions, type JwtSignOptions } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';


@Module({
  controllers: [AuthController],
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // 返回值显式标成 JwtModuleOptions。
      // signOptions.expiresIn 在 jsonwebtoken 新版里收窄成了 number | StringValue，
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
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
