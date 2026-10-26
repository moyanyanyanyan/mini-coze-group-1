import { IsEmail,IsString,MaxLength,MinLength } from "class-validator";

// 为什么需要dto，用来检验前端传来的json是否正确

export class RegisterDto{
    @IsEmail({},{message:'邮箱格式不正确'})
    email!:string;

    @IsString()
    @MinLength(8,{message:'最小长度为8'})
    @MaxLength(64,{message:'最大长度为20'})
    password!:string;
    
    @IsString()
    @MinLength(1,{message:'昵称不能为空'})
    @MaxLength(20,{message:'昵称最大不能超过20个字'})
    displayName!:string;
}