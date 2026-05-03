/**
 * In-memory global state to track nested modals.
 * - push when a modal opens
 * - pop when a modal closes
 * - the "active modal" is the last one in the stack
 */

export type ModalStackEntrySource =
  | 'react_native_modal'
  | 'react_navigation'
  | 'unknown';

export interface ModalStackEntry {
  id: string;
  stackKey: string;
  source: ModalStackEntrySource;
}

type ModalStackEntryInput =
  | string
  | {
      id: string;
      stackKey?: string;
      source?: ModalStackEntrySource;
    };

const modalStack: ModalStackEntry[] = [];

function normalizeModalStackEntry(
  entry: ModalStackEntryInput
): ModalStackEntry | null {
  if (typeof entry === 'string') {
    const id = entry.trim();
    if (id.length === 0) return null;
    return {
      id,
      stackKey: id,
      source: 'unknown',
    };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (id.length === 0) return null;

  const stackKey =
    typeof entry.stackKey === 'string' && entry.stackKey.trim().length > 0
      ? entry.stackKey.trim()
      : id;

  return {
    id,
    stackKey,
    source: entry.source ?? 'unknown',
  };
}

function maybeLogModalStack(action: string, modalId?: string | null): void {
  if ((globalThis as { __SIGNALFOX_DEBUG__?: boolean }).__SIGNALFOX_DEBUG__ !== true) {
    return;
  }

  // Snapshot del stack para que no cambie mientras se imprime.
  const stackSnapshot = modalStack.map((entry) => ({ ...entry }));
  console.log('[AUTO_ANALYTICS][modal_stack]', {
    action,
    modalId: typeof modalId === 'string' && modalId.length > 0 ? modalId : null,
    stack: stackSnapshot,
    active:
      stackSnapshot.length > 0 ? stackSnapshot[stackSnapshot.length - 1] : null,
  });
}

export function getActiveModalId(): string | null {
  if (modalStack.length === 0) return null;
  const last = modalStack[modalStack.length - 1];
  return typeof last?.id === 'string' && last.id.length > 0 ? last.id : null;
}

export function getActiveModalEntry(): ModalStackEntry | null {
  if (modalStack.length === 0) return null;
  return modalStack[modalStack.length - 1] ?? null;
}

export function getModalStackSnapshot(): ModalStackEntry[] {
  return modalStack.map((entry) => ({ ...entry }));
}

export function isModalInStack(stackKeyOrId?: string | null): boolean {
  if (typeof stackKeyOrId !== 'string' || stackKeyOrId.length === 0) {
    return false;
  }

  return modalStack.some(
    (entry) =>
      entry.stackKey === stackKeyOrId || entry.id === stackKeyOrId
  );
}

export function modalStackPush(entry: ModalStackEntryInput): string | null {
  const normalized = normalizeModalStackEntry(entry);
  if (!normalized) return getActiveModalId();

  const previousActiveModalId = getActiveModalId();
  modalStack.push(normalized);
  maybeLogModalStack('push', normalized.id);
  return previousActiveModalId;
}

export function modalStackPop(stackKeyOrId?: string | null): string | null {
  if (modalStack.length === 0) return null;

  if (typeof stackKeyOrId === 'string' && stackKeyOrId.length > 0) {
    let removed = false;
    for (let i = modalStack.length - 1; i >= 0; i--) {
      if (
        modalStack[i]?.stackKey === stackKeyOrId ||
        modalStack[i]?.id === stackKeyOrId
      ) {
        modalStack.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (!removed) {
      // Fallback: mantenemos el stack consistente aunque haya mismatch.
      modalStack.pop();
    }
  } else {
    // If we do not have an id, we cannot safely decide which modal was closed.
    // Mejor no modificar el stack que adjuntar un parent_modal incorrecto.
  }

  maybeLogModalStack('pop', stackKeyOrId);
  return getActiveModalId();
}

export function resetModalStack(): void {
  modalStack.splice(0, modalStack.length);
}
