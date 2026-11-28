// 使用业务接口生成展台数据；少量边界状态直接入库并明确标记，保留清单便于核对。
const { createRequire } = require('node:module');
const { createHmac, randomUUID } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const req = createRequire(resolve('apps/backend/package.json'));
const { PrismaClient } = req('@prisma/client');
const prisma = new PrismaClient();
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const ownerId = argument('owner');
const manifestPath = argument('manifest');
assert(ownerId && manifestPath, '必须显式指定 --owner=<用户 ID> 和 --manifest=<清单绝对路径>');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  ownerId, batch: 'operations-showcase-20261128-v1', createdAt: new Date().toISOString(),
  bases: [], documents: [], agents: [], conversations: [], workflows: [], keys: [], calls: {}, steps: {},
};
assert.equal(manifest.ownerId, ownerId, '清单所属账号不匹配');
const save = () => writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));
const origin = argument('origin') ?? 'http://localhost:3000';
let jwt;

async function request(path, method = 'GET', data, token = jwt) {
  const response = await fetch(origin + '/api' + path, {
    method, headers: { Authorization: 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(190_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${result.message ?? ''}`);
  return Object.hasOwn(result, 'code') ? result.data : result;
}

async function parallel(items, action, concurrency = 2) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) await action(items[cursor++]);
  }));
}

const themes = [
  { key: '提瓦特', name: '提瓦特冒险档案', role: '原神二创与冒险规划助手',
    topics: ['蒙德图书馆与风的留言', '璃月港的委托看板', '须弥学者的知识索引', '枫丹蒸汽机械维修日记'],
    questions: ['设计一份以蒙德图书馆为起点的原创委托，给出目标和奖励设想。', '把这份委托拆成三步，说明每步需要收集什么线索。', '为阿蕾奇诺写一段克制的原创对白，不引用游戏原文。'],
    text: '这是一份原创原神二创演示资料，不代表游戏官方设定或当前版本数值。旅行者接到一份修复图书索引的委托，需要先在蒙德图书馆登记，再前往璃月港寻找纸张记录，最后把调查笔记交给须弥学者。每个步骤要写清任务目标、线索来源、行动顺序与复盘问题。阿蕾奇诺相关对白应保持克制，避免照搬官方台词。' },
  { key: 'AI编程', name: 'AI 编程实验室', role: 'AI 编程与 Agent 工程导师',
    topics: ['RAG 检索与引用链路', 'Agent 工具调用设计', 'TypeScript API 错误处理', 'Python 异步任务与取消'],
    questions: ['用 TypeScript 写一个最小的 fetch 包装，保留 HTTP 状态和错误正文，代码不要超过 20 行。', '解释 RAG 中候选片段和最终引用的区别，给一个 AI 编程知识库例子。', 'Python asyncio 取消任务时如何清理资源？给一个短例子。'],
    text: 'AI 编程实验记录：RAG 先把问题向量化，再取得候选片段，只有最终回答实际采用的片段才算引用。工具参数需要 JSON Schema 校验，错误结果应保留错误码和可读信息。TypeScript 请求包装必须保留 HTTP 状态，不能把失败响应伪装为空数组。Python asyncio 的取消是正常控制流，应在 finally 中清理资源。模型实际 Token 用量与字符估算必须分别显示。' },
  { key: '计算机', name: '计算机学习笔记', role: '计算机基础与代码评审助手',
    topics: ['数据库事务与索引', '操作系统线程与进程', 'HTTP 流式响应与重试', '二分查找与边界测试'],
    questions: ['用璃月港仓库记账打比方，解释数据库事务的原子性和隔离性。', '检查二分查找容易出现的边界错误，列出五个测试输入。', '说明 SSE 和普通 JSON 响应在错误处理上的区别。'],
    text: '计算机学习笔记：数据库索引需要结合查询条件和排序设计。事务的目标是保持业务数据一致，不能依赖前端多次提交来完成原子操作。SSE 需要明确的成功或失败终态，连接关闭不能自动视为成功。二分查找应检查空数组、单元素、重复值、目标不存在和边界命中。代码评审先关注正确性、权限、错误处理，再讨论命名与性能。' },
  { key: '小说', name: '小说创作与红楼札记', role: '原创小说构思与阅读笔记助手',
    topics: ['红楼梦人物关系阅读札记', '赛博璃月短篇大纲', '阿蕾奇诺同人写作边界', 'AI 程序员的凌晨机房'],
    questions: ['构思一篇“AI 程序员误入提瓦特”的原创短篇，列出三幕结构。', '写一段凌晨机房的原创开场，约 120 字，包含一个悬念。', '给红楼梦阅读笔记设计一个人物关系表，不引用大段原文。'],
    text: '原创小说工作坊：故事《凌晨三点的机房》讲述一名 AI 程序员发现日志中的异常请求，沿着调用链进入一个名为赛博璃月的虚构空间。第一幕建立日常和异常，第二幕通过错误线索制造冲突，第三幕回收伏笔并让主角承担选择的代价。红楼梦阅读札记应区分人物原文行为、读者推断与同人设想；本资料只提供原创写作提纲，不摘录小说长段落。' },
];

async function base(theme) {
  const name = `【展台】${theme.name}`;
  let row = await prisma.knowledgeBase.findFirst({ where: { workspaceId: ownerId, name } });
  if (!row) row = await request('/knowledge-bases', 'POST', { workspaceId: ownerId, name, description: theme.text });
  if (!manifest.bases.some(item => item.id === row.id)) manifest.bases.push({ id: row.id, name, theme: theme.key });
  save(); return row;
}

async function upload(baseId, name, bytes, mime = 'application/octet-stream') {
  const found = manifest.documents.find(item => item.baseId === baseId && item.name === name);
  if (found) return found;
  const data = new FormData(); data.set('workspaceId', ownerId);
  data.set('file', new Blob([bytes], { type: mime }), name);
  const response = await fetch(origin + `/api/knowledge-bases/${baseId}/documents/files`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: data, signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  assert(response.ok, `上传 ${name}: ${response.status} ${result.message}`);
  const row = { id: result.data.id, baseId, name }; manifest.documents.push(row); save(); return row;
}

async function officeFile(kind, text) {
  const JSZip = req('jszip'); const zip = new JSZip();
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  if (kind === 'docx') {
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split('\n').map(line => `<w:p><w:r><w:t>${escape(line)}</w:t></w:r></w:p>`).join('')}<w:sectPr/></w:body></w:document>`);
  } else {
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
    zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
    zip.file('ppt/_rels/presentation.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
    zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="主题提纲"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escape(text)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

function pdfFile() {
  const body = 'BT /F1 18 Tf 50 740 Td (Genshin x AI Coding - Original Showcase) Tj 0 -28 Td (Trace logs, retrieval, tools and workflow notes.) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${body.length} >>\nstream\n${body}\nendstream`];
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const position = Buffer.byteLength(output);
  output += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${position}\n%%EOF`;
  return Buffer.from(output);
}

async function knowledge() {
  if (manifest.steps.knowledge) return;
  for (const theme of themes) {
    const kb = await base(theme);
    await upload(kb.id, `${theme.key}入门手册.txt`, Buffer.from((theme.text + '\n\n').repeat(7)), 'text/plain');
    await upload(kb.id, `${theme.key}专题索引.md`, Buffer.from(`# ${theme.name}\n\n${theme.topics.map((topic, i) => `## ${topic}\n\n${theme.text}\n\n- 实验编号：${i + 1}\n- 复盘：记录线索、证据与下一步。`).join('\n\n')}`), 'text/markdown');
    await upload(kb.id, `${theme.key}结构化资料.json`, Buffer.from(JSON.stringify({ title: theme.name, note: theme.text, chapters: theme.topics.map((name, i) => ({ name, order: i + 1, objective: '形成可追溯的学习或创作记录' })) })), 'application/json');
    await upload(kb.id, `${theme.key}阅读卡片.html`, Buffer.from(`<main><h1>${theme.name}</h1><p>${theme.text}</p><h2>学习目录</h2><ul>${theme.topics.map(topic => `<li>${topic}</li>`).join('')}</ul></main>`), 'text/html');
    await upload(kb.id, `${theme.key}任务表.csv`, Buffer.from(`主题,任务,优先级,状态\n${theme.topics.map((topic, i) => `${theme.key},${topic},${i % 2 ? '中' : '高'},${i % 2 ? '进行中' : '待整理'}`).join('\n')}`), 'text/csv');
  }
  const aiBase = manifest.bases.find(item => item.theme === 'AI编程');
  const ExcelJS = req('exceljs'); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('AI代码评审');
  sheet.addRows([['模块', '检查项', '优先级'], ['API', '保留失败状态与错误正文', '高'], ['RAG', '区分候选片段和实际引用', '高'], ['任务', '取消时清理资源', '中'], ['小说', '区分原文证据和创作设想', '中']]);
  await upload(aiBase.id, 'AI代码评审清单.xlsx', await workbook.xlsx.writeBuffer());
  await upload(aiBase.id, 'AI与提瓦特演讲提纲.pptx', await officeFile('pptx', themes[1].text));
  await upload(aiBase.id, 'AI编程项目设计说明.docx', await officeFile('docx', themes[1].topics.join('\n') + '\n' + themes[1].text));
  await upload(aiBase.id, 'Genshin-AI-Coding.pdf', pdfFile(), 'application/pdf');
  await upload(aiBase.id, '原神插画OCR空白样本.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'), 'image/png');
  await upload(aiBase.id, '损坏PDF解析失败样本.pdf', Buffer.from('这是用于验证失败状态的损坏 PDF，不包含有效 PDF 文件头。'), 'application/pdf');
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const rows = await prisma.knowledgeDocument.findMany({ where: { id: { in: manifest.documents.map(item => item.id) } }, select: { id: true, status: true, sourceType: true, errorCode: true } });
    if (rows.every(row => row.status !== 'PROCESSING')) { manifest.documentResults = rows; break; }
    await wait(1000);
  }
  for (const kb of manifest.bases) {
    const theme = themes.find(item => item.key === kb.theme);
    for (const query of [theme.topics[0], theme.text.slice(0, 70), '如何记录证据、线索与下一步行动？']) {
      await request(`/knowledge-bases/${kb.id}/retrieval-preview`, 'POST', { workspaceId: ownerId, query });
    }
  }
  for (const [name, status] of [['【展台】待整理的轻小说灵感箱', 'ACTIVE'], ['【展台】已停用的旧版代码笔记', 'DISABLED']]) {
    let row = await prisma.knowledgeBase.findFirst({ where: { workspaceId: ownerId, name } });
    if (!row) row = await request('/knowledge-bases', 'POST', { workspaceId: ownerId, name, description: '用于查看空库和停用状态。' });
    if (status === 'DISABLED') await request(`/knowledge-bases/${row.id}/status`, 'PATCH', { workspaceId: ownerId, status });
    if (!manifest.bases.some(item => item.id === row.id)) manifest.bases.push({ id: row.id, name, theme: '状态展示' });
  }
  const broken = manifest.documents.find(item => item.name === '损坏PDF解析失败样本.pdf');
  await request(`/documents/${broken.id}/retry`, 'POST', { workspaceId: ownerId });
  manifest.steps.knowledge = true; save(); console.log(`知识库：${manifest.bases.length} 个，文件：${manifest.documents.length} 个，真实检索测试已执行`);
}

async function agents(modelConfigId) {
  for (const theme of themes) {
    const name = `【展台】${theme.role}`;
    let row = await prisma.agent.findFirst({ where: { ownerId, name } });
    if (!row) row = await request('/agents', 'POST', { name, systemPrompt: `你是${theme.role}。用中文回答，控制在 150 字或 20 行代码以内。涉及原神时只讨论原创设想，不冒充最新官方数值。若用户明确要求使用工具，按要求调用 echo_text 或 current_time。`, modelConfigId, temperature: 0.5, maxTokens: 400, contextLimit: 5 });
    const kb = manifest.bases.find(item => item.theme === theme.key);
    await request(`/agents/${row.id}/knowledge-bases`, 'PUT', { bindings: [{ knowledgeBaseId: kb.id, enabled: true }] });
    await request(`/agents/${row.id}/plugins`, 'PUT', { bindings: [{ pluginId: 'plugin_echo', enabled: true }, { pluginId: 'plugin_time', enabled: true }] });
    await request(`/agents/${row.id}`, 'PATCH', { status: 'ACTIVE' });
    if (!manifest.agents.some(item => item.id === row.id)) manifest.agents.push({ id: row.id, name, theme: theme.key });
    save();
  }
}

async function conversation(agent, title) {
  let row = manifest.conversations.find(item => item.title === title);
  if (row) return row;
  const created = await request('/conversations', 'POST', { agentId: agent.id });
  await request(`/conversations/${created.id}`, 'PATCH', { title });
  row = { id: created.id, agentId: agent.id, title }; manifest.conversations.push(row); save(); return row;
}

async function stream(conv, content, cancel = false, token = jwt, api = false) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 180_000);
  let runId, terminal, buffer = '';
  try {
    const response = await fetch(origin + (api ? '/api/v1/stream' : `/api/conversations/${conv.id}/messages/stream`), {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: api ? content : undefined, content: api ? undefined : content, ...(api ? { conversationId: conv.id } : {}) }), signal: controller.signal,
    });
    assert(response.ok, `聊天 HTTP ${response.status}`);
    for await (const chunk of response.body) {
      buffer += new TextDecoder().decode(chunk, { stream: true });
      let separator;
      while ((separator = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, separator); buffer = buffer.slice(separator + 2);
        const data = frame.split('\n').find(line => line.startsWith('data:'));
        if (!data) continue;
        const event = JSON.parse(data.slice(5).trim()); runId = event.runId ?? runId;
        if (event.type === 'run.completed' || event.type === 'run.failed') terminal = event.type;
        if (cancel && event.type === 'message.delta') { controller.abort(); return { runId, terminal: 'cancelled' }; }
      }
    }
    assert(terminal, '流式响应没有终态'); return { runId, terminal };
  } catch (error) {
    if (cancel && controller.signal.aborted) return { runId, terminal: 'cancelled' };
    throw error;
  } finally { clearTimeout(timer); }
}

async function chats() {
  const tasks = manifest.agents.flatMap(agent => [0, 1, 2].map(index => ({ agent, index })));
  await parallel(tasks, async ({ agent, index }) => {
    const theme = themes.find(item => item.key === agent.theme);
    const conv = await conversation(agent, `【展台·真实运行】${theme.topics[index]}`);
    for (const [turn, question] of [theme.questions[index], index === 0 ? '请先调用 echo_text，内容为“提瓦特 × AI 代码实验记录”，再用一句话总结上面的答案。' : '再补充一个可操作的例子，并指出一个容易忽略的边界条件。'].entries()) {
      const key = `${conv.id}:${turn}`;
      if (manifest.calls[key]) continue;
      const result = await stream(conv, question); manifest.calls[key] = result; save();
      console.log(`真实聊天：${agent.theme} ${index + 1} / 第 ${turn + 1} 轮 ${result.terminal}`);
    }
  });
  manifest.steps.chats = true; save();
}

async function integrations() {
  if (manifest.steps.integrations) return;
  for (const [index, agent] of manifest.agents.entries()) {
    const key = await request(`/agents/${agent.id}/api-keys`, 'POST', { name: `【展台】${agent.theme} API 调用` });
    manifest.keys.push({ id: key.apiKey.id, agentId: agent.id, name: key.apiKey.name }); save();
    const mixed = manifest.conversations.find(item => item.agentId === agent.id && item.title.includes('真实运行'));
    const result = await request('/v1/run', 'POST', { message: `请用三点总结${themes[index].name}，每点不超过 25 字。`, conversationId: mixed.id }, key.secret);
    manifest.calls[`api:${agent.id}`] = { runId: result.runId, terminal: result.status };
    for (let i = 0; i < 5; i++) {
      const response = await fetch(origin + '/api/v1/run', { method: 'POST', headers: { Authorization: 'Bearer ' + key.secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '', showcase: '输入校验失败，不调用模型' }) });
      assert.equal(response.status, 400);
    }
    if (index === 0) {
      const conv = await conversation(agent, '【展台·真实取消】派蒙的未完成委托');
      manifest.calls.cancelled = await stream(conv, '写一份详细的原创提瓦特冒险长篇大纲，按十章展开。', true, key.secret, true);
    }
    if (index % 2) {
      await request(`/api-keys/${key.apiKey.id}`, 'DELETE');
      const response = await fetch(origin + '/api/v1/run', { method: 'POST', headers: { Authorization: 'Bearer ' + key.secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '撤销 Key 的真实鉴权测试，不调用模型。' }) });
      assert.equal(response.status, 401);
    }
    const runId = result.runId;
    for (let n = 0; n < 8; n++) {
      const toolName = n % 2 ? 'current_time' : 'echo_text';
      const args = toolName === 'echo_text' ? { text: `${themes[index].topics[n % 4]}：记录测试线索与代码评审结果 #${n + 1}` } : { timezone: n === 7 ? 'Teyvat/Invalid-Zone' : 'Asia/Shanghai' };
      const response = await fetch(origin + '/api/tools/execute', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Plugin-Service-Token': process.env.PLUGINS_SERVICE_TOKEN }, body: JSON.stringify({ actorId: ownerId, agentId: agent.id, runId: randomUUID(), toolCallId: randomUUID(), toolName, arguments: args }) });
      assert.equal(response.status, 200, '真实插件执行入口不可用');
      const payload = await response.json(); assert(['succeeded', 'failed'].includes(payload.data.status));
    }
    save();
  }
  manifest.steps.integrations = true; save(); console.log('真实 API 成功、400、401、取消和插件成功/失败记录已生成');
}

async function workflows() {
  if (manifest.steps.workflows) return;
  for (const theme of themes) {
    const name = `【展台】${theme.key}资料整理流水线`;
    let workflow = await prisma.workflow.findFirst({ where: { creatorId: ownerId, name } });
    if (!workflow) workflow = await request('/workflows', 'POST', { workspaceId: ownerId, name, description: '实际执行的输入整理与输出工作流，节点结果由执行器保存。' });
    const definition = { version: '1.0', nodes: [
      { id: 'node-start-1', type: 'start', position: { x: 0, y: 0 }, data: { label: '资料输入', inputs: [{ name: 'query', type: 'string', required: true }] } },
      { id: 'node-end-1', type: 'end', position: { x: 300, y: 0 }, data: { outputs: [{ name: 'result', type: 'string', valueFrom: 'node-start-1.query' }] } },
    ], edges: [{ id: 'edge-1', source: 'node-start-1', target: 'node-end-1' }] };
    await request(`/workflows/${workflow.id}/draft`, 'PUT', { definition });
    if (!manifest.workflows.some(item => item.id === workflow.id)) manifest.workflows.push({ id: workflow.id, name });
    for (const topic of theme.topics) {
      const result = await request(`/workflows/${workflow.id}/run`, 'POST', { input: { query: `${topic}\n\n${theme.text}` } });
      assert.equal(result.status, 'SUCCEEDED');
    }
    save();
  }
  const failure = await request('/workflows', 'POST', { workspaceId: ownerId, name: '【展台·真实运行】AI 小说生成节点诊断', description: '通过实际 LLM 节点查看成功或服务错误；不伪造执行终态。' });
  const definition = JSON.parse(readFileSync(resolve('docs/workflows/example.workflow.json'), 'utf8'));
  definition.nodes.find(node => node.type === 'llm').data.maxTokens = 100;
  await request(`/workflows/${failure.id}/draft`, 'PUT', { definition });
  const result = await request(`/workflows/${failure.id}/run`, 'POST', { input: { query: '为 AI 程序员穿越到提瓦特写一句原创小说开场。' } });
  manifest.workflows.push({ id: failure.id, name: '【展台·真实运行】AI 小说生成节点诊断', status: result.status });
  manifest.steps.workflows = true; save(); console.log('真实工作流：16 次资料整理 + 1 次 LLM 节点执行');
}

async function boundarySamples() {
  if (manifest.steps.boundaries) return;
  const agent = manifest.agents[0];
  const statuses = ['completed', 'warning', 'failed', 'cancelled', 'interrupted'];
  for (let day = 0; day < 12; day++) {
    const title = `【数据库展示样本】提瓦特代码日志·第${day + 1}册（非实际执行）`;
    const conv = await conversation(agent, title);
    if (await prisma.operationRuntimeRun.count({ where: { conversationId: conv.id } })) continue;
    const messages = []; const runs = [];
    for (let turn = 0; turn < 5; turn++) {
      const status = statuses[(day + turn) % statuses.length];
      const runtimeStatus = status === 'warning' ? 'completed' : status;
      const startedAt = new Date(Date.now() - day * 86_400_000 - (5 - turn) * 540_000);
      const finishedAt = new Date(startedAt.getTime() + 2400 + turn * 520);
      const assistantId = randomUUID(); const runId = randomUUID();
      const content = `【数据库展示样本，未调用模型】${themes[day % 4].topics[turn % 4]}：请整理线索、函数边界与阅读笔记。`;
      const answer = runtimeStatus === 'completed' ? '【数据库展示样本，非模型回复】先明确输入和目标，再追踪证据与调用链，最后记录测试结果。此记录用于检查页面排版，不含真实 Token 计费。' : status === 'cancelled' ? '【数据库展示样本】回答生成中途取消，保留这段示意文本。' : status === 'interrupted' ? '【数据库展示样本】连接中断，缺少服务端终态。' : '【数据库展示样本】模拟模型服务错误，用于查看异常面板。';
      messages.push({ id: randomUUID(), conversationId: conv.id, role: 'user', status: 'completed', seq: turn * 2 + 1, content, createdAt: startedAt }, { id: assistantId, conversationId: conv.id, role: 'assistant', status: status === 'interrupted' ? 'running' : runtimeStatus, seq: turn * 2 + 2, content: answer, createdAt: finishedAt });
      const event = (type, data) => ({ type, observedAt: startedAt.toISOString(), data });
      runs.push({ id: runId, userId: ownerId, agentId: agent.id, conversationId: conv.id, assistantMessageId: assistantId, model: '数据库展示样本（未调用模型）', mode: 'stream', source: 'unknown', status: runtimeStatus, startedAt, finishedAt, durationMs: finishedAt - startedAt, firstTokenMs: null, inputTokens: null, outputTokens: null, totalTokens: null, errorCode: runtimeStatus === 'completed' ? null : 'SHOWCASE_' + status.toUpperCase(), events: [event('showcase.provenance', { kind: 'database_sample', actualExecution: false, batch: manifest.batch }), event('runtime.stage', { stageId: 'sample-context', kind: 'context', status: 'completed', startedAt: startedAt.toISOString(), durationMs: 120 }), event('runtime.stage', { stageId: 'sample-model', kind: 'model', status: runtimeStatus === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'interrupted', startedAt: startedAt.toISOString(), durationMs: 2000, model: '数据库展示样本（未调用模型）', round: 1 }), ...(status === 'warning' ? [event('tool.completed', { toolCallId: 'sample-tool', toolName: '【数据库展示样本】工具异常后继续回答', status: 'failed', error: { code: 'SHOWCASE_TOOL_ERROR', message: '非实际执行的异常展示样本' }, durationMs: 400 })] : [])] });
    }
    await prisma.$transaction([prisma.message.createMany({ data: messages }), prisma.operationRuntimeRun.createMany({ data: runs }), prisma.conversation.update({ where: { id: conv.id }, data: { createdAt: runs[0].startedAt, updatedAt: runs.at(-1).finishedAt } })]);
  }
  const sampleBase = manifest.bases.find(item => item.theme === '提瓦特');
  await prisma.operationTelemetry.create({ data: { ownerId, knowledgeBaseId: sampleBase.id, kind: 'retrieval', status: 'FAILED', durationMs: 1200, itemCount: 0, data: { query: '【数据库展示样本，非实际执行】提瓦特档案检索超时', source: 'preview', hits: [], provenance: 'database_sample' } } });
  manifest.steps.boundaries = true; save(); console.log('数据库展示样本：60 条执行状态 / 120 条消息；均标明非实际执行，Token 留空');
}

async function audit() {
  const paths = ['/operations/overview', '/operations/agents?pageSize=100', '/operations/knowledge-bases?pageSize=100', '/operations/runtime/stats', '/operations/runtime/runs?pageSize=100', '/operations/resources', '/operations/integrations/activity?pageSize=100'];
  const results = {};
  for (const path of paths) results[path] = await request(path);
  for (const kb of manifest.bases) {
    await request(`/operations/knowledge-bases/${kb.id}/documents?pageSize=100`);
    await request(`/operations/knowledge-bases/${kb.id}/activity?pageSize=100`);
  }
  for (const doc of manifest.documents) {
    const row = await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { status: true, sourceBytes: true } });
    const download = await fetch(origin + `/api/documents/${doc.id}/file?workspaceId=${ownerId}`, { headers: { Authorization: 'Bearer ' + jwt } });
    assert(download.ok, '原文件下载失败：' + doc.name);
    assert(Buffer.from(await download.arrayBuffer()).equals(Buffer.from(row.sourceBytes)), '原文件下载内容不一致：' + doc.name);
    if (row.status === 'READY') await request(`/knowledge-bases/${doc.baseId}/documents/${doc.id}/chunks?workspaceId=${ownerId}`);
    await request(`/operations/knowledge-bases/${doc.baseId}/documents/${doc.id}/text`);
    await request(`/operations/knowledge-bases/${doc.baseId}/documents/${doc.id}/attempts?pageSize=100`);
  }
  const denied = await fetch(origin + '/api/operations/runtime/stats');
  assert.equal(denied.status, 401, '运行管理接口必须登录');
  const actualConversation = manifest.conversations.find(item => item.title.includes('真实运行'));
  await request(`/operations/agents/${actualConversation.agentId}/conversations?pageSize=100`);
  await request(`/operations/conversations/${actualConversation.id}/messages?pageSize=100`);
  const memory = await request(`/conversations/${actualConversation.id}/memory`);
  const actualRuns = await prisma.operationRuntimeRun.findMany({ where: { conversationId: { in: manifest.conversations.filter(item => !item.title.includes('数据库展示样本')).map(item => item.id) } }, select: { id: true, status: true, totalTokens: true, source: true } });
  for (const run of actualRuns) await request(`/operations/runtime/runs/${run.id}`);
  const integration = results['/operations/integrations/activity?pageSize=100'];
  assert(integration.requests.total > 0 && integration.tools.total > 0 && integration.workflows.total > 0, '集成列表仍为空');
  assert(actualRuns.some(run => run.status === 'completed' && run.totalTokens > 0), '没有真实模型用量');
  const actualToolCalls = await prisma.operationTelemetry.count({ where: { ownerId, kind: 'tool', agentId: { in: manifest.agents.map(item => item.id) }, startedAt: { gte: new Date(manifest.createdAt) } } });
  const seededWorkflowRuns = await prisma.workflowRun.count({ where: { userId: ownerId, workflowId: { in: manifest.workflows.map(item => item.id) } } });
  const documents = await prisma.knowledgeDocument.findMany({ where: { id: { in: manifest.documents.map(item => item.id) } }, select: { sourceType: true, status: true, errorCode: true, chunkCount: true } });
  const summary = { ownerId, createdAt: manifest.createdAt, auditedAt: new Date().toISOString(), agents: manifest.agents.length, bases: manifest.bases.length, documents: documents.length, documentTypes: [...new Set(documents.map(item => item.sourceType))], documentStates: documents.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }), {}), chunks: documents.reduce((sum, item) => sum + item.chunkCount, 0), conversations: manifest.conversations.length, actualRuns: actualRuns.length, actualRunStates: actualRuns.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }), {}), actualTokens: actualRuns.reduce((sum, run) => sum + (run.totalTokens ?? 0), 0), databaseSampleRuns: 60, apiRequests: integration.requests.total, pluginCalls: integration.tools.total, actualToolCalls, databaseSampleToolCalls: 12, addedWorkflowRuns: seededWorkflowRuns, workflowRuns: integration.workflows.total, memoryRemainingTokens: memory.remainingTokens, checkedCoreEndpoints: paths.length, statistics: results['/operations/runtime/stats'] };
  manifest.summary = summary; save(); console.log(JSON.stringify(summary, null, 2)); return summary;
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { id: true, email: true, displayName: true } });
  const model = await prisma.modelConfig.findFirstOrThrow({ where: { ownerId, enabled: true, type: 'CHAT' }, select: { id: true } });
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 7200 })).toString('base64url');
  jwt = header + '.' + payload + '.' + createHmac('sha256', process.env.JWT_SECRET).update(header + '.' + payload).digest('base64url');
  console.log(`生成账号：${user.displayName}；批次：${manifest.batch}`);
  if (!manifest.finished) {
    await knowledge(); await agents(model.id); await chats(); await integrations(); await workflows(); await boundarySamples();
    manifest.finished = true; save();
  }
  await audit();
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
