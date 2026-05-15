type BackHandler = () => boolean | void;

const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);

  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function consumeBackHandler(): boolean {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (handlers[index]() !== false) return true;
  }
  return false;
}

export function resetBackHandlersForTest(): void {
  handlers.length = 0;
}
