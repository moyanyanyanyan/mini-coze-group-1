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
          <LinearPattern position="hero" />
          <div className="hero-grid">
            <div className="hero-content">
              <p className="section-kicker"><span>01</span> Agent development platform</p>
              <h1>让智能体创作，<br />拥有更清晰的路径。</h1>
              <p className="hero-description">
                从工作流、插件到 SDK，让每个模块独立生长、自然连接。
              </p>
              <div className="hero-actions">
                <AppLink className="button button-primary" to="/workspace">进入工作台 <span aria-hidden="true">→</span></AppLink>
                <a className="button button-quiet" href="#modules">查看功能模块</a>
              </div>
            </div>

            <div className="capability-map" aria-hidden="true">
              <span className="map-label map-label-start">MiniCoze</span>
              <span className="map-label map-label-create">创建</span>
              <span className="map-label map-label-compose">编排</span>
              <span className="map-label map-label-publish">发布</span>
              <svg viewBox="0 0 500 390">
                <path className="map-line" d="M28 194h112c42 0 42-95 86-95h70" />
                <path className="map-line" d="M140 194h156" />
                <path className="map-line" d="M140 194c42 0 42 95 86 95h70" />
                <path className="map-line map-line-out" d="M296 99h120M296 194h120M296 289h120" />
                <circle cx="140" cy="194" r="5" />
                <circle cx="296" cy="99" r="5" />
                <circle cx="296" cy="194" r="5" />
                <circle cx="296" cy="289" r="5" />
                <circle cx="416" cy="99" r="3" />
                <circle cx="416" cy="194" r="3" />
                <circle cx="416" cy="289" r="3" />
              </svg>
              <span className="map-coordinate">35°41′N · 139°41′E</span>
            </div>
          </div>
          <a className="scroll-cue" href="#modules" aria-label="滚动查看主要模块">
            <span>向下探索</span><i aria-hidden="true" />
          </a>
        </section>

        <section className="modules-section" id="modules">
          <LinearPattern position="modules" />
          <div className="section-heading">
            <p className="section-kicker"><span>02</span> Capabilities</p>
            <div>
              <h2>主要能力</h2>
              <p>每个模块独立开发，也可以自由组合。</p>
            </div>
          </div>

          <div className="module-grid">
            {landingModules.map((item, index) => (
              <AppLink className="module-tile" key={item.id} to={item.route}>
                <span className="module-index">{String(index + 1).padStart(2, '0')}</span>
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
          <LinearPattern position="quick" />
          <div className="quick-inner">
            <div className="section-heading quick-heading">
              <p className="section-kicker"><span>03</span> Quick start</p>
              <div>
                <h2>准备好开始了吗？</h2>
                <p>选择一个入口进入工作台，之后可以随时切换模块。</p>
              </div>
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
        <small>Make agents, with clarity.</small>
      </footer>
    </div>
  );
}

function LinearPattern({ position }: { position: 'hero' | 'modules' | 'quick' }) {
  return (
    <svg className={`linear-pattern linear-pattern-${position}`} viewBox="0 0 520 280" aria-hidden="true">
      <path d="M-10 214C94 126 152 252 260 152S420 104 538 26" />
      <path d="M-10 246C92 158 164 270 272 180S422 140 538 62" />
      <path className="pattern-soft" d="M-10 180C86 94 156 214 242 122S404 58 538-10" />
    </svg>
  );
}
