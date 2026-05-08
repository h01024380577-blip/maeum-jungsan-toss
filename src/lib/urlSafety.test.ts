import { beforeEach, describe, expect, it, vi } from 'vitest';
import dns from 'node:dns/promises';
import { assertSafePublicUrl, resolveSafeRedirectUrl } from './urlSafety';

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn(),
  },
}));

const mockLookup = vi.mocked(dns.lookup);

describe('urlSafety', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('accepts public https urls', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);

    await expect(assertSafePublicUrl('https://example.com/invite')).resolves.toBeInstanceOf(URL);
  });

  it('rejects unsupported protocols', async () => {
    await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toThrow('unsafe_url');
  });

  it('rejects localhost style hosts', async () => {
    await expect(assertSafePublicUrl('http://localhost:3000')).rejects.toThrow('unsafe_url');
  });

  it('rejects private ip literals', async () => {
    await expect(assertSafePublicUrl('http://127.0.0.1/admin')).rejects.toThrow('unsafe_url');
  });

  it('rejects hostnames that resolve to private networks', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }] as any);

    await expect(assertSafePublicUrl('https://internal.example.com')).rejects.toThrow('unsafe_url');
  });

  it('resolves and validates relative redirects', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any);

    await expect(resolveSafeRedirectUrl('https://example.com/a/b', '../invite')).resolves.toBe(
      'https://example.com/invite',
    );
  });
});
