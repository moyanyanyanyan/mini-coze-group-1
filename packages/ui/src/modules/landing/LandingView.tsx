import { BRAND_NAME, BRAND_TAGLINE } from '../../brand';
import { BrandMark, Icon, type IconName } from '../../components';
import type { LinkComponentType } from '../../layouts/types';
import './landing.css';

export interface LandingModuleView {
  id: string;
  route: string;
  title: string;
  description: string;
  icon: IconName;
}

export interface LandingViewProps {
  modules: readonly LandingModuleView[];
  routes: {
    home: string;
    login: string;
    register: string;
    workspace: string;
    chat: string;
  };
  LinkComponent: LinkComponentType;
}

const featureCopy: Record<string, { eyebrow: string; description: string; accent: string }> = {
  'agent-builder': { eyebrow: '角色积木', description: '配置角色、模型、提示词与上下文，搭出真正懂工作的智能体。', accent: 'violet' },
  'agent-chat': { eyebrow: '对话积木', description: '带着知识与工具流式对话，历史自动保存，随时接着推进。', accent: 'blue' },
  knowledge: { eyebrow: '知识积木', description: '把文档和业务资料变成可检索知识，让回答更可靠、更贴近上下文。', accent: 'amber' },
  plugins: { eyebrow: '工具积木', description: '接入真实工具，从查询信息到执行动作，不再只停留在回答。', accent: 'green' },
  workflow: { eyebrow: '流程积木', description: '用可视化节点组合模型、工具和判断，把复杂任务搭成稳定流程。', accent: 'rose' },
  'publish-sdk': { eyebrow: '发布积木', description: '通过 API 与 SDK 接入产品，让搭好的智能体进入真实业务。', accent: 'slate' },
};

const steps = [
  ['01', '放入角色', '写下目标与边界，选择合适模型。'],
  ['02', '拼上能力', '连接知识库、插件与工作流。'],
  ['03', '对话试跑', '在真实会话中快速测试和调整。'],
  ['04', '发布使用', '接入产品或交给团队持续运行。'],
];

