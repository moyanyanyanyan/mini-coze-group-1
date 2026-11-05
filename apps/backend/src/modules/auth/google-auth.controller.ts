// A7 Google 登录的接入层，只有两个 GET 路由：
//   GET /api/auth/google          → 造 state → 种进 Cookie → 302 跳去 Google 授权页
//   GET /api/auth/google/callback → 校验 state → 换 token → 取资料 → 签发自己的 JWT → 302 回前端
// 整条链路是浏览器整页跳转，不是 fetch，所以这里不返回 JSON，全靠 302 和 Cookie 说话
import {
  Controller,
  Get,
  HttpException,
  Inject,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { OAUTH_PROVIDER, type OAuthProvider } from './oauth/oauth-provider';
import { ErrorCode } from '../../common/errors/error-codes';

// Provider 抛的两种 plain Error，message 恰好就是错误码本身
const PROVIDER_ERROR_CODES = new Set([
  'GOOGLE_TOKEN_EXCHANGE_FAILED',
  'GOOGLE_USERINFO_FAILED',
]);

@Controller('auth/google')
export class GoogleAuthController{
    private readonly logger=new Logger(GoogleAuthController.name);
    /** state 存的 Cookie 名。httpOnly，前端 JS 读不到 */
    private readonly stateCookie='google_oauth_state';

    constructor(
        private readonly auth:AuthService,
        private readonly config:ConfigService,
        // 按接口注入。以后 Mock 上场只改 module 里的绑定，这个文件一行不动
        @Inject(OAUTH_PROVIDER) private readonly provider:OAuthProvider,
    ){}

    // 第一步：前端把用户整页带到这里（a 标签或 window.location），后端发起授权
    @Get()
    start(@Res() res:Response){
        // 32 位十六进制随机串，一次登录一个，回调用完就删
        const state=randomBytes(16).toString('hex');

        res.cookie(this.stateCookie,state,{
            httpOnly:true,
            // Lax 的意义：顶层 GET 跳转（Google 302 回来）会带上这个 Cookie，跨站 POST 不带
            sameSite:'lax',
            secure:process.env.NODE_ENV==='production',
            maxAge:10*60*1000,  // 10 分钟内没走完授权就作废
            path:'/',
        });

        res.redirect(this.provider.buildAuthorizeUrl(state));
    }

    // 第二步：用户在 Google 点完同意，Google 302 回这里，query 上带着 code 和 state
    @Get('callback')
    async callback(
        @Query('code') code:string|undefined,
        @Query('state') state:string|undefined,
        @Req() req:Request,
        @Res() res:Response,
    ):Promise<void>{
        const webOrigin=this.config.getOrThrow<string>('WEB_ORIGIN');

        // 这条链路用户看到的是浏览器整页跳转，抛 JSON 他只能看到一坨字符串。
        // 统一改「302 回登录页 + 错误码放 query」，由前端翻译成人话
        const fail=(failCode:ErrorCode)=>{
            res.clearCookie(this.stateCookie,{path:'/'});
            res.redirect(`${webOrigin}/login?error=${failCode}`);
        };

        // ① 用户在 Google 页面点了取消：Google 不给 code。不算错误，静默回登录页
        if(!code||!state){
            res.clearCookie(this.stateCookie,{path:'/'});
            res.redirect(`${webOrigin}/login`);
            return;
        }

        // ② CSRF 防线本体：query 上的 state 必须和我们种在 Cookie 里的那个一致
        const cookieState=(req.cookies as Record<string,string|undefined>|undefined)?.[this.stateCookie];
        if(state!==cookieState){
            this.logger.warn(`state 不匹配：query=${state} cookie=${cookieState}`);
            fail(ErrorCode.GOOGLE_STATE_MISMATCH);
            return;
        }

        try{
            // ③ code 换 access_token（client_secret 只出现在这一步）
            const {accessToken}=await this.provider.exchangeCode(code);
            // ④ 拿 access_token 取「这个人是谁」
            const profile=await this.provider.fetchProfile(accessToken);
            // ⑤ 认人 + 签发 MiniCoze 自己的 JWT（三分支在 AuthService 里）
            const result=await this.auth.loginWithGoogle(profile);

            // state 是一次性的，用完就删
            res.clearCookie(this.stateCookie,{path:'/'});
            // 和密码登录完全同一份 Cookie 配方，前端无感知
            res.cookie('access_token',result.accessToken,{
                httpOnly:true,
                sameSite:'lax',
                secure:process.env.NODE_ENV==='production',
                maxAge:7*24*60*60*1000,
                path:'/',
            });
            // 对齐密码登录的落点（前端是 navigate('/workspace')）。
            // 这里必须是后端指路：302 发生时前端页面还没加载，轮不到它决定去哪
            res.redirect(`${webOrigin}/workspace`);
        }catch(err){
            this.logger.error(err instanceof Error?err.stack??err.message:String(err));
            // 认得出来源的错按码回；认不出的统一 INTERNAL_ERROR
            if(err instanceof HttpException){
                const body=err.getResponse() as {code?:string};
                if(typeof body?.code==='string'){
                    fail(body.code as ErrorCode);
                    return;
                }
            }
            if(err instanceof Error&&PROVIDER_ERROR_CODES.has(err.message)){
                fail(ErrorCode.GOOGLE_TOKEN_EXCHANGE_FAILED);
                return;
            }
            fail(ErrorCode.INTERNAL_ERROR);
        }
    }
}
