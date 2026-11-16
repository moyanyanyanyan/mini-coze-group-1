import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { ErrorCode } from "../../common/errors/error-codes";
import type { User } from "@prisma/client";
import type { CurrentUser } from "@minicoze/shared";
import { PrismaService } from "../../prisma/prisma.service";

const SALT_ROUNDS=10

@Injectable()
export class UsersService{
    constructor(private readonly prisma:PrismaService){}

    // 该函数接收一个数据库用户对象，返回一个CurrentUser对象
    toCurrentUser(user:User):CurrentUser{
        return{
            id:user.id,
            email:user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl??undefined,
        };
    }
    // 按照邮箱查询用户,查不到返回null，不抛错
    // 查询数据库需要等待，用异步可使程序同时处理其他事情
    async findByEmail(email:string):Promise<User|null>{
        return this.prisma.user.findUnique({
            // 输出邮箱转为小写去掉收尾空格
            where:{email:email.toLowerCase().trim()}
        })
    }


    // 根据ID查询用户

    async findById(id:string):Promise<User|null>{
        return this.prisma.user.findUnique({
            where:{id},
        })
    }

    //创建用户
    // 创建新用户，并且把明文密码哈希掉，最后返回
    async create(input:{
        email:string;
        password:string;
        displayName:string;
    }):Promise<User>{
        // 将明文密码哈希掉
        const passwordHash=await bcrypt.hash(input.password,SALT_ROUNDS);
        return this.prisma.user.create({
            data:{
                // 将邮箱转为小写
                email:input.email.toLowerCase().trim(),
                passwordHash,
                displayName:input.displayName,
            },
        });
    }
    // ========== A7 Google 登录新增 ==========

    async findByGoogleId(googleId:string):Promise<User|null>{
        return this.prisma.user.findUnique({
            where:{googleId},
        })
    }

    // 创建一个纯 Google 用户：没有密码
    async createOAuthUser(input:{
        email:string;
        displayName:string;
        avatarUrl?:string;
        googleId:string;
    }):Promise<User>{
        return this.prisma.user.create({
            data:{
                email:input.email.toLowerCase().trim(),
                displayName:input.displayName,
                avatarUrl:input.avatarUrl??null,
                googleId:input.googleId,
                // 关键：Google 用户没有密码，这里必须是 null 而不是空字符串
                passwordHash:null,
            },
        })
    }

    // 已有邮箱密码账号的人第一次用 Google 登录：把 googleId 补写上去
    async linkGoogleId(userId:string,googleId:string):Promise<User>{
        return this.prisma.user.update({
            where:{id:userId},
            data:{googleId},
        })
    }
    // ========== 个人中心 ==========

    async updateDisplayName(userId:string,displayName:string):Promise<User>{
        return this.prisma.user.update({
            where:{id:userId},
            data:{displayName},
        })
    }

    async updateAvatar(userId:string,avatarUrl:string):Promise<User>{
        return this.prisma.user.update({
            where:{id:userId},
            data:{avatarUrl},
        })
    }

    // 有密码的账号必须先比对旧密码；纯 Google 账号（passwordHash 为 null）直接把新密码写上去
    async changePassword(userId:string,currentPassword:string|undefined,newPassword:string):Promise<void>{
        const user=await this.prisma.user.findUnique({where:{id:userId}})
        // 正常情况下 JWT 策略已经查过一次；这里仍兜一手，避免并发删号后写出孤儿数据
        if(!user){
            throw new UnauthorizedException({
                code:ErrorCode.TOKEN_INVALID,
                message:'登录状态无效',
            })
        }
        if(user.passwordHash){
            const currentOk=currentPassword
                ?await bcrypt.compare(currentPassword,user.passwordHash)
                :false
            if(!currentOk){
                throw new UnauthorizedException({
                    code:ErrorCode.INVALID_CREDENTIALS,
                    message:'当前密码不正确',
                })
            }
        }
        const passwordHash=await bcrypt.hash(newPassword,SALT_ROUNDS)
        await this.prisma.user.update({
            where:{id:userId},
            data:{passwordHash},
        })
    }
}
