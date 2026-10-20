import { Routes, Route, Navigate,useNavigate } from "react-router";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AppShell } from "./pages/AppShell";

// 临时占位页：等各模块负责人的页面交付后，把 <ComingSoon> 换成对应的真页面
function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p>这块由对应同学负责，页面还没接进来。</p>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();

  const handleLogout = () => {
    // TODO: 登录/鉴权做完后，这里要先清掉 token 再跳转
    navigate("/login");
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/app" element={<AppShell onLogout={handleLogout} />}>
        <Route index element={<Navigate to="/app/chat" replace />} />
        <Route path="chat" element={<ComingSoon title="对话" />} />
        <Route path="agents" element={<ComingSoon title="智能体" />} />
        <Route path="knowledge" element={<ComingSoon title="知识库" />} />
        <Route path="plugins" element={<ComingSoon title="插件" />} />
        <Route path="workflows" element={<ComingSoon title="工作流" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
