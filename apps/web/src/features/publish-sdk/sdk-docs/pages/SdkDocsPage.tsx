import { useEffect, useState, type ReactNode } from 'react';
import { AppLink } from '../../../../shared/routing/AppLink';
import { useNotice, type NoticeType } from '../../../../shared/hooks/use-notice';
import { NoticeToast } from '../../../../shared/ui/NoticeToast';
import {
  API_DOC_SECTIONS,
  ENDPOINTS,
  ENV_SAMPLE,
  EXAMPLE_CLIENT_SAMPLE,
  EXAMPLE_COMMANDS_SAMPLE,
  EXAMPLE_PACKAGE_SAMPLE,
  EXAMPLE_RUN_SAMPLE,
  EXAMPLE_STREAM_SAMPLE,
  EXAMPLE_TREE_SAMPLE,
  FAQ_ITEMS,
  FIRST_RUN_SAMPLE,
  HTTP_STATUSES,
  QUICK_START_SAMPLES,
  REQUEST_PARAMETERS,
  RUNTIME_ERRORS,
  RUN_ERROR_SAMPLE,
  RUN_REQUEST_SAMPLE,
  RUN_RESPONSE_SAMPLE,
  SDK_ERROR_SAMPLE,
  SDK_EXPORTS,
  SDK_INIT_SAMPLE,
  SDK_INSTALL_FALLBACK_SAMPLE,
  SDK_INSTALL_SAMPLE,
  SDK_TYPES,
  SSE_EVENTS,
  STREAM_FAILED_EVENT_SAMPLE,
  STREAM_REQUEST_SAMPLE,
  STREAM_RESPONSE_SAMPLE,
  STREAM_SDK_SAMPLE,
  TOOL_EVENTS_SAMPLE,
  type DocSection,
} from '../data/api-docs.data';
import { CodeBlock } from '../components/CodeBlock';
import { API_MANAGEMENT_ROUTE } from '../../api-management/router/routes';
import '../styles/api-docs.css';

