import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

// 只开放昵称与全局 Prompt：头像走上传接口，id/email 一律不接受
export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(1, { message: "昵称不能为空" })
    @MaxLength(20, { message: "昵称最大不能超过20个字" })
    displayName?: string;

    // 纯空白由 service/controller 统一清空为 null；这里只卡上限
    @IsOptional()
    @IsString()
    @MaxLength(4000, { message: "全局 Prompt 不能超过 4000 个字符" })
    globalPrompt?: string;
}
