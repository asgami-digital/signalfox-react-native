/**
 * Estado global en memoria para trackear modales anidados.
 * - push cuando se abre un modal
 * - pop cuando se cierra
 * - el "modal activo" es el último del stack
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
  // En RN suele existir global __DEV__. Si no existe, logueamos igualmente
  // (preferimos visibilidad en debugging a perder información).
  let isDev = false;
  const globalProcess = (globalThis as {
    process?: { env?: { NODE_ENV?: string } };
  }).process;
  if (typeof (globalThis as any).__DEV__ === 'boolean') {
    isDev = (globalThis as any).__DEV__;
  } else if (
    typeof globalProcess?.env?.NODE_ENV === 'string'
  ) {
    isDev = globalProcess.env.NODE_ENV !== 'production';
  }
  if (!isDev) return;

  // Snapshot del stack para que no cambie mientras se imprime.
  const stackSnapshot = modalStack.map((entry) => ({ ...entry }));
  console.log('[AUTO_ANALYTICS][modal_stack]', {
    action,
    modalId: typeof modalId === 'string' && modalId.length > 0 ? modalId : null,
    stack: stackSnapshot,
    active:
      stackSnapshot.length > 0
        ? stackSnapshot[stackSnapshot.length - 1]
        : null,
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
    // Si no tenemos id, no podemos decidir con seguridad qué modal se cerró.
    // Mejor no modificar el stack que adjuntar un parent_modal incorrecto.
  }

  maybeLogModalStack('pop', stackKeyOrId);
  return getActiveModalId();
}

export function resetModalStack(): void {
  modalStack.splice(0, modalStack.length);
}
