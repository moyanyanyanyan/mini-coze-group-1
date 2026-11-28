import { ConfigService } from '@nestjs/config';
import { WorkflowAgentClient } from './workflow-agent.client';

afterEach(() => jest.restoreAllMocks());

it('执行时同时保留用户偏好快照和 Agent 的超时宽限', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    status: 'SUCCEEDED', output: { result: 'ok' }, nodeResults: [], error: null,
  }), { status: 200 }));
  const timeout = jest.spyOn(AbortSignal, 'timeout');
  const config = new ConfigService({ AGENT_SERVICE_URL: 'http://agent.test', WORKFLOW_RUN_TIMEOUT_SECONDS: 120 });
  const client = new WorkflowAgentClient(config);

  await client.run({ nodes: [] }, { query: '问题' }, { actorId: 'owner', globalPrompt: '请简短回答' });

  expect(timeout).toHaveBeenCalledWith(150_000);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('http://agent.test/internal/workflow/run');
  expect(JSON.parse(options!.body as string)).toEqual({
    definition: { nodes: [] }, input: { query: '问题' }, actor: { id: 'owner' }, globalPrompt: '请简短回答',
  });
});
