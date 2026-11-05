import {
  ConflictException,
  UnauthorizedException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import  type { AuthResponse } from "@minicoze/shared";
import { ErrorCode } from '../../common/errors/error-codes';
import type { User } from '@prisma/client';
import type { OAuthProfile } from './oauth/oauth-provider';



@Injectable()
export class AuthService{
    constructor(
        private readonly users:UsersService,
        private readonly jwt:JwtService,
    ){}

    //注册：邮箱没被占用才建号，建完直接签发 token（注册完就算登录态）
    async register(dto:RegisterDto):Promise<AuthResponse>{
        // 根据用户提交的邮箱查询数据库，并把查询到的结果存在existing中
        const existing=await this.users.findByEmail(dto.email);
        // 判断邮箱是否存在
        if(existing){
            // 抛出异常
            throw new ConflictException({
                code: ErrorCode.EMAIL_ALREADY_REGISTERED,
                message: '该邮箱已被注册',
            })
        }
        // 不存在则创建用户
        const user=await this.users.create({
            email:dto.email,
            password:dto.password,
            displayName:dto.displayName,
        });

        return this.buildAuthResponse(user);
    }
    // 登录：校验邮箱 + 密码，都对了才签发 token
    async login(dto:LoginDto):Promise<AuthResponse>{
        const user=await this.users.findByEmail(dto.email);
        // 判断是否存在
        if(!user){
            throw new UnauthorizedException({
                code:ErrorCode.INVALID_CREDENTIALS,
                message:'邮箱密码不正确'
            })
        }
        // 这个账号是 Google 注册的，压根没有密码。
        if(!user.passwordHash){
            throw new UnauthorizedException({
                code:ErrorCode.INVALID_CREDENTIALS,
                message:'邮箱或密码不正确'
            })
        }
        // 比较输入密码和哈希是否匹配
        const passwordOk=await bcrypt.compare(
            dto.password,
            user.passwordHash
        );
        if(!passwordOk){
            throw new UnauthorizedException({
            code: ErrorCode.INVALID_CREDENTIALS,
            message: '邮箱或密码不正确',
        });
        }

        return this.buildAuthResponse(user);
    }
// 生成JWT，并整理数据库用户信息成前端需要的格式
    private async buildAuthResponse(user:User):Promise<AuthResponse>{
    // 生成jwt
        const accessToken=await this.jwt.signAsync({
            sub:user.id,
            email:user.email,
        })
        return{
            accessToken,
            user:this.users.toCurrentUser(user),
        };
    }

    // ========== A7 Google 登录 ==========
    // 前置：controller 已经拿着 code 找 Google 换好资料（OAuthProfile），
    // 这个方法只负责「认出这个人是谁 + 签发我们自己的 JWT」，
    // 不碰 HTTP、不碰 Cookie、不碰 Google
    async loginWithGoogle(profile:OAuthProfile):Promise<AuthResponse>{
        // 第 0 道闸：邮箱没验证过的 Google 账号，绝不能当登录依据。
        // 否则任何人都能靠一个未验证邮箱冒充别人
        if(!profile.emailVerified){
            throw new UnauthorizedException({
                code:ErrorCode.GOOGLE_EMAIL_NOT_VERIFIED,
                message:'该 Google 账号的邮箱未验证，请换一个账号'
            })
        }

        // 三分支认人，从上往下依次尝试
        // ① 老用户：以前用 Google 登过，googleId 直接命中
        let user=await this.users.findByGoogleId(profile.providerUserId);

        // ② 第一次 Google 登录，但这个邮箱早就有密码账号：补绑 googleId。
        //    敢直接绑是因为上面那道闸已确认 Google 验证过这个邮箱属于本人
        if(!user){
            const existing=await this.users.findByEmail(profile.email);
            if(existing){
                user=await this.users.linkGoogleId(existing.id,profile.providerUserId);
            }
        }

        // ③ 全新用户：建一个没有密码的账号
        if(!user){
            user=await this.users.createOAuthUser({
                email:profile.email,
                displayName:profile.displayName,
                avatarUrl:profile.avatarUrl,
                googleId:profile.providerUserId,
            });
        }

        // 走到这里 user 一定有值，和密码登录殊途同归：签发自己的 JWT
        return this.buildAuthResponse(user);
    }
}
