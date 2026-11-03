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
              <span>非流式 MVP</span>
            </div>
            <p>
              通过 MiniCoze 公开 API 调用 API Key 绑定的已发布 Agent。
              当前已完成非流式 Run 与 TypeScript SDK 客户端，鉴权和流式接口仍在接入中。
            </p>
          </header>

          <DocSection section={API_DOC_SECTIONS[0]}>
            <p>
              使用 curl 或 TypeScript SDK 调用非流式 Run。请求不需要传
              agentId，目标 Agent 将由未来正式接入的 API Key 绑定关系确定。
            </p>
            <ol className="api-doc-steps">
              <li>
                <span>01</span>
                准备 baseURL 和 API Key，并仅在服务端安全配置中使用。
              </li>
              <li>
                <span>02</span>
                确认目标 Agent 已经发布。API Key 正式鉴权仍在接入中。
              </li>
              <li>
                <span>03</span>
                选择 curl 或 TypeScript SDK 示例，发起首次非流式 Run。
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
              TypeScript 示例对应当前 <code>@minicoze/sdk</code> 的
              <code>client.run()</code>；该包仍为仓库内 private package。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[1]}>
            <p>
              正式鉴权计划通过
              <code>Authorization: Bearer ${'{API_KEY}'}</code> 传递密钥。
              当前公开 Run 仍使用开发/测试环境临时 Agent 配置，尚未启用 API Key Guard。
            </p>
            <ul className="api-doc-list">
              <li>不要将真实 API Key 硬编码在公开前端代码、仓库或客户端可访问的环境中。</li>
              <li>生产环境应使用适合服务端的安全配置保存密钥。</li>
              <li>如果密钥泄露或不再使用，应及时在 API Keys 管理页面删除。</li>
            </ul>
            <Callout tone="warning">
              API Key 属于敏感凭据。文档、示例与日志中只应使用占位变量。
              正式鉴权错误语义和撤销 Key 行为待鉴权模块确认。
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
              <code>/api/v1/run</code>
            </div>
            <Callout>
              当前非流式 Run 已实现。请求体仅包含 message 和可选 conversationId。
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
                    <td><code>Bearer {'${API_KEY}'}</code>；正式鉴权待接入</td>
                  </tr>
                  <tr>
                    <td><code>Content-Type</code></td>
                    <td><code>application/json</code></td>
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
              成功响应使用 <code>{'{ code, message, data }'}</code> 信封，
              错误响应的数字 code 与 HTTP 状态码一致。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[3]}>
            <Callout tone="warning">
              Stream API 尚未实现。以下仅保留章节结构，不代表已有公开契约。
            </Callout>
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
            {SSE_EVENTS.length > 0 ? (
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
            ) : (
              <p>公开 SSE 事件名称、字段、结束标识和异常语义均待确认。</p>
            )}
            <Callout tone="warning">
              <strong>结束与中断：</strong>
              Stream 尚未接入，不能将本节示例视为可执行接口。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[4]}>
            <p>
              <code>@minicoze/sdk</code> 当前是仓库内 private package，
              已实现非流式 Run，尚未发布 npm，也尚未实现 Stream。
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
              以下内容对应当前非流式 Run 实现。鉴权和 Stream 相关部分仍待确认。
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
              当前 HTTP 响应中的 <code>code</code> 是数字 HTTP 状态码。
              正式 API Key 鉴权错误的字符串业务码尚未接入。
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
