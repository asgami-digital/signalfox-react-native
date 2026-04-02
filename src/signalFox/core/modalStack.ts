/**
 * Estado global en memoria para trackear modales anidados.
 * - push cuando se abre un modal
 * - pop cuando se cierra
 * - el "modal activo" es el último del stack
 */

const modalStack: string[] = [];

function maybeLogModalStack(action: string, modalId?: string | null): void {
  // En RN suele existir global __DEV__. Si no existe, logueamos igualmente
  // (preferimos visibilidad en debugging a perder información).
  let isDev = false;
  if (typeof (globalThis as any).__DEV__ === 'boolean') {
    isDev = (globalThis as any).__DEV__;
  } else if (
    typeof process !== 'undefined' &&
    typeof (process as any).env?.NODE_ENV === 'string'
  ) {
    isDev = (process as any).env.NODE_ENV !== 'production';
  }
  if (!isDev) return;

  // Snapshot del stack para que no cambie mientras se imprime.
  const stackSnapshot = modalStack.slice();
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
  return typeof last === 'string' && last.length > 0 ? last : null;
}

export function modalStackPush(modalId: string): void {
  if (typeof modalId !== 'string' || modalId.length === 0) return;
  modalStack.push(modalId);
  maybeLogModalStack('push', modalId);
}

export function modalStackPop(modalId?: string | null): string | null {
  if (modalStack.length === 0) return null;

  if (typeof modalId === 'string' && modalId.length > 0) {
    let removed = false;
    for (let i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i] === modalId) {
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

  maybeLogModalStack('pop', modalId);
  return getActiveModalId();
}

export function resetModalStack(): void {
  modalStack.splice(0, modalStack.length);
}
