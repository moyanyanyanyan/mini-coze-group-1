import { landingModules } from '../../app/feature-registry';
import { AppLink } from '../../shared/routing/AppLink';
import { Icon } from '../../shared/ui/Icon';
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
          <h1>把想法，搭成能跑的智能体</h1>
          <p className="hero-description">
            喂给它资料、装上工具、把步骤拖成一条线——不写代码，就能让 AI 帮你干活。
          </p>
          <div className="hero-actions">
            <AppLink className="button button-primary" to="/register">免费注册</AppLink>
            <AppLink className="button button-quiet" to="/login">我已有账号</AppLink>
          </div>
        </section>

        <section className="modules-section" id="modules">
          <h2>核心能力</h2>
          <p className="modules-subtitle">六个模块，覆盖智能体从搭建到发布的全过程。</p>
          <div className="module-grid">
            {landingModules.map((item) => (
              <AppLink className="module-card" key={item.id} to={item.route}>
                <span className="module-icon">
                  <Icon name={item.id === 'publish-sdk' ? 'api' : item.icon} />
                </span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </AppLink>
            ))}
          </div>
        </section>

        <section className="cta-section">
          <h2>现在就开始</h2>
          <p>注册一个账号，两分钟搭好第一个智能体。</p>
          <AppLink className="button button-primary" to="/register">
            创建账号 <span aria-hidden="true">→</span>
          </AppLink>
        </section>
      </main>

      <footer className="landing-footer">
        <span>MiniCoze</span>
        <small>Make agents, with clarity.</small>
      </footer>
    </div>
  );
}
