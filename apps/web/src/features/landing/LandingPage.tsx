import type { IconName } from '../../app/types';
import { landingModules } from '../../app/feature-registry';
import { navigate } from '../../shared/routing/navigation';
import { Icon } from '../../shared/ui/Icon';
import { BrandMark } from '../../shared/ui/BrandMark';
import { BRAND_NAME } from '../../shared/brand';
import { LandingMotion } from './LandingMotion';
import './landing.css';

const featureCopy: Record<string, { eyebrow: string; description: string; accent: string }> = {
  'agent-builder': { eyebrow: 'DEFINE', description: '配置角色、模型、提示词与上下文，让每个智能体都真正懂自己的工作。', accent: 'violet' },
  'agent-chat': { eyebrow: 'TALK', description: '带着知识库与工具进行流式对话，历史记录自动保存，随时继续。', accent: 'blue' },
  knowledge: { eyebrow: 'GROUND', description: '把文档与业务资料沉淀为可检索知识，让回答更可靠、更贴近上下文。', accent: 'amber' },
  plugins: { eyebrow: 'ACT', description: '为智能体接入真实工具，从查询信息到执行动作，不再停留在回答层面。', accent: 'green' },
  workflow: { eyebrow: 'ORCHESTRATE', description: '用可视化节点串联模型、工具与判断，把复杂任务变成稳定流程。', accent: 'rose' },
  'publish-sdk': { eyebrow: 'SHIP', description: '通过 API 与 SDK 将能力接入你的产品，让智能体真正进入业务场景。', accent: 'slate' },
};

