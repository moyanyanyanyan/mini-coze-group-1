import { landingModules } from '../../app/feature-registry';
import { AppLink } from '../../shared/routing/AppLink';
import { Icon } from '@minicoze/ui/components';
import './landing.css';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <AppLink className="landing-brand" to="/">
          <span className="landing-brand-mark" aria-hidden="true">M</span>
          MiniCoze
        </AppLink>
        <nav className="landing-nav" aria-label="首页导航">
          <AppLink className="landing-link" to="/login">登录</AppLink>
          <AppLink className="landing-link landing-link-primary" to="/register">注册</AppLink>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero-section">
          <p className="hero-eyebrow">MiniCoze · Agent Platform</p>
          <h1>
            把想法，<br />
            搭成<em>能跑</em>的智能体
          </h1>
          <p className="hero-description">
            喂给它资料、装上工具、把步骤拖成一条线——不写代码，就能让 AI 帮你干活。
          </p>
          <div className="hero-actions">
            <AppLink className="button button-primary" to="/register">免费注册</AppLink>
            <AppLink className="button button-quiet" to="/login">我已有账号</AppLink>
          </div>
          <ul className="hero-points" aria-label="平台能力一览">
            <li>流式对话</li>
            <li>知识库</li>
            <li>工作流编排</li>
            <li>一键发布</li>
          </ul>
        </section>

        <section className="modules-section" id="modules">
          <div className="modules-head">
            <div>
              <h2>核心能力</h2>
              <p className="modules-subtitle">六个模块，覆盖智能体从搭建到发布的全过程。</p>
            </div>
            <span className="modules-index" aria-hidden="true">Modules / 06</span>
          </div>
          <div className="module-grid">
            {landingModules.map((item, index) => (
              <AppLink className="module-card" key={item.id} to={item.route}>
                <span className="module-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="module-icon">
                  <Icon name={item.id === 'publish-sdk' ? 'api' : item.icon} />
                </span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <span className="module-arrow" aria-hidden="true">→</span>
              </AppLink>
            ))}
          </div>
        </section>

        <section className="cta-section">
          <h2>现在就开始</h2>
          <p>注册一个账号，两分钟搭好第一个智能体。</p>
          <AppLink className="button button-invert" to="/register">
            创建账号 <span aria-hidden="true">→</span>
          </AppLink>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© 2026 MiniCoze</span>
        <small>Make agents, with clarity.</small>
      </footer>
    </div>
  );
}
