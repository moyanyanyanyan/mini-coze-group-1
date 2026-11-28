import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
    // 纯 Google 账号首次设置密码时没有旧密码，所以可选；
    // 已有密码的账号由 service 强制要求它存在
    @IsOptional()
    @IsString()
    @MaxLength(64)
    currentPassword?: string;

    @IsString()
    @MinLength(8, { message: "最小长度为8" })
    @MaxLength(64, { message: "最大长度为64" })
    newPassword!: string;
}
