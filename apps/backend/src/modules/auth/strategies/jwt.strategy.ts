// 从请求携带的jwt中提取用户id，确认当前请求对应用户

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { CurrentUser } from '@minicoze/shared';
import { ErrorCode } from '../../../common/errors/error-codes';
import { UsersService } from '../../users/users.service';

// 和 auth.service.ts 里 signAsync 的字段对上：{ sub, email }
interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    // 提取并检验jwt
    super({
      // 从请求头 Authorization: Bearer xxx 里取 token
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 过期的 token 直接拒绝，不装没看见
      ignoreExpiration: false,
      // 验签密钥必须和签发时一致，读不到直接启动失败
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }


  //查询数据库
  // 签名和有效期在 super 里已经验完，走到这里说明 token 是真的，
  async validate(payload: JwtPayload): Promise<CurrentUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: '登录状态无效',
      });
    }


    // 返回当前用户
    return this.users.toCurrentUser(user);
  }
}
