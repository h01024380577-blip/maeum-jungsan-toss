import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeBackHandler,
  registerBackHandler,
  resetBackHandlersForTest,
} from './backHandlers';

describe('backHandlers', () => {
  afterEach(() => {
    resetBackHandlersForTest();
  });

  it('consumes the latest registered back handler first', () => {
    const first = vi.fn();
    const second = vi.fn();

    registerBackHandler(first);
    registerBackHandler(second);

    expect(consumeBackHandler()).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it('falls through when no handler is registered', () => {
    expect(consumeBackHandler()).toBe(false);
  });

  it('continues to older handlers when the latest handler does not consume', () => {
    const first = vi.fn();
    const second = vi.fn(() => false);

    registerBackHandler(first);
    registerBackHandler(second);

    expect(consumeBackHandler()).toBe(true);
    expect(second).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
  });

  it('unregisters handlers', () => {
    const handler = vi.fn();
    const unregister = registerBackHandler(handler);

    unregister();

    expect(consumeBackHandler()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns to the previous nested screen after the top handler unregisters', () => {
    const parent = vi.fn();
    const child = vi.fn();
    registerBackHandler(parent);
    const unregisterChild = registerBackHandler(child);

    expect(consumeBackHandler()).toBe(true);
    expect(child).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();

    unregisterChild();

    expect(consumeBackHandler()).toBe(true);
    expect(parent).toHaveBeenCalledOnce();
  });
});
