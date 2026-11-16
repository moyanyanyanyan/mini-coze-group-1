import { IsString, MaxLength, MinLength } from "class-validator";

// 只开放昵称：头像上传本轮不做，id/email 一律不接受
export class UpdateProfileDto {
    @IsString()
    @MinLength(1, { message: "昵称不能为空" })
    @MaxLength(20, { message: "昵称最大不能超过20个字" })
    displayName!: string;
}
