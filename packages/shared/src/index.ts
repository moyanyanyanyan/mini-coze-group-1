export interface HealthResponse {
  status: 'ok';
  service: 'backend' | 'agent';
}

export * from './workflow';
