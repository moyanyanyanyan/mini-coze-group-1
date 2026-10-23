// 负责接收前端发送的登录注册请求，并将请求交给AuthService处理,即接口的入口
import { 
    Body, 
    Controller, 
    HttpCode, 
    HttpStatus,
    Post,
    Get,
    Res,
    UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { AuthResponse } from "@minicoze/shared";
import type { CurrentUser as CurrentUserPayload } from "@minicoze/shared";
import { LoginDto } from "./dto/login.dto";
import { AuthGuard } from "@nestjs/passport";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import path from "path";


// 声明一个控制器，设置它的路由前缀为auth
@Controller('auth')
export class AuthController{
    constructor(private readonly auth:AuthService){}

    // 下发 HttpOnly Cookie 的统一出口，注册/登录共用
    private setAuthCookie(res: Response, token: string) {
        res.cookie('access_token', token, {
            httpOnly: true,                     // JS 读不到，防 XSS 偷 token
            sameSite: 'lax',                    // 挡跨站 POST 的 CSRF
            secure: process.env.NODE_ENV === 'production',  // 生产环境仅 HTTPS
            maxAge: 7 * 24 * 60 * 60 * 1000,    // 7 天有效期，和 JWT 有效期对齐
            path: '/',
        });
    }

    // 定义一个处理post请求的接口,路径后缀为register
    @Post('register')
    // 接口成功后返回HTTP的状态码
    @HttpCode(HttpStatus.CREATED)
    // 通过@Body读取请求体，并将请求体交给dto
    async register(
        @Body() dto: RegisterDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponse> {
        const result = await this.auth.register(dto);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }

    // 登录同理

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponse> {
        const result = await this.auth.login(dto);
        this.setAuthCookie(res, result.accessToken);
        return result;
    }


    // 用token拿用户信息
    @Get('me')
    // 验证登录状态
    // guard会在进入me方法之前会先调用jwtstrategy检验拿到的token是否有效
    @UseGuards(AuthGuard('jwt'))
    me(@CurrentUser() user:CurrentUserPayload):CurrentUserPayload{
        return user;
    }

    // 退出登录
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    logout(@Res({passthrough:true}) res:Response){
        res.clearCookie('access_token',{path:'/'});
        return {ok:true};
    }
}
