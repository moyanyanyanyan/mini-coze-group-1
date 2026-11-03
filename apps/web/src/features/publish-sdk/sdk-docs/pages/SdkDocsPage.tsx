import { useEffect, useState, type ReactNode } from 'react';
import { AppLink } from '../../../../shared/routing/AppLink';
import { useNotice, type NoticeType } from '../../../../shared/hooks/use-notice';
import { NoticeToast } from '../../../../shared/ui/NoticeToast';
import {
  API_DOC_SECTIONS,
  ENDPOINTS,
  FAQ_ITEMS,
  HTTP_STATUSES,
  QUICK_START_SAMPLES,
  REQUEST_PARAMETERS,
  RUN_ERROR_SAMPLE,
  RUN_REQUEST_SAMPLE,
  RUN_RESPONSE_SAMPLE,
  SDK_ERROR_SAMPLE,
  SDK_INIT_SAMPLE,
  SDK_INSTALL_SAMPLE,
  SDK_TYPES,
  SSE_EVENTS,
  STREAM_REQUEST_SAMPLE,
  STREAM_SDK_SAMPLE,
  type DocSection,
} from '../data/api-docs.data';
import { CodeBlock } from '../components/CodeBlock';
import { API_MANAGEMENT_ROUTE } from '../../api-management/router/routes';
import '../styles/api-docs.css';

