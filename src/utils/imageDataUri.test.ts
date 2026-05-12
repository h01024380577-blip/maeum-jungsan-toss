import { describe, expect, it } from 'vitest';
import { normalizeImageDataUri } from './imageDataUri';

describe('normalizeImageDataUri', () => {
  it('keeps existing image data URIs unchanged', () => {
    expect(normalizeImageDataUri('data:image/png;base64,abc123')).toBe('data:image/png;base64,abc123');
  });

  it('normalizes Apps-in-Toss dataUri base64 payloads', () => {
    expect(normalizeImageDataUri({ dataUri: 'abc123' })).toBe('data:image/jpeg;base64,abc123');
  });

  it('falls back to base64 when dataUri is empty', () => {
    expect(normalizeImageDataUri({ dataUri: '  ', base64: 'fallback123' })).toBe('data:image/jpeg;base64,fallback123');
  });

  it('compacts whitespace in raw base64 payloads', () => {
    expect(normalizeImageDataUri(' ab c\n123 ')).toBe('data:image/jpeg;base64,abc123');
  });

  it('returns null for empty image results', () => {
    expect(normalizeImageDataUri(null)).toBeNull();
    expect(normalizeImageDataUri({})).toBeNull();
    expect(normalizeImageDataUri('')).toBeNull();
  });
});
