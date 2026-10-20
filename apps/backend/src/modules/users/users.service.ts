import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import type { CurrentUser } from "@minicoze/shared";
import { PrismaService } from "src/prisma/prisma.service";


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
            where:{email}
        })
    }
}