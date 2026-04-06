/**
 * Monkey-patch de react-native Modal para detectar open/close según `visible`.
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { AnalyticsEventType } from '../types/events';
import type {
  AnalyticsIntegration,
  IAnalyticsCore,
} from '../types/integration';
import { modalStackPop, modalStackPush } from '../core/modalStack';

type TrackFn = (event: { type: string } & Record<string, unknown>) => void;

const modalPatchTrackRef: { current: TrackFn | null } = { current: null };
const RN_MODAL_PATCH_MARKER = Symbol.for('signalFox.rnModalPatchApplied');

function setModalPatchTrack(fn: TrackFn | null): void {
  modalPatchTrackRef.current = fn;
}

type ModalPropsLike = {
  visible?: boolean;
  signalFoxId?: string;
  children?: unknown;
  onDismiss?: unknown;
  onRequestClose?: unknown;
  onShow?: unknown;
} & Record<string, unknown>;

let OriginalModal: React.ComponentType<any>;

/** Solo signalFoxId */
function inferModalTargetFromProps(props: ModalPropsLike): string | null {
  return typeof props.signalFoxId === 'string' ? props.signalFoxId : null;
}

function PatchedModal(props: ModalPropsLike): React.JSX.Element {
  const prevVisibleRef = useRef<boolean | undefined>(undefined);
  const openEmittedRef = useRef<boolean>(false);
  const closeEmittedRef = useRef<boolean>(false);
  const latestTargetIdRef = useRef<string | null>(null);

  const emitOpenOnce = (targetId: string | null, targetName: string | null) => {
    if (openEmittedRef.current) return;
    openEmittedRef.current = true;
    closeEmittedRef.current = false;

    if (typeof targetId === 'string' && targetId.length > 0) {
      modalStackPush(targetId);
    }

    const track = modalPatchTrackRef.current;
    if (!track) return;
    track({
      type: 'modal_open',
      target_id: targetId,
      target_name: targetName,
      target_type: 'modal',
      payload: {
        modalName: targetId,
        source: 'react_native_modal',
        kind: 'component_modal',
      },
    });
  };

  const emitCloseOnce = (
    targetId: string | null,
    targetName: string | null
  ) => {
    if (!openEmittedRef.current) return;
    if (closeEmittedRef.current) return;
    closeEmittedRef.current = true;
    openEmittedRef.current = false;

    // Para modal_close, el parent debe ser el modal "anterior" (stack después del pop).
    if (typeof targetId === 'string' && targetId.length > 0) {
      modalStackPop(targetId);
    }

    const track = modalPatchTrackRef.current;
    if (!track) return;
    track({
      type: 'modal_close',
      target_id: targetId,
      target_name: targetName,
      target_type: 'modal',
      payload: {
        modalName: targetId,
        source: 'react_native_modal',
        kind: 'component_modal',
      },
    });
  };

  useLayoutEffect(() => {
    const visible = props.visible === true;
    const targetId = inferModalTargetFromProps(props);
    const targetName = targetId;
    latestTargetIdRef.current = targetId;
    const prev = prevVisibleRef.current;
    const isFirstRender = prev === undefined;
    prevVisibleRef.current = visible;

    if (isFirstRender) {
      return;
    }

    if (prev === false && visible) {
      closeEmittedRef.current = false;
    } else if (prev === true && !visible) {
      emitCloseOnce(targetId, targetName);
    }
    // Solo reaccionamos a `visible`; el nombre se toma en cada transición desde props actuales.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [props.visible]);

  useEffect(() => {
    return () => {
      const wasVisible = prevVisibleRef.current === true;
      if (!wasVisible) return;
      const targetId = latestTargetIdRef.current;
      emitCloseOnce(targetId, targetId);
    };
  }, []);

  const targetId = inferModalTargetFromProps(props);
  const targetName = targetId;
  const originalOnShow = props.onShow;
  const originalOnDismiss = props.onDismiss;

  return React.createElement(OriginalModal, {
    ...props,
    onShow: (...args: unknown[]) => {
      emitOpenOnce(targetId, targetName);
      if (typeof originalOnShow === 'function') {
        originalOnShow(...args);
      }
    },
    onDismiss: (...args: unknown[]) => {
      emitCloseOnce(targetId, targetName);
      if (typeof originalOnDismiss === 'function') {
        originalOnDismiss(...args);
      }
    },
  });
}

export function applyModalPatch(): void {
  const RN = require('react-native');
  if ((RN as any)[RN_MODAL_PATCH_MARKER]) return;
  (RN as any)[RN_MODAL_PATCH_MARKER] = true;
  OriginalModal = RN.Modal;

  try {
    Object.defineProperty(RN, 'Modal', {
      configurable: true,
      enumerable: true,
      get() {
        return PatchedModal;
      },
    });
  } catch {
    // ignore
  }
}

export function reactNativeModalPatchIntegration(): AnalyticsIntegration {
  return {
    name: 'reactNativeModalPatch',

    setup(core: IAnalyticsCore) {
      setModalPatchTrack((e) =>
        core.trackEvent(
          e as { type: AnalyticsEventType } & Record<string, unknown>
        )
      );
      return () => {
        setModalPatchTrack(null);
      };
    },
  };
}
