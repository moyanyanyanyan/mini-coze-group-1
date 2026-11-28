import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import type { CurrentUser as CurrentUserPayload } from "@minicoze/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseInterceptor } from "../../common/response.interceptor";
import { ErrorCode } from "../../common/errors/error-codes";
import { UsersService } from "./users.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import {
  AvatarStorageService,
  MAX_AVATAR_BYTES,
  type UploadedAvatarFile,
} from "./avatar-storage.service";

// 个人中心。用户身份只认 JWT 里的 userId，请求体一律不接 id
@Controller("users")
@UseInterceptors(ResponseInterceptor)
@UseGuards(AuthGuard("jwt"))
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarStorageService,
  ) {}

  @Get("me")
  async me(@CurrentUser() current: CurrentUserPayload) {
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: "登录状态无效",
      });
    }
    const stats = await this.users.getProfileStats(current.id);
    return this.toProfile(user, stats);
  }

  @Patch("me")
  async update(@CurrentUser() current: CurrentUserPayload, @Body() dto: UpdateProfileDto) {
    if (dto.displayName === undefined && dto.globalPrompt === undefined && dto.bio === undefined) {
      throw new BadRequestException("没有可更新的字段");
    }

    if (dto.displayName !== undefined) {
      const displayName = dto.displayName.trim();
      if (!displayName) {
        throw new BadRequestException("昵称不能为空");
      }
      await this.users.updateDisplayName(current.id, displayName);
    }

    if (dto.bio !== undefined) {
      const bio = dto.bio.trim();
      // 空串或纯空白统一清空，前端展示「暂无简介」
      await this.users.updateBio(current.id, bio === "" ? null : bio);
    }

    if (dto.globalPrompt !== undefined) {
      const value = dto.globalPrompt.trim();
      // 空串或纯空白统一清空
      await this.users.updateGlobalPrompt(current.id, value === "" ? null : value);
    }

    const user = await this.users.findById(current.id);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: "登录状态无效",
      });
    }
    const stats = await this.users.getProfileStats(current.id);
    return this.toProfile(user, stats);
  }

  private toProfile(
    user: {
      id: string;
      email: string;
      displayName: string;
      bio: string | null;
      avatarUrl: string | null;
      googleId: string | null;
      passwordHash: string | null;
      globalPrompt: string | null;
      createdAt: Date;
    },
    stats: { agentCount: number; conversationCount: number },
  ) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      createdAt: user.createdAt.toISOString(),
      avatarUrl: user.avatarUrl,
      // 只暴露布尔值，不把 googleId 这种外部账号 ID 发给前端
      googleLinked: user.googleId !== null,
      hasPassword: user.passwordHash !== null,
      globalPrompt: user.globalPrompt,
      stats,
    };
  }

  @Post("me/avatar")
  // 硬上限放到 2 倍，5MB 的友好提示由 service 给出
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_AVATAR_BYTES * 2 } }))
  async uploadAvatar(
    @CurrentUser() current: CurrentUserPayload,
    @UploadedFile() file?: UploadedAvatarFile,
  ) {
    const previous = await this.users.findById(current.id);
    const avatarUrl = await this.avatars.save(current.id, file);
    const user = await this.users.updateAvatar(current.id, avatarUrl);
    await this.avatars.removeByUrl(previous?.avatarUrl);
    return this.users.toCurrentUser(user);
  }

  @Patch("me/password")
  @HttpCode(200)
  async changePassword(@CurrentUser() current: CurrentUserPayload, @Body() dto: ChangePasswordDto) {
    await this.users.changePassword(current.id, dto.currentPassword, dto.newPassword);
    return null;
  }
}