const steps = [
  ['01', '定义角色', '写下目标与边界，选择合适模型。'],
  ['02', '连接能力', '绑定知识库、插件与工作流。'],
  ['03', '对话验证', '在真实会话中快速测试和迭代。'],
  ['04', '发布使用', '一键接入你的产品或团队流程。'],
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <LandingMotion />
      <header className="landing-nav" data-reveal>
        <button className="landing-brand" type="button" onClick={() => navigate('/')}>
          <BrandMark className="landing-brand-mark" /><span>{BRAND_NAME}</span>
        </button>
        <nav className="landing-nav-links" aria-label="首页导航">
          <a href="#capabilities">能力</a><a href="#workflow">方法</a><a href="#launch">开始</a>
        </nav>
        <div className="landing-nav-actions">
          <button className="landing-button is-quiet" type="button" onClick={() => navigate('/login')}>登录</button>
          <button className="landing-button is-primary is-small" type="button" onClick={() => navigate('/register')}>免费开始</button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy" data-reveal>
          <div className="landing-kicker"><span />一站式 AI Agent 工作空间</div>
          <h1>把你的想法，<span>变成真正会做事的智能体。</span></h1>
          <p>从角色设定、知识接入到工作流编排与发布，织跃把复杂的 AI 能力，收进一个清晰、顺手的工作台。</p>
          <div className="landing-hero-actions">
            <button className="landing-button is-primary" type="button" onClick={() => navigate('/workspace')}>进入工作台 <span>→</span></button>
            <button className="landing-button is-secondary" type="button" onClick={() => navigate('/workspace/chat')}>体验智能对话</button>
          </div>
          <div className="landing-proof" aria-label="产品能力概览">
            <div><strong>{landingModules.length}</strong><span>核心模块</span></div>
            <div><strong>0</strong><span>代码门槛</span></div>
            <div><strong>1</strong><span>个统一工作台</span></div>
          </div>
        </div>

        <div className="landing-product" aria-label="织跃产品界面预览" data-reveal>
          <div className="landing-product-glow" />
          <div className="landing-product-window">
            <div className="landing-window-bar">
              <BrandMark className="landing-window-logo" /><span>织跃工作台</span>
              <div className="landing-window-dots"><i /><i /><i /></div>
            </div>
            <div className="landing-window-body">
              <aside className="landing-demo-sidebar">
                {(['home', 'edit', 'chat', 'book', 'workflow'] as IconName[]).map((name, index) => (
                  <span className={index === 2 ? 'is-active' : ''} key={name}><Icon name={name} /></span>
                ))}
              </aside>
              <div className="landing-demo-chat">
                <div className="landing-demo-head"><div><small>ACTIVE AGENT</small><strong>品牌内容助手</strong></div><span>在线</span></div>
                <div className="landing-demo-messages">
                  <div className="landing-demo-message is-user">帮我把这份产品笔记整理成一篇发布稿。</div>
                  <div className="landing-demo-message is-ai">
                    <div className="landing-demo-ai-title"><span>AI</span> 已读取产品知识库</div>
                    <p>当然可以。我会先提炼核心价值，再按“问题—方案—亮点—行动”组织内容。</p>
                    <div className="landing-demo-lines"><i /><i /><i /></div>
                  </div>
                </div>
                <div className="landing-demo-composer"><span>继续描述你的目标…</span><b>↑</b></div>
              </div>
            </div>
          </div>
          <div className="landing-float-card is-top"><Icon name="book" /><div><strong>知识已连接</strong><span>12 个文档可检索</span></div></div>
          <div className="landing-float-card is-bottom"><span className="landing-pulse" /><div><strong>工作流运行中</strong><span>3 / 4 节点完成</span></div></div>
        </div>
      </section>

      <section className="landing-trust" data-reveal><span>为创造者、产品团队与开发者打造</span><div><b>清晰配置</b><b>实时对话</b><b>知识增强</b><b>流程编排</b><b>开放接入</b></div></section>

      <section className="landing-section" id="capabilities">
        <div className="landing-section-heading" data-reveal><span>完整能力栈</span><h2>从一个想法，到一个可运行的 AI 助手。</h2><p>不是零散功能的堆叠，而是一条从创造、验证到交付的完整路径。</p></div>
        <div className="landing-feature-grid">
          {landingModules.map((feature, index) => {
            const copy = featureCopy[feature.id];
            return (
              <button type="button" className={`landing-feature-card accent-${copy?.accent ?? 'violet'}`} key={feature.id} onClick={() => navigate(feature.route)} data-reveal>
                <div className="landing-feature-top"><span className="landing-feature-index">0{index + 1}</span><span className="landing-feature-icon"><Icon name={feature.icon} /></span></div>
                <span className="landing-feature-eyebrow">{copy?.eyebrow}</span><h3>{feature.title}</h3><p>{copy?.description ?? feature.description}</p>
                <span className="landing-feature-link">了解模块 <b>↗</b></span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="landing-process" id="workflow" data-reveal>
        <div className="landing-process-copy"><span>一条自然的创作路径</span><h2>少一点配置焦虑，<br />多一点快速验证。</h2><p>把大任务拆成四个清晰阶段。每一步都有明确入口，也能随时回到对话里验证结果。</p><button className="landing-text-link" type="button" onClick={() => navigate('/workspace')}>查看我的工作台 <span>→</span></button></div>
        <div className="landing-steps">
          {steps.map(([number, title, description], index) => <div className="landing-step" key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div>{index < steps.length - 1 ? <i /> : null}</div>)}
        </div>
      </section>

      <section className="landing-cta" id="launch" data-reveal>
        <div><span>READY WHEN YOU ARE</span><h2>今天就让你的第一个智能体开始工作。</h2><p>从创建角色开始，几分钟内完成知识连接和第一轮对话。</p></div>
        <button className="landing-button is-light" type="button" onClick={() => navigate('/register')}>创建免费账号 <span>→</span></button>
      </section>

      <footer className="landing-footer" data-reveal><div className="landing-brand"><BrandMark className="landing-brand-mark" /><span>{BRAND_NAME}</span></div><span>把想法织成行动，让每个好创意都能真正运转。</span><small>© 2026 织跃</small></footer>
    </main>
  );
}
