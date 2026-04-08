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
  signalFoxDisplayName?: string;
  children?: unknown;
  onDismiss?: unknown;
  onRequestClose?: unknown;
  onShow?: unknown;
} & Record<string, unknown>;

let OriginalModal: React.ComponentType<any>;

/** Solo signalFoxId */
function inferModalTargetFromProps(props: ModalPropsLike): string | null {
  if (typeof props.signalFoxId !== 'string') return null;
  const t = props.signalFoxId.trim();
  return t.length > 0 ? t : null;
}

function inferModalDisplayNameFromProps(props: ModalPropsLike): string | null {
  return typeof props.signalFoxDisplayName === 'string'
    ? props.signalFoxDisplayName
    : null;
}

function PatchedModal(props: ModalPropsLike): React.JSX.Element {
  const prevVisibleRef = useRef<boolean | undefined>(undefined);
  const openEmittedRef = useRef<boolean>(false);
  const closeEmittedRef = useRef<boolean>(false);
  const latestTargetIdRef = useRef<string | null>(null);
  const latestTargetDisplayNameRef = useRef<string | null>(null);

  console.log('PatchedModal props', props);

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
      signalFoxId: targetId,
      ...(targetName ? { signalFoxDisplayName: targetName } : {}),
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
      signalFoxId: targetId,
      ...(targetName ? { signalFoxDisplayName: targetName } : {}),
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
    const targetName = inferModalDisplayNameFromProps(props);
    latestTargetIdRef.current = targetId;
    latestTargetDisplayNameRef.current = targetName;
    const prev = prevVisibleRef.current;
    const isFirstRender = prev === undefined;

    if (isFirstRender) {
      if (visible) {
        emitOpenOnce(targetId, targetName);
      }
      prevVisibleRef.current = visible;
      return;
    }

    if (!prev && visible) {
      emitOpenOnce(targetId, targetName);
    } else if (prev && !visible) {
      emitCloseOnce(targetId, targetName);
    }

    prevVisibleRef.current = visible;
    // Solo reaccionamos a `visible`; el nombre se toma en cada transición desde props actuales.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [props.visible]);

  useEffect(() => {
    return () => {
      const wasVisible = prevVisibleRef.current === true;
      if (!wasVisible) return;
      const targetId = latestTargetIdRef.current;
      const targetName = latestTargetDisplayNameRef.current;
      emitCloseOnce(targetId, targetName);
    };
  }, []);

  const targetId = inferModalTargetFromProps(props);
  const targetName = inferModalDisplayNameFromProps(props);
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
  console.log("caca")
  const RN = require('react-native');
  if ((RN as any)[RN_MODAL_PATCH_MARKER]) return;
  console.log("de");
  (RN as any)[RN_MODAL_PATCH_MARKER] = true;
  OriginalModal = RN.Modal;
  console.log("vaca")

  try {
    Object.defineProperty(RN, 'Modal', {
      configurable: true,
      enumerable: true,
      get() {
        return PatchedModal;
      },
    });
    console.log('Modal patch applied');
  } catch (error) {
    console.error('Error applying modal patch', error);
    // ignore
  }
}

export function reactNativeModalPatchIntegration(): AnalyticsIntegration {
  return {
    name: 'reactNativeModalPatch',

    setup(core: IAnalyticsCore, _context) {
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