export function LandingView({ modules, routes, LinkComponent }: LandingViewProps) {
  return (
    <main className="landing-page">
      <header className="landing-nav" data-reveal>
        <LinkComponent className="landing-brand" to={routes.home}>
          <BrandMark className="landing-brand-mark" />
          <span>{BRAND_NAME}</span>
        </LinkComponent>
        <nav className="landing-nav-links" aria-label="首页导航">
          <a href="#capabilities">能力积木</a>
          <a href="#workflow">搭建方法</a>
          <a href="#launch">开始使用</a>
        </nav>
        <div className="landing-nav-actions">
          <LinkComponent className="landing-button is-quiet" to={routes.login}>登录</LinkComponent>
          <LinkComponent className="landing-button is-primary is-small" to={routes.register}>免费开始</LinkComponent>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy" data-reveal>
          <div className="landing-kicker"><span />模块化 AI Agent 工作空间</div>
          <h1>把灵感，<span>一块块搭成会做事的智能体。</span></h1>
          <p>从角色、知识、工具到工作流，妙搭把复杂的 AI 能力变成可以自由组合的积木，让每个想法都有清晰的落地路径。</p>
          <div className="landing-hero-actions">
            <LinkComponent className="landing-button is-primary" to={routes.workspace}>进入工作台 <span>→</span></LinkComponent>
            <LinkComponent className="landing-button is-secondary" to={routes.chat}>体验智能对话</LinkComponent>
          </div>
          <div className="landing-proof" aria-label="产品能力概览">
            <div><strong>{modules.length}</strong><span>核心能力积木</span></div>
            <div><strong>0</strong><span>代码门槛</span></div>
            <div><strong>1</strong><span>个统一工作台</span></div>
          </div>
        </div>

        <div className="landing-product" aria-label="妙搭产品界面预览" data-reveal>
          <div className="landing-product-glow" />
          <div className="landing-block-cluster is-top" aria-hidden="true">
            <i className="is-coral" /><i className="is-yellow" /><i className="is-cyan" />
          </div>
          <div className="landing-block-cluster is-side" aria-hidden="true">
            <i className="is-green" /><i className="is-violet" /><i className="is-coral" />
          </div>
          <div className="landing-product-window">
            <div className="landing-window-bar">
              <BrandMark className="landing-window-logo" />
              <span>妙搭工作台</span>
              <div className="landing-window-dots"><i /><i /><i /></div>
            </div>
            <div className="landing-window-body">
              <aside className="landing-demo-sidebar">
                {(['home', 'edit', 'chat', 'book', 'workflow'] as IconName[]).map((name, index) => (
                  <span className={index === 2 ? 'is-active' : ''} key={name}><Icon name={name} /></span>
                ))}
              </aside>
              <div className="landing-demo-chat">
                <div className="landing-demo-head">
                  <div><small>ACTIVE AGENT</small><strong>品牌内容助手</strong></div>
                  <span>在线</span>
                </div>
                <div className="landing-demo-messages">
                  <div className="landing-demo-message is-user">帮我把产品笔记搭成一篇发布稿。</div>
                  <div className="landing-demo-message is-ai">
                    <div className="landing-demo-ai-title"><span>AI</span> 已拼接知识与写作流程</div>
                    <p>可以。我会先提炼价值，再按“问题—方案—亮点—行动”组合成完整内容。</p>
                    <div className="landing-demo-lines"><i /><i /><i /></div>
                  </div>
                </div>
                <div className="landing-demo-composer"><span>继续添加一块能力…</span><b>↑</b></div>
              </div>
            </div>
          </div>
          <div className="landing-float-card is-top">
            <span className="landing-mini-block is-cyan"><Icon name="book" /></span>
            <div><strong>知识积木已连接</strong><span>12 个文档可检索</span></div>
          </div>
          <div className="landing-float-card is-bottom">
            <span className="landing-mini-block is-green"><Icon name="workflow" /></span>
            <div><strong>流程正在拼接</strong><span>3 / 4 个节点完成</span></div>
          </div>
        </div>
      </section>

      <section className="landing-trust" data-reveal>
        <span>为创造者、产品团队与开发者打造</span>
        <div><b>角色</b><i>+</i><b>知识</b><i>+</i><b>工具</b><i>+</i><b>流程</b><i>=</i><b>会行动的智能体</b></div>
      </section>

      <section className="landing-section" id="capabilities">
        <div className="landing-section-heading" data-reveal>
          <span>自由组合的能力积木</span>
          <h2>从一个想法，搭到一个可运行的 AI 助手。</h2>
          <p>每个模块都能独立使用，也能像积木一样互相连接，逐步组合出适合你的工作方式。</p>
        </div>
        <div className="landing-feature-grid">
          {modules.map((feature, index) => {
            const copy = featureCopy[feature.id];
            return (
              <LinkComponent className={`landing-feature-card accent-${copy?.accent ?? 'violet'}`} key={feature.id} to={feature.route} data-reveal>
                <div className="landing-feature-top">
                  <span className="landing-feature-index">0{index + 1}</span>
                  <span className="landing-feature-icon"><Icon name={feature.icon} /></span>
                </div>
                <span className="landing-feature-eyebrow">{copy?.eyebrow}</span>
                <h3>{feature.title}</h3>
                <p>{copy?.description ?? feature.description}</p>
                <span className="landing-feature-link">拿起这块积木 <b>↗</b></span>
              </LinkComponent>
            );
          })}
        </div>
      </section>

      <section className="landing-process" id="workflow" data-reveal>
        <div className="landing-process-copy">
          <span>四步搭出你的智能体</span>
          <h2>不用一次想明白，<br />从第一块开始搭。</h2>
          <p>先放入最核心的角色，再逐步连接知识、工具和流程。每一步都能测试，也能随时替换。</p>
          <LinkComponent className="landing-text-link" to={routes.workspace}>查看我的工作台 <span>→</span></LinkComponent>
        </div>
        <div className="landing-steps">
          {steps.map(([number, title, description], index) => (
            <div className={`landing-step step-tone-${index + 1}`} key={number}>
              <span>{number}</span>
              <div><strong>{title}</strong><p>{description}</p></div>
              {index < steps.length - 1 ? <i /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta" id="launch" data-reveal>
        <div>
          <span>START WITH ONE BLOCK</span>
          <h2>今天就搭出你的第一个智能体。</h2>
          <p>从一块角色积木开始，几分钟内连接知识并完成第一轮对话。</p>
        </div>
        <LinkComponent className="landing-button is-light" to={routes.register}>创建免费账号 <span>→</span></LinkComponent>
      </section>

      <footer className="landing-footer" data-reveal>
        <div className="landing-brand"><BrandMark className="landing-brand-mark" /><span>{BRAND_NAME}</span></div>
        <span>{BRAND_TAGLINE}</span>
        <small>© 2026 妙搭</small>
      </footer>
    </main>
  );
}
