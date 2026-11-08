import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { UsersService } from '../users/users.service';
import { WorkflowAgentClient } from '../../integrations/workflow-agent.client';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowsRepository } from './workflows.repository';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 使用真实 JWT 策略、控制器、DTO、业务服务及异常过滤器。
describe('Workflow HTTP contract', () => {
  let app: INestApplication;
  let base: string;
  const jwt = new JwtService({ secret: 'workflow-test-secret' });
  const token = (id: string) =>
    jwt.sign({ sub: id, email: `${id}@example.com` });
  let row: Record<string, unknown>;
  const repository = {
    create: jest.fn(
      async (data) =>
        (row = { id: 'wf', draftDefinition: null, status: 'DRAFT', ...data }),
    ),
    find: jest.fn(async () => row),
    update: jest.fn(
      async (_id, data) => (row = { ...row, ...data, updatedAt: 'now' }),
    ),
    list: jest.fn(async (where) => {
      const items =
        row.creatorId === where.creatorId &&
        row.workspaceId === where.workspaceId
          ? [row]
          : [];
      return { items, total: items.length, page: 1, size: 10 };
    }),
    startRun: jest.fn(async (_data: unknown) => ({ id: 'run' })),
    finishRun: jest.fn(async () => ({})),
    listRuns: jest.fn(async (_id: string, page: number, size: number) => ({
      items: [
        {
          id: 'run',
          status: 'RUNNING',
          input: { query: 'hi' },
          output: null,
          nodeResults: null,
          error: null,
          startedAt: 'then',
          endedAt: null,
        },
      ],
      total: 1,
      page,
      size,
    })),
  };
  const agent = { validate: jest.fn(), run: jest.fn() };
  const loadExample = (file: string) =>
    JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../..', 'docs/workflows', file),
        'utf8',
      ),
    );
  const definition = loadExample('example.workflow.json');
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    identity: string | null = 'alice',
    cookie = false,
  ) {
    const response = await fetch(`${base}/api/workflows${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(identity
          ? cookie
            ? { Cookie: `access_token=${token(identity)}` }
            : { Authorization: `Bearer ${token(identity)}` }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        WorkflowsService,
        { provide: WorkflowsRepository, useValue: repository },
        { provide: WorkflowAgentClient, useValue: agent },
        JwtStrategy,
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(async (id: string) => ({ id })),
            toCurrentUser: (user: { id: string }) => user,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => 'workflow-test-secret',
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    agent.validate.mockResolvedValue({ valid: true, errors: [] });
    await request('', 'POST', { name: '测试' });
  });
  it('requires authentication and supports the login cookie', async () => {
    expect((await request('', 'GET', undefined, null)).status).toBe(401);
    expect(
      (await request('', 'POST', { name: 'anonymous' }, null)).status,
    ).toBe(401);
    expect((await request('', 'GET', undefined, 'alice', true)).status).toBe(
      200,
    );
  });
  it('uses the current user for ownership and scopes the list', async () => {
    expect(row).toMatchObject({ creatorId: 'alice', workspaceId: 'alice' });
    expect((await request('', 'GET', undefined, 'bob')).body.items).toEqual([]);
    expect(repository.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ creatorId: 'bob', workspaceId: 'bob' }),
      1,
      10,
    );
    expect(
      (
        await request(
          '',
          'POST',
          { name: 'foreign', workspaceId: 'alice' },
          'bob',
        )
      ).status,
    ).toBe(400);
    expect(
      (await request('', 'POST', { name: 'mine' }, 'bob')).body,
    ).toMatchObject({ creatorId: 'bob', workspaceId: 'bob' });
    expect((await request('', 'GET', undefined, 'alice')).body.items).toEqual(
      [],
    );
  });
  it.each([
    ['/wf', 'GET', undefined],
    ['/wf', 'PATCH', { name: 'changed' }],
    ['/wf', 'DELETE', undefined],
    ['/wf/draft', 'PUT', { definition }],
    ['/wf/validate', 'POST', {}],
    ['/wf/run', 'POST', { input: {} }],
    ['/wf/runs', 'GET', undefined],
  ])('rejects another user at %s %s', async (path, method, body) => {
    expect(
      (await request(path as string, method as string, body, 'bob')).status,
    ).toBe(404);
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(repository.listRuns).not.toHaveBeenCalled();
    expect(agent.validate).not.toHaveBeenCalled();
    expect(agent.run).not.toHaveBeenCalled();
  });
  it('does not expose legacy shared workflows', async () => {
    row.creatorId = 'workflow-dev-user';
    row.workspaceId = 'workflow-dev-workspace';
    expect((await request('/wf')).status).toBe(404);
    expect((await request('')).body.items).toEqual([]);
  });
  it('creates, saves an invalid draft without stripping UI fields and loads it', async () => {
    const draft = { ...definition, edges: [] };
    expect(
      (await request('/wf/draft', 'PUT', { definition: draft })).status,
    ).toBe(200);
    expect((await request('/wf')).body.draftDefinition).toEqual(draft);
    expect(agent.validate).not.toHaveBeenCalled();
  });
  it.each(['condition', 'loop'])(
    'saves and loads a %s draft with nested data unchanged',
    async (name) => {
      const draft = loadExample(`example.${name}.workflow.json`);
      expect(
        (await request('/wf/draft', 'PUT', { definition: draft })).status,
      ).toBe(200);
      expect((await request('/wf')).body.draftDefinition).toEqual(draft);
      // 列表 nodeCount 计入循环体节点：loop 样例为 4 个顶层 + 1 个 body。
      expect((await request('')).body.items[0].nodeCount).toBe(
        name === 'loop' ? 5 : 7,
      );
    },
  );
  it('validates pagination and malformed draft shapes', async () => {
    expect((await request('?size=51')).status).toBe(400);
    expect(
      (await request('/wf/draft', 'PUT', { definition: { nodes: [] } })).status,
    ).toBe(400);
  });
  it('preserves structured validation errors', async () => {
    const errors = [
      {
        code: 'INVALID_REFERENCE',
        nodeId: 'node-llm-1',
        field: 'data.userPromptTemplate',
        message: 'bad reference',
      },
    ];
    agent.validate.mockResolvedValue({ valid: false, errors });
    expect((await request('/wf/validate', 'POST', {})).body).toEqual({
      valid: false,
      errors,
    });
    const result = await request('/wf/run', 'POST', { input: {} });
    expect(result.status).toBe(422);
    expect(result.body.details).toEqual(errors);
    expect(repository.startRun).not.toHaveBeenCalled();
  });
  it('rejects missing inputs before creating a run', async () => {
    agent.validate.mockResolvedValue({
      valid: false,
      errors: [{ code: 'INVALID_INPUT' }],
    });
    expect((await request('/wf/run', 'POST', { input: {} })).status).toBe(400);
    expect(repository.startRun).not.toHaveBeenCalled();
  });
  it('persists snapshot and terminal success', async () => {
    await request('/wf/draft', 'PUT', { definition });
    agent.run.mockResolvedValue({
      status: 'SUCCEEDED',
      output: { result: 'hi' },
      nodeResults: [],
      error: null,
    });
    const result = await request('/wf/run', 'POST', { input: { query: 'hi' } });
    expect(result.status).toBe(200);
    expect(result.body.runId).toBe('run');
    expect(repository.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'alice' }),
    );
    expect(
      (repository.startRun.mock.calls[0][0] as { definition: unknown })
        .definition,
    ).toEqual(definition);
    expect(repository.finishRun).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({
        status: 'SUCCEEDED',
        endedAt: expect.any(Date),
      }),
    );
  });
  it('closes RUNNING records when Python is unavailable', async () => {
    agent.run.mockRejectedValue(new Error('secret'));
    const result = await request('/wf/run', 'POST', { input: {} });
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('FAILED');
    expect(JSON.stringify(result.body)).not.toContain('secret');
    expect(repository.finishRun).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
  it('lists run history with runId and paging', async () => {
    const result = await request('/wf/runs?page=2&size=5');
    expect(result.status).toBe(200);
    expect(repository.listRuns).toHaveBeenCalledWith('wf', 2, 5);
    expect(result.body).toEqual({
      items: [
        {
          runId: 'run',
          status: 'RUNNING',
          input: { query: 'hi' },
          output: null,
          nodeResults: [],
          error: null,
          startedAt: 'then',
          endedAt: null,
        },
      ],
      total: 1,
      page: 2,
      size: 5,
    });
    expect((await request('/wf/runs?size=51')).status).toBe(400);
  });
  it('archives and hides archived detail', async () => {
    expect((await request('/wf', 'DELETE')).status).toBe(204);
    expect((await request('/wf')).status).toBe(404);
    expect((await request('/wf/runs')).status).toBe(404);
  });
});
