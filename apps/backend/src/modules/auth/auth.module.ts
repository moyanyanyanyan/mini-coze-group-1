import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions, type JwtSignOptions } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './auth.controller';


@Module({
  controllers: [AuthController],
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
  //登记AuthService，它constructor里的UsersService / JwtService才有人提供
  providers: [AuthService,JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
