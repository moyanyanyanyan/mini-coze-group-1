import 'reflect-metadata';
import { validateEnvironment } from './env.validation';

const required = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-secret-with-at-least-32-characters',
};

describe('validateEnvironment', () => {
  it('preserves internal authentication and OAuth configuration together', () => {
    const config = {
      ...required,
      INTERNAL_SERVICE_TOKEN: 'test-internal-token',
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
      AUTH_GOOGLE_MOCK: 'false',
    };
    expect(validateEnvironment(config)).toMatchObject(config);
  });

  it('allows empty OAuth settings and an unconfigured Runtime', () => {
    expect(validateEnvironment({
      ...required,
      GOOGLE_CALLBACK_URL: '',
      AUTH_GOOGLE_MOCK: '',
    })).toMatchObject({
      INTERNAL_SERVICE_TOKEN: '',
    });
  });

  it.each([
    { GOOGLE_CALLBACK_URL: 'http://invalid host/callback' },
    { AUTH_GOOGLE_MOCK: 'invalid' },
  ])('rejects invalid OAuth settings: %j', (config) => {
    expect(() => validateEnvironment({ ...required, ...config })).toThrow();
  });
});
