const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export function App() {
  return (
    <main className="shell">
      <section className="card">
        <span className="eyebrow">MINICOZE MVP</span>
        <h1>开发骨架已就绪</h1>
        <p className="intro">
          当前仓库仅包含 React、NestJS、FastAPI 和 PostgreSQL/pgvector 的基础边界，业务模块由各负责人继续实现。
        </p>
        <dl className="services">
          <div>
            <dt>Web</dt>
            <dd><span className="status" />运行中</dd>
          </div>
          <div>
            <dt>Backend API</dt>
            <dd><code>{apiBaseUrl}</code></dd>
          </div>
          <div>
            <dt>Agent Service</dt>
            <dd>仅由 Backend 内部调用</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
