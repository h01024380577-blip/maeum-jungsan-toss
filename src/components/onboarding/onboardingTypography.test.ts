import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Onboarding tour typography', () => {
  it('uses one consistent title weight without synthetic bolding', () => {
    const source = readFileSync(new URL('../Onboarding.tsx', import.meta.url), 'utf8');

    expect(source).toContain('text-[15px] font-extrabold leading-snug tracking-normal [font-synthesis-weight:none]');
    expect(source).not.toContain('text-[15px] font-black leading-snug');
    expect(source).not.toMatch(/tour\.step\s*===\s*2[\s\S]*font-/);
  });

  it('keeps target emphasis static while users read the tour copy', () => {
    const source = readFileSync(new URL('../Onboarding.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('animate-ping');
    expect(source).not.toContain('animate-pulse');
  });
});
