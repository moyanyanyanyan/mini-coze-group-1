// 负责接收前端发送的登录注册请求，并将请求交给AuthService处理,即接口的入口
import { 
    Body, 
    Controller, 
    HttpCode, 
    HttpStatus,
    Post
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { AuthResponse } from "@minicoze/shared";
import { LoginDto } from "./dto/login.dto";



// 声明一个控制器，设置它的路由前缀为auth
@Controller('auth')
export class AuthController{
    constructor(private readonly auth:AuthService){}

    // 定义一个处理post请求的接口,路径后缀为register
    @Post('register')
    // 接口成功后返回HTTP的状态码
    @HttpCode(HttpStatus.CREATED)
    // 通过@Body读取请求体，并将请求体交给dto
    async register(@Body() dto:RegisterDto):Promise<AuthResponse>{
        return this.auth.register(dto)
    }

    // 登录同理

    @Post('login')
    @HttpCode(HttpStatus.CREATED)
    async login(@Body() dto:LoginDto):Promise<AuthResponse>{
        return this.auth.login(dto)
    }
}