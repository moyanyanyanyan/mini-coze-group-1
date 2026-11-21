#!/usr/bin/env node
/**
 * 内部排查脚本：对指定模型配置发起最小连通性请求。
 * 不进前端，Key 只在后端解密并随请求发往 Python，不会打印。
 *
 * 用法：
 *   node scripts/test-model-connection.mjs <modelConfigId>
 * 环境变量：
 *   BACKEND_URL（默认 http://localhost:3000）
 *   INTERNAL_SERVICE_TOKEN（后端启用内部凭证时必填）
 */
const configId = process.argv[2];
if (!configId) {
  console.error('用法：node scripts/test-model-connection.mjs <modelConfigId>');
  process.exit(1);
}

const backendUrl = (process.env.BACKEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const token = (process.env.INTERNAL_SERVICE_TOKEN ?? '').trim();

const response = await fetch(`${backendUrl}/api/internal/model-configs/${configId}/test`, {
  method: 'POST',
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

const body = await response.json().catch(() => null);
if (!response.ok) {
  console.error(`测试请求失败：HTTP ${response.status}`, body ?? '');
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
process.exit(body.ok ? 0 : 2);
