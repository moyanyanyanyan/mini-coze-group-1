import { IsEmail,IsString,MaxLength,MinLength } from "class-validator";

// 为什么需要dto，用来检验前端传来的json是否正确

export class LoginDto{
    @IsEmail({},{message:'邮箱格式不正确'})
    email!:string;

    @IsString()
    @MinLength(1)
    @MaxLength(64)
    password!:string;
}