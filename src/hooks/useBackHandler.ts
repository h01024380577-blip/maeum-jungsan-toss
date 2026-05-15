import { useLayoutEffect, useRef } from 'react';
import { registerBackHandler } from '@/src/lib/backHandlers';

export function useBackHandler(enabled: boolean, handler: () => boolean | void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useLayoutEffect(() => {
    if (!enabled) return;

    return registerBackHandler(() => handlerRef.current());
  }, [enabled]);
}
