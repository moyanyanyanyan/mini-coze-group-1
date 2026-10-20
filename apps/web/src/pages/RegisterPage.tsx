// 登录
import { useState } from "react"
import { Route,useNavigate,Link } from "react-router"


export function RegisterPage (){
    const [email,setEmail]=useState('');
    const [password,setPassword]=useState('');
    const [username,setUsername]=useState('');
    const navigate=useNavigate();

    const handleSubmit=(e:React.FormEvent)=>{
        e.preventDefault();
    }
    return (
        <div>
            <h2>请注册</h2>
            <form onSubmit={handleSubmit}>
                {/* 用户名 */}
                <div>
                    <label>用户名： </label>
                    <input
                    type="text" 
                    value={username}
                    placeholder="请输入用户名"
                    onChange={(e)=>setUsername(e.target.value)}
                    />
                </div>
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
                {/* 密码 */}
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
                {/* 确认密码 */}
                <div>
                    <label>确认密码： </label>
                    <input
                    type="password"
                    value={password}
                    placeholder="请再次输入密码"
                    onChange={(e)=>setEmail(e.target.value)}
                    required
                    />
                </div>
                <button>注册</button>
            </form>
            <Link to="/login">已有账号？去登录</Link>
        </div>
    )
}