// 登录
import { useState } from "react"
import { Route,useNavigate,Link } from "react-router"


export function LoginPage (){
    const [email,setEmail]=useState('');
    const [password,setPassword]=useState('');
    const navigate=useNavigate();

    const handleSubmit=(e:React.FormEvent)=>{
        e.preventDefault();
        navigate("/app")
    }
    return (
        <div>
            <h2>请登录</h2>
            <form onSubmit={handleSubmit}>
                {/* 邮箱输入 */}
                <div>
                    <label>邮箱： </label>
                    <input
                    type="email"
                    value={email}
                    placeholder="请输入邮箱"
                    onChange={(e)=>setEmail(e.target.value)}
                    required
                    />
                </div>
                <div>
                    <label>密码： </label>
                    <input
                    type="password"
                    value={password}
                    placeholder="请输入密码"
                    onChange={(e)=>setPassword(e.target.value)}
                    required
                    />
                </div>
                <button>登录</button>
            </form>
            <Link to="/register">没有账号？去注册</Link>
        </div>
    )
}