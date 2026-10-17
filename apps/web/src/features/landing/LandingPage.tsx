import { landingModules } from '../../app/navigation';
import { AppLink } from '../../shared/routing/AppLink';
import { Icon } from '../../shared/ui/Icon';
import './landing.css';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="返回页面顶部">
          <span className="landing-brand-mark" aria-hidden="true">M</span>
          <span>MiniCoze</span>
        </a>
        <nav className="landing-nav" aria-label="首页导航">
          <a href="#top">产品首页</a>
          <AppLink to="/workspace">开发入口</AppLink>
        </nav>
      </header>

      <main>
        <section className="hero-section" id="top">
          <OrganicPattern position="hero" />
          <div className="hero-content">
            <p className="section-kicker">欢迎来到 MiniCoze</p>
            <h1>让智能体创作<br />变得简单</h1>
            <p className="hero-description">
              在一个轻盈的工作台里，搭建、连接并发布你的智能体。
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#modules">了解主要模块</a>
              <a className="button button-quiet" href="#quick-start">快速开始</a>
            </div>
          </div>
          <a className="scroll-cue" href="#modules" aria-label="滚动查看主要模块">
            <span>向下探索</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          </a>
        </section>

        <section className="modules-section" id="modules">
          <OrganicPattern position="modules" />
          <div className="section-heading">
            <p className="section-kicker">主要能力</p>
            <h2>探索主要模块</h2>
            <p>每个模块独立开发，也能自然连接。</p>
          </div>

          <div className="module-grid">
            {landingModules.map((item) => (
              <AppLink className="module-tile" key={item.id} to={item.route}>
                <span className="module-icon"><Icon name={item.id === 'publish-sdk' ? 'api' : item.icon} /></span>
                <span className="module-copy">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="module-arrow" aria-hidden="true">→</span>
              </AppLink>
            ))}
          </div>
        </section>

        <section className="quick-section" id="quick-start">
          <OrganicPattern position="quick" />
          <div className="quick-inner">
            <div className="section-heading quick-heading">
              <p className="section-kicker">快速开始</p>
              <h2>选择一个入口，开始搭建</h2>
              <p>从最适合你的路径进入，随时可以切换到其他模块。</p>
            </div>

            <div className="quick-actions">
              <AppLink className="quick-card" to="/workspace/agents/create">
                <Icon name="edit" />
                <span><strong>创建智能体</strong><small>从基础配置开始创建</small></span>
                <b aria-hidden="true">→</b>
              </AppLink>
              <AppLink className="quick-card" to="/workspace/chat">
                <Icon name="chat" />
                <span><strong>智能体聊天</strong><small>进入智能体对话区域</small></span>
                <b aria-hidden="true">→</b>
              </AppLink>
              <AppLink className="workspace-entry" to="/workspace">
                进入完整工作台
                <span aria-hidden="true">→</span>
              </AppLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>MiniCoze</span>
        <small>轻盈地连接每一种智能体能力</small>
      </footer>
    </div>
  );
}

function OrganicPattern({ position }: { position: 'hero' | 'modules' | 'quick' }) {
  return (
    <svg className={`organic-pattern organic-pattern-${position}`} viewBox="0 0 420 220" aria-hidden="true">
      <path className="pattern-line" d="M-20 146c62-58 111-24 161-52 54-31 86-92 157-67 40 14 63 49 143 17" />
      <path className="pattern-line pattern-line-soft" d="M8 179c60-28 95 6 153-21 51-23 82-73 142-55 39 12 61 39 126 18" />
      <path className="pattern-petal" d="M327 155c9-13 20-10 18 3-2 11-12 16-18 18-6-7-7-14 0-21Zm0 21c-13 9-22 2-14-8 7-9 17-8 24-5 0 9-3 12-10 13Z" />
    </svg>
  );
}
