import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
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
}
