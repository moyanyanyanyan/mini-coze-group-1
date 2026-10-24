import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WorkflowAgentClient } from '../../integrations/workflow-agent.client';
import { HttpExceptionFilter } from '../../common/http-exception.filter';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowsRepository } from './workflows.repository';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// HTTP tests use the real controller, DTO pipe, service and exception filter.
describe('Workflow HTTP contract', () => {
  let app: INestApplication;
  let base: string;
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
    list: jest.fn(async () => ({ items: [row], total: 1, page: 1, size: 10 })),
    startRun: jest.fn(async (_data: unknown) => ({ id: 'run' })),
    finishRun: jest.fn(async () => ({})),
  };
  const agent = { validate: jest.fn(), run: jest.fn() };
  const definition = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../..',
        'docs/workflows/example.workflow.json',
      ),
      'utf8',
    ),
  );
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${base}/api/workflows${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
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
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'WORKFLOW_DEV_MODE' ? 'true' : 'test',
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
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
  it('creates, saves an invalid draft without stripping UI fields and loads it', async () => {
    const draft = { ...definition, edges: [] };
    expect(
      (await request('/wf/draft', 'PUT', { definition: draft })).status,
    ).toBe(200);
    expect((await request('/wf')).body.draftDefinition).toEqual(draft);
    expect(agent.validate).not.toHaveBeenCalled();
  });
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
  it('archives and hides archived detail', async () => {
    expect((await request('/wf', 'DELETE')).status).toBe(204);
    expect((await request('/wf')).status).toBe(404);
  });
});