export function SdkDocsPage() {
  const [quickStartSample, setQuickStartSample] = useState(QUICK_START_SAMPLES[0].id);
  const activeSection = useActiveSection();
  const { notice, showNotice } = useNotice();
  const selectedSample = QUICK_START_SAMPLES.find((sample) => sample.id === quickStartSample)
    ?? QUICK_START_SAMPLES[0];
  const handleNotice = (type: NoticeType, message: string) => {
    showNotice(type, message);
  };

  return (
    <section className="feature-page api-docs-page" aria-labelledby="api-docs-title">
      <NoticeToast notice={notice} />

      <div className="api-doc-layout">
        <article className="api-doc-main">
          <header className="api-doc-hero">
            <p className="api-doc-eyebrow">Develop / API / Documentation</p>
            <div className="api-doc-title-row">
              <h1 id="api-docs-title">API 文档</h1>
              <span>Mock 版</span>
            </div>
            <p>
              通过 MiniCoze 公开 API 调用已发布的 Agent。本文档介绍 API Key
              的使用方式、同步调用、流式调用及 TypeScript SDK 的基本用法。
            </p>
          </header>

          <DocSection section={API_DOC_SECTIONS[0]}>
            <p>
              准备好 API Key 和已发布 Agent 的标识后，可以使用 curl 或
              TypeScript SDK 发起首次请求。示例契约尚未最终确认。
            </p>
            <ol className="api-doc-steps">
              <li>
                <span>01</span>
                准备 API Key，并仅通过安全的服务端配置提供。
              </li>
              <li>
                <span>02</span>
                确认已发布 Agent 的标识。本期文档不提供 Agent ID 查询入口。
              </li>
              <li>
                <span>03</span>
                选择 curl 或 TypeScript SDK 示例，查看首次 Run 调用。
              </li>
            </ol>

            <div className="api-doc-tabs" role="tablist" aria-label="快速开始示例">
              {QUICK_START_SAMPLES.map((sample) => (
                <button
                  type="button"
                  role="tab"
                  id={`quick-start-tab-${sample.id}`}
                  aria-selected={sample.id === selectedSample.id}
                  aria-controls="quick-start-code"
                  key={sample.id}
                  onClick={() => setQuickStartSample(sample.id)}
                >
                  {sample.label}
                </button>
              ))}
            </div>
            <div
              id="quick-start-code"
              role="tabpanel"
              aria-labelledby={`quick-start-tab-${selectedSample.id}`}
            >
              <CodeBlock
                key={selectedSample.id}
                sample={selectedSample}
                onNotice={handleNotice}
              />
            </div>
            <Callout>
              TypeScript 示例仅用于展示客户端初始化和 <code>client.run()</code>
              的基本形态；导入路径、字段和参数尚未作为正式 SDK 契约发布。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[1]}>
            <p>
              API Key 用于公开 API 的身份验证。请求时通过
              <code>Authorization: Bearer ${'{API_KEY}'}</code> 传递密钥。
            </p>
            <ul className="api-doc-list">
              <li>不要将真实 API Key 硬编码在公开前端代码、仓库或客户端可访问的环境中。</li>
              <li>生产环境应使用适合服务端的安全配置保存密钥。</li>
              <li>如果密钥泄露或不再使用，应及时在 API Keys 管理页面删除。</li>
            </ul>
            <Callout tone="warning">
              API Key 属于敏感凭据。文档、示例与日志中只应使用占位变量，不要记录真实值。
            </Callout>
            <AppLink className="api-doc-text-link" to={API_MANAGEMENT_ROUTE}>
              前往 API Keys 管理页面
              <span aria-hidden="true">→</span>
            </AppLink>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[2]}>
            <p>Run 用于发起一次请求并获取完整结果。</p>
            <div className="api-doc-endpoint">
              <span>POST</span>
              <code>{'${BASE_URL}/${RUN_PATH}'}</code>
            </div>
            <Callout>
              以下路径、请求字段、响应字段和错误结构均为 Mock 示例，不能视为已确认契约。
            </Callout>

            <h3>请求头</h3>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>请求头</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>Authorization</code></td>
                    <td><code>Bearer {'${API_KEY}'}</code></td>
                  </tr>
                  <tr>
                    <td><code>Content-Type</code></td>
                    <td><code>application/json</code></td>
                  </tr>
                  <tr>
                    <td><code>X-Trace-Id</code></td>
                    <td>用于请求追踪；具体要求待契约确认。</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3>请求参数</h3>
            <ParameterTable />
            <h3>请求示例</h3>
            <CodeBlock sample={RUN_REQUEST_SAMPLE} onNotice={handleNotice} />
            <h3>成功响应示例</h3>
            <CodeBlock sample={RUN_RESPONSE_SAMPLE} onNotice={handleNotice} />
            <h3>常见错误响应示例</h3>
            <CodeBlock sample={RUN_ERROR_SAMPLE} onNotice={handleNotice} />
            <Callout>
              响应字段、状态值与错误分类均为 Mock。联调前请等待正式接口契约。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[3]}>
            <p>
              Stream 用于通过 SSE 建立长连接，逐步获取 Agent 的执行过程和结果。
            </p>
            <div className="api-doc-endpoint">
              <span>POST</span>
              <code>{'${BASE_URL}/${STREAM_PATH}'}</code>
              <small>Accept: text/event-stream</small>
            </div>

            <h3>curl 调试示例</h3>
            <CodeBlock sample={STREAM_REQUEST_SAMPLE} onNotice={handleNotice} />
            <h3>TypeScript SDK 流式调用</h3>
            <CodeBlock sample={STREAM_SDK_SAMPLE} onNotice={handleNotice} />

            <h3>SSE 事件说明</h3>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>事件</th>
                    <th>用途</th>
                  </tr>
                </thead>
                <tbody>
                  {SSE_EVENTS.map((event) => (
                    <tr key={event.name}>
                      <td><code>{event.name}</code></td>
                      <td>{event.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Callout tone="warning">
              <strong>结束与中断：</strong>
              并非每次调用都会出现工具调用或引用事件。<code>done</code>
              表示本次流式调用结束，不应作为普通文本增量处理；连接中断时不能视为调用成功。
              具体事件字段、数据格式和出现条件以后端正式契约为准。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[4]}>
            <p>
              SDK 的安装方式、包名和类型定义仍在规划中。以下内容仅用于说明未来基本调用方式，
              不代表某个 npm 包已经发布。
            </p>
            <h3>安装方式占位</h3>
            <CodeBlock sample={SDK_INSTALL_SAMPLE} onNotice={handleNotice} />
            <h3>客户端初始化</h3>
            <CodeBlock sample={SDK_INIT_SAMPLE} onNotice={handleNotice} />
            <h3>
              <code>client.run()</code>
            </h3>
            <CodeBlock
              sample={QUICK_START_SAMPLES.find((sample) => sample.id === 'typescript')!}
              onNotice={handleNotice}
            />
            <h3>
              <code>client.stream()</code>
            </h3>
            <CodeBlock sample={STREAM_SDK_SAMPLE} onNotice={handleNotice} />
            <h3>基本类型说明</h3>
            <ParameterTable rows={SDK_TYPES} />
            <h3>基本错误处理</h3>
            <CodeBlock sample={SDK_ERROR_SAMPLE} onNotice={handleNotice} />
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[5]}>
            <p>
              以下参考信息用于文档结构展示，接口、字段和错误码均需等待正式契约确认。
            </p>
            <h3>接口概览</h3>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>接口</th>
                    <th>方法</th>
                    <th>路径</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((endpoint) => (
                    <tr key={endpoint.name}>
                      <td>{endpoint.name}</td>
                      <td><code>{endpoint.method}</code></td>
                      <td><code>{endpoint.path}</code></td>
                      <td>{endpoint.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>请求参数</h3>
            <ParameterTable />
            <h3>成功响应</h3>
            <CodeBlock sample={RUN_RESPONSE_SAMPLE} onNotice={handleNotice} />
            <h3>错误响应</h3>
            <CodeBlock sample={RUN_ERROR_SAMPLE} onNotice={handleNotice} />
            <h3>HTTP 状态码</h3>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>状态码</th>
                    <th>含义</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {HTTP_STATUSES.map((item) => (
                    <tr key={item.status}>
                      <td><code>{item.status}</code></td>
                      <td>{item.meaning}</td>
                      <td>{item.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Callout>
              业务错误码尚未确认。当前 <code>MOCK_ERROR</code> 仅为响应示例占位。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[6]}>
            <div className="api-doc-faq">
              {FAQ_ITEMS.map((item) => (
                <article key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </DocSection>
        </article>

        <aside className="api-doc-toc">
          <p>本页目录</p>
          <nav aria-label="API 文档目录">
            {API_DOC_SECTIONS.map((section, index) => (
              <a
                className={activeSection === section.id ? 'is-active' : ''}
                href={`#${section.id}`}
                key={section.id}
                aria-current={activeSection === section.id ? 'location' : undefined}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {section.label}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </section>
  );
}

function DocSection({ section, children }: { section: DocSection; children: ReactNode }) {
  const titleId = `${section.id}-title`;

  return (
    <section className="api-doc-section" id={section.id} aria-labelledby={titleId}>
      <h2 id={titleId}>{section.label}</h2>
      {children}
    </section>
  );
}

function ParameterTable({ rows = REQUEST_PARAMETERS }: { rows?: typeof REQUEST_PARAMETERS }) {
  return (
    <div className="api-doc-table-wrap">
      <table className="api-doc-table">
        <thead>
          <tr>
            <th>字段</th>
            <th>类型</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td><code>{row.name}</code></td>
              <td><code>{row.type}</code></td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div className={`api-doc-callout api-doc-callout--${tone}`}>
      <strong>{tone === 'warning' ? '注意' : 'Mock 提示'}</strong>
      <div>{children}</div>
    </div>
  );
}

function useActiveSection() {
  const [activeSection, setActiveSection] = useState(API_DOC_SECTIONS[0].id);

  useEffect(() => {
    let animationFrame = 0;

    const updateActiveSection = () => {
      animationFrame = 0;
      const pageBottom = window.scrollY + window.innerHeight
        >= document.documentElement.scrollHeight - 8;

      if (pageBottom) {
        setActiveSection(API_DOC_SECTIONS[API_DOC_SECTIONS.length - 1].id);
        return;
      }

      let current = API_DOC_SECTIONS[0].id;

      for (const section of API_DOC_SECTIONS) {
        const element = document.getElementById(section.id);

        if (element && element.getBoundingClientRect().top <= 130) {
          current = section.id;
        }
      }

      setActiveSection(current);
    };

    const scheduleUpdate = () => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(updateActiveSection);
      }
    };

    updateActiveSection();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  return activeSection;
}
