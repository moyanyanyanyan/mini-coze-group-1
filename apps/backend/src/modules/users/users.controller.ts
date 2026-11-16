import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { CurrentUser as CurrentUserPayload } from "@minicoze/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseInterceptor } from "../../common/response.interceptor";
import { ErrorCode } from "../../common/errors/error-codes";
import { UsersService } from "./users.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";

// 个人中心。用户身份只认 JWT 里的 userId，请求体一律不接 id
@Controller("users")
@UseInterceptors(ResponseInterceptor)
@UseGuards(AuthGuard("jwt"))
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  async me(@CurrentUser() current: CurrentUserPayload) {
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: "登录状态无效",
      });
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      // 只暴露布尔值，不把 googleId 这种外部账号 ID 发给前端
      googleLinked: user.googleId !== null,
      hasPassword: user.passwordHash !== null,
    };
  }

  @Patch("me")
  async update(@CurrentUser() current: CurrentUserPayload, @Body() dto: UpdateProfileDto) {
    const displayName = dto.displayName.trim();
    if (!displayName) {
      throw new BadRequestException("昵称不能为空");
    }
    const user = await this.users.updateDisplayName(current.id, displayName);
    return this.users.toCurrentUser(user);
  }

  @Patch("me/password")
  @HttpCode(200)
  async changePassword(@CurrentUser() current: CurrentUserPayload, @Body() dto: ChangePasswordDto) {
    await this.users.changePassword(current.id, dto.currentPassword, dto.newPassword);
    return null;
  }
}