const SDK_ERROR_ROWS = [
  { name: 'MiniCozeHTTPError', when: '服务端返回非 2xx', detail: 'httpStatus、errorCode、traceId' },
  { name: 'MiniCozeNetworkError', when: '无法建立连接或连接中断', detail: 'message、cause' },
  { name: 'MiniCozeTimeoutError', when: '超过 timeoutMs 未完成', detail: 'timeoutMs' },
  { name: 'MiniCozeAbortError', when: '调用方通过 AbortSignal 取消', detail: 'cause 为取消原因' },
  { name: 'MiniCozeResponseParseError', when: '返回体不是合法 JSON 或结构不符', detail: 'message、cause' },
  { name: 'MiniCozeStreamError', when: '流式事件不符合协议或缺少终态', detail: 'message、cause' },
] as const;

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
              <span>SDK v0.1.0</span>
            </div>
            <p>
              用一把 API Key 调用你发布在 MiniCoze 上的 Agent：一次性拿到完整回答，
              或者逐字接收流式输出。按本页「快速开始」六步走完，你就能跑通第一次调用。
            </p>
            <div className="api-doc-hero-facts" aria-label="API 核心信息">
              <div>
                <span>Base URL</span>
                <code>{'{BASE_URL}'}</code>
              </div>
              <div>
                <span>鉴权</span>
                <strong>Bearer API Key</strong>
              </div>
              <div>
                <span>接口</span>
                <strong>/api/v1/run · /api/v1/stream</strong>
              </div>
              <div>
                <span>SDK</span>
                <strong>@minicoze/sdk</strong>
              </div>
            </div>
          </header>

          <nav className="api-doc-endpoint-overview" aria-label="API 接口速览">
            <a href="#run-sync">
              <div className="api-doc-endpoint-overview__meta">
                <span className="api-doc-method">POST</span>
                <span>JSON</span>
              </div>
              <code>/api/v1/run</code>
              <p>普通调用，等待 Agent 完成后一次性返回完整结果。</p>
              <span className="api-doc-card-link">查看教程 <span aria-hidden="true">→</span></span>
            </a>
            <a href="#stream">
              <div className="api-doc-endpoint-overview__meta">
                <span className="api-doc-method">POST</span>
                <span>SSE</span>
              </div>
              <code>/api/v1/stream</code>
              <p>流式调用，实时接收文本、工具及终态事件。</p>
              <span className="api-doc-card-link">查看教程 <span aria-hidden="true">→</span></span>
            </a>
          </nav>

          <DocSection section={API_DOC_SECTIONS[0]}>
            <p>
              整个流程只有一件事要记住：<strong>API Key 绑定一个已发布的 Agent</strong>，
              调用时不需要传 agentId。下面六步按顺序做即可。
            </p>
            <ol className="api-doc-steps">
              <li><span>01</span>安装 SDK</li>
              <li><span>02</span>发布 Agent 并创建 API Key</li>
              <li><span>03</span>把 Key 放进环境变量</li>
              <li><span>04</span>初始化 MiniCozeClient</li>
              <li><span>05</span>调用 client.run() 拿到回答</li>
              <li><span>06</span>补上异常处理</li>
            </ol>

            <div className="api-doc-step">
              <h3><span className="api-doc-step-index">1</span>安装 SDK</h3>
              <p>在 Node.js 项目里安装 TypeScript SDK（要求 Node 18+，推荐 20+）。</p>
              <CodeBlock sample={SDK_INSTALL_SAMPLE} onNotice={handleNotice} />
              <Callout>
                当前版本 <code>0.1.0</code> 还没有发布到公共 npm registry。
                如果 <code>npm install @minicoze/sdk</code> 拉不到包，先用 Release 里的 tarball 安装，
                安装后的包名和 import 路径完全相同。
              </Callout>
              <CodeBlock sample={SDK_INSTALL_FALLBACK_SAMPLE} onNotice={handleNotice} />
            </div>

            <div className="api-doc-step">
              <h3><span className="api-doc-step-index">2</span>创建 API Key</h3>
              <p>
                API Key 是调用公开 API 的长期凭据，一把 Key 只绑定一个 Agent：
                调用 <code>run()</code> / <code>stream()</code> 时，后端通过 Key 反查出 Agent 和所属用户，
                请求体里传什么都改不了目标。
              </p>
              <ol className="api-doc-list">
                <li>先把 Agent 发布（草稿和归档状态的 Agent 调用会返回 403）。</li>
                <li>进入「发布 / API Keys」页面，点击创建，选择要绑定的 Agent 并起个名字。</li>
                <li>
                  创建成功的弹窗里会显示完整 Key（形如 <code>mk_live_...</code>），
                  <strong>请立即复制并保存</strong>——弹窗关闭后只能看到掩码，无法再次查看。
                </li>
              </ol>
              <Callout tone="warning">
                Key 只应保存在服务端环境变量或密钥管理服务中，不要写进代码、提交到 Git，
                也不要放在浏览器前端。泄露后请到同一页面删除并重建。
              </Callout>
              <AppLink className="api-doc-text-link" to={API_MANAGEMENT_ROUTE}>
                前往 API Keys 管理页面
                <span aria-hidden="true">→</span>
              </AppLink>
            </div>

            <div className="api-doc-step">
              <h3><span className="api-doc-step-index">3</span>配置 API Key</h3>
              <p>
                用环境变量保存地址和 Key。示例项目通过 <code>.env</code> + Node 的
                <code>--env-file</code> 读取，生产环境换成平台提供的密钥配置即可。
              </p>
              <CodeBlock sample={ENV_SAMPLE} onNotice={handleNotice} />
              <p>
                把 <code>.env</code> 加入 <code>.gitignore</code>；仓库里只保留
                <code>.env.example</code> 这种占位文件。
              </p>
            </div>

            <div className="api-doc-step">
              <h3><span className="api-doc-step-index">4</span>初始化客户端</h3>
              <CodeBlock sample={SDK_INIT_SAMPLE} onNotice={handleNotice} />
              <ul className="api-doc-list">
                <li><code>baseURL</code>：MiniCoze 服务地址，必填，必须是 http 或 https。</li>
                <li><code>apiKey</code>：必填，构造时会校验非空。</li>
                <li><code>timeoutMs</code>：可选，默认 30000ms；<code>run()</code> / <code>stream()</code> 各自的默认整轮超时是 190000ms。</li>
              </ul>
            </div>

            <div className="api-doc-step">
              <h3><span className="api-doc-step-index">5</span>发起第一次调用</h3>
              <CodeBlock sample={FIRST_RUN_SAMPLE} onNotice={handleNotice} />
              <h4>请求参数</h4>
              <ParameterTable />
              <h4>返回结果</h4>
              <ul className="api-doc-list">
                <li><code>content</code>：Agent 的完整回答，最常用。</li>
                <li><code>conversationId</code>：本次会话 ID，下次想续聊时传回去。</li>
                <li><code>runId</code> / <code>assistantMessageId</code>：排查问题时的定位 ID。</li>
                <li><code>usage</code>：token 用量，可能为 <code>null</code>；<code>citations</code>、<code>toolResults</code>：知识库引用和工具结果，没有时是空数组。</li>
              </ul>
              <p>
                SDK 已经帮你拆开 <code>{'{ code, message, data }'}</code> 信封并校验了字段，
                所以 <code>run()</code> 直接返回 <code>RunResult</code>。
              </p>
            </div>

            <div className="api-doc-step">
              <h3><span className="api-doc-step-index">6</span>处理异常</h3>
              <p>
                网络失败、超时、取消、HTTP 错误和协议异常是不同情况，按类型分别处理，
                不要一律当成同一种失败。
              </p>
              <CodeBlock sample={SDK_ERROR_SAMPLE} onNotice={handleNotice} />
              <p>
                更多错误类说明见本页最后的「错误与常见问题」。
              </p>
            </div>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[1]}>
            <p>
              同一个能力有两种接入方式，选一个就行：
            </p>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>你的情况</th>
                    <th>推荐方式</th>
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>使用 JavaScript / TypeScript</td>
                    <td><strong>TypeScript SDK</strong></td>
                    <td>类型完整、自动处理 SSE 与错误分类，代码最少。</td>
                  </tr>
                  <tr>
                    <td>使用 Python、Go、Java 等其他语言</td>
                    <td>REST API</td>
                    <td>普通 HTTP + Bearer 鉴权；Stream 只多一个 SSE 解析。</td>
                  </tr>
                  <tr>
                    <td>希望自己控制 HTTP 客户端或已有网关</td>
                    <td>REST API</td>
                    <td>SDK 只封装了 fetch 这一层，直接用 curl 即可做同样的事。</td>
                  </tr>
                  <tr>
                    <td>需要边生成边展示给用户</td>
                    <td><code>stream()</code> / SSE</td>
                    <td>逐事件返回，首字延迟更低。</td>
                  </tr>
                  <tr>
                    <td>只要最终结果</td>
                    <td><code>run()</code></td>
                    <td>一次请求拿到完整回答，处理最简单。</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3>同一件事，两种写法</h3>
            <div className="api-doc-tabs" role="tablist" aria-label="调用方式示例">
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
              SDK 是首选接入方式；REST 示例使用同样的路径、请求体和鉴权头，
              可以对照着移植到其他语言。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[2]}>
            <p>
              <strong>适用场景：</strong>后台任务、批量处理、只需要最终回答的场景。
              等待整轮生成结束后一次返回，不需要处理事件流。
            </p>

            <h3>TypeScript SDK</h3>
            <CodeBlock sample={QUICK_START_SAMPLES[0]} onNotice={handleNotice} />

            <h3>请求参数</h3>
            <ParameterTable />

            <h3>返回结果</h3>
            <CodeBlock sample={RUN_RESPONSE_SAMPLE} onNotice={handleNotice} />
            <p>
              SDK 返回的 <code>RunResult</code> 就是响应中的 <code>data</code>，
              读取 <code>result.content</code> 即可拿到回答；要续聊就把
              <code>result.conversationId</code> 传回下一次调用。
            </p>

            <h3>异常处理</h3>
            <CodeBlock sample={SDK_ERROR_SAMPLE} onNotice={handleNotice} />
            <p>
              HTTP 错误返回 <code>{'{ code, message, data: null }'}</code>，
              其中 <code>code</code> 是数字状态码；SDK 会把它包装成
              <code>MiniCozeHTTPError</code>，保留 <code>httpStatus</code> 与
              <code>errorCode</code>。
            </p>
            <CodeBlock sample={RUN_ERROR_SAMPLE} onNotice={handleNotice} />

            <h3>REST 调用（curl）</h3>
            <CodeBlock sample={RUN_REQUEST_SAMPLE} onNotice={handleNotice} />
            <p>
              请求体只包含 <code>message</code> 和可选的 <code>conversationId</code>；
              不要传 <code>agentId</code>，目标 Agent 由 API Key 决定。
            </p>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[3]}>
            <p>
              <strong>适用场景：</strong>聊天界面、需要边生成边展示、或要感知工具调用过程的场景。
              Stream 返回 <code>POST /api/v1/stream</code> 上的 SSE 事件流。
            </p>

            <h3>TypeScript SDK</h3>
            <CodeBlock sample={STREAM_SDK_SAMPLE} onNotice={handleNotice} />
            <ul className="api-doc-list">
              <li><code>client.stream()</code> 返回 <code>AsyncIterable&lt;RunStreamEvent&gt;</code>，用 <code>for await</code> 消费。</li>
              <li>把 <code>message.delta</code> 的 <code>content</code> 依次拼接，就是最终回答。</li>
              <li>SDK 校验 <code>seq</code> 连续、首个事件必须是 <code>run.started</code>，并保证一定以终态结束或抛错。</li>
            </ul>

            <h3>事件说明</h3>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>事件</th>
                    <th>用途</th>
                    <th>data 字段</th>
                  </tr>
                </thead>
                <tbody>
                  {SSE_EVENTS.map((event) => (
                    <tr
                      className={`api-doc-event-row${event.name === 'run.completed' ? ' is-success' : ''}${event.name === 'run.failed' ? ' is-error' : ''}`}
                      key={event.name}
                    >
                      <td>
                        <div className="api-doc-event-name">
                          <code>{event.name}</code>
                          {event.name === 'run.completed' && <span>成功终态</span>}
                          {event.name === 'run.failed' && <span>失败终态</span>}
                        </div>
                      </td>
                      <td>{event.description}</td>
                      <td><code>{event.data}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>原始 SSE 响应</h3>
            <CodeBlock sample={STREAM_RESPONSE_SAMPLE} onNotice={handleNotice} />
            <p>
              <code>id</code> 格式为 <code>{'{runId}:{seq}'}</code>，<code>seq</code> 从 1 连续递增；
              以 <code>:</code> 开头的是注释心跳（每 15 秒一次），不属于业务事件，也不提供断点续传。
            </p>

            <h3>正常结束与异常中断</h3>
            <ul className="api-doc-list">
              <li>正常流必须且只能收到一个 <code>run.completed</code> 或 <code>run.failed</code>。</li>
              <li>服务端在流建立后出错，会补发 <code>run.failed</code>，此时 HTTP 状态可能仍是 200。</li>
              <li>缺少终态的 EOF 不能当成成功，SDK 会抛 <code>MiniCozeStreamError</code>。</li>
              <li>主动结束请调用 <code>controller.abort()</code>，SDK 会抛 <code>MiniCozeAbortError</code> 并释放连接。</li>
              <li>默认整轮超时 190000ms，可用 <code>{'stream(params, { timeoutMs })'}</code> 覆盖。</li>
            </ul>
            <CodeBlock sample={STREAM_FAILED_EVENT_SAMPLE} onNotice={handleNotice} />

            <h3>工具事件</h3>
            <p>
              <code>tool.completed.status=failed</code> 只代表该次工具调用失败，
              不结束 Stream，也不会触发终态。
            </p>
            <CodeBlock sample={TOOL_EVENTS_SAMPLE} onNotice={handleNotice} />

            <h3>REST 调用（curl）</h3>
            <CodeBlock sample={STREAM_REQUEST_SAMPLE} onNotice={handleNotice} />
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[4]}>
            <p>
              一个可以直接跑起来的最小项目：只用 Node + SDK，不引入框架。
              要求 Node 20+（用到 <code>--env-file</code> 和顶层 await）。
            </p>
            <h3>项目结构</h3>
            <CodeBlock sample={EXAMPLE_TREE_SAMPLE} onNotice={handleNotice} />
            <h3>package.json</h3>
            <CodeBlock sample={EXAMPLE_PACKAGE_SAMPLE} onNotice={handleNotice} />
            <h3>.env</h3>
            <CodeBlock sample={ENV_SAMPLE} onNotice={handleNotice} />
            <h3>src/client.ts</h3>
            <CodeBlock sample={EXAMPLE_CLIENT_SAMPLE} onNotice={handleNotice} />
            <h3>src/run.ts</h3>
            <CodeBlock sample={EXAMPLE_RUN_SAMPLE} onNotice={handleNotice} />
            <h3>src/stream.ts</h3>
            <CodeBlock sample={EXAMPLE_STREAM_SAMPLE} onNotice={handleNotice} />
            <h3>运行</h3>
            <CodeBlock sample={EXAMPLE_COMMANDS_SAMPLE} onNotice={handleNotice} />
            <Callout>
              每次代码块右上角都可以直接复制。示例里的 Key 只从环境变量读取，
              换成你自己的 Key 和 Base URL 就能跑通。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[5]}>
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

            <h3>鉴权</h3>
            <div className="api-doc-auth-method">
              <span>Authorization</span>
              <code>{'Bearer <API_KEY>'}</code>
              <small>每个公开 Run / Stream 请求都必须携带</small>
            </div>

            <h3>请求参数</h3>
            <ParameterTable />

            <h3>成功响应</h3>
            <CodeBlock sample={RUN_RESPONSE_SAMPLE} onNotice={handleNotice} />

            <h3>错误响应</h3>
            <CodeBlock sample={RUN_ERROR_SAMPLE} onNotice={handleNotice} />

            <h3>SDK 导出内容</h3>
            <ParameterTable rows={SDK_EXPORTS} />

            <h3>SDK 类型</h3>
            <ParameterTable rows={SDK_TYPES} />

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
                      <td><code className={`api-doc-status-code ${statusTone(Number(item.status))}`}>{item.status}</code></td>
                      <td>{item.meaning}</td>
                      <td>{item.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Runtime 错误码映射</h3>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>Runtime code</th>
                    <th>HTTP 状态码</th>
                  </tr>
                </thead>
                <tbody>
                  {RUNTIME_ERRORS.map((item) => (
                    <tr key={item.code}>
                      <td><code className="api-doc-code-chip">{item.code}</code></td>
                      <td><code className={`api-doc-status-code ${statusTone(item.httpStatus)}`}>{item.httpStatus}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Callout>
              HTTP 响应里的 <code>code</code> 是数字状态码。Runtime 在 SSE 建立前失败会返回 JSON 错误；
              建立后失败则以 <code>run.failed</code> 事件结束。
            </Callout>
          </DocSection>

          <DocSection section={API_DOC_SECTIONS[6]}>
            <h3>SDK 错误类型</h3>
            <div className="api-doc-table-wrap">
              <table className="api-doc-table">
                <thead>
                  <tr>
                    <th>错误类</th>
                    <th>触发时机</th>
                    <th>附加字段</th>
                  </tr>
                </thead>
                <tbody>
                  {SDK_ERROR_ROWS.map((row) => (
                    <tr key={row.name}>
                      <td><code>{row.name}</code></td>
                      <td>{row.when}</td>
                      <td>{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              所有错误类都继承 <code>MiniCozeSDKError</code>，
              也可以用基类统一捕获；<code>error.cause</code> 保留底层错误对象。
            </p>

            <h3>常见问题</h3>
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

function ParameterTable({ rows = REQUEST_PARAMETERS }: { rows?: readonly { name: string; type: string; description: string }[] }) {
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
              <td>
                <div className="api-doc-param-name">
                  <code>{row.name}</code>
                  {rows === REQUEST_PARAMETERS && (
                    <span className={row.type.endsWith('?') ? 'is-optional' : 'is-required'}>
                      {row.type.endsWith('?') ? '可选' : '必填'}
                    </span>
                  )}
                </div>
              </td>
              <td><code>{row.type}</code></td>
              <td>{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusTone(status: number) {
  if (status >= 500) return 'is-error';
  if (status >= 400) return 'is-warning';
  return 'is-success';
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
      <strong>{tone === 'warning' ? '注意' : '说明'}</strong>
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
