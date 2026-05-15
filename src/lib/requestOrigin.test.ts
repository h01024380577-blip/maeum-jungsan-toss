import { afterEach, describe, expect, it } from 'vitest';
import { getRequestOrigin } from './requestOrigin';

describe('getRequestOrigin', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('prefers APP_URL when configured', () => {
    process.env = { ...originalEnv, APP_URL: 'https://app.maeum-jungsan.com/' };

    const origin = getRequestOrigin({
      headers: new Headers({
        host: 'ignored.example',
        'x-forwarded-proto': 'https',
      }),
      nextUrlOrigin: 'https://request.example',
    });

    expect(origin).toBe('https://app.maeum-jungsan.com');
  });

  it('builds an origin from forwarded host and proto', () => {
    process.env = { ...originalEnv, APP_URL: '' };

    const origin = getRequestOrigin({
      headers: new Headers({
        'x-forwarded-host': 'maeum.example',
        'x-forwarded-proto': 'https',
        host: 'internal:3000',
      }),
      nextUrlOrigin: 'http://internal:3000',
    });

    expect(origin).toBe('https://maeum.example');
  });

  it('falls back to the request origin instead of localhost', () => {
    process.env = { ...originalEnv, APP_URL: '' };

    const origin = getRequestOrigin({
      headers: new Headers(),
      nextUrlOrigin: 'https://maeum-jungsan.test',
    });

    expect(origin).toBe('https://maeum-jungsan.test');
  });
});
