/**
 * Estado global en memoria para trackear modales anidados.
 * - push cuando se abre un modal
 * - pop cuando se cierra
 * - el "modal activo" es el último del stack
 */

const modalStack: string[] = [];

export function getActiveModalId(): string | null {
  if (modalStack.length === 0) return null;
  const last = modalStack[modalStack.length - 1];
  return typeof last === 'string' && last.length > 0 ? last : null;
}

export function modalStackPush(modalId: string): void {
  if (typeof modalId !== 'string' || modalId.length === 0) return;
  modalStack.push(modalId);
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
    // Mejor no modificar el stack que adjuntar un parentModal incorrecto.
  }

  return getActiveModalId();
}

export function resetModalStack(): void {
  modalStack.splice(0, modalStack.length);
}
