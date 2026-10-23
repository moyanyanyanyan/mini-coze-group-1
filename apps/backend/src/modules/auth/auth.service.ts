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
}