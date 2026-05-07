/**
 * Monkey-patch for react-native Modal to detect open/close based on `visible`.
 */

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import type { AnalyticsEventType } from '../types/events';
import type {
  AnalyticsIntegration,
  IAnalyticsCore,
} from '../types/integration';
import {
  getActiveModalId,
  modalStackPop,
  modalStackPush,
  setPendingActiveModal,
} from '../core/modalStack';

type TrackFn = (event: { type: string } & Record<string, unknown>) => void;

const modalPatchTrackRef: { current: TrackFn | null } = { current: null };
const RN_MODAL_PATCH_MARKER = Symbol.for('signalFox.rnModalPatchApplied');
const MODAL_OPEN_REORDER_WINDOW_MS = 32;

type PendingModalOpen = {
  targetId: string;
  targetName: string | null;
  timer: ReturnType<typeof setTimeout>;
};

const pendingModalOpens: PendingModalOpen[] = [];

function setModalPatchTrack(fn: TrackFn | null): void {
  modalPatchTrackRef.current = fn;
}

type ModalPropsLike = {
  visible?: boolean;
  signalFoxNodeId?: string;
  signalFoxNodeDisplayName?: string;
  children?: unknown;
  onDismiss?: unknown;
  onRequestClose?: unknown;
  onShow?: unknown;
} & Record<string, unknown>;

let OriginalModal: React.ComponentType<any>;

/** Solo signalFoxNodeId */
function inferModalTargetFromProps(props: ModalPropsLike): string | null {
  if (typeof props.signalFoxNodeId !== 'string') return null;
  const t = props.signalFoxNodeId.trim();
  return t.length > 0 ? t : null;
}

function inferModalDisplayNameFromProps(props: ModalPropsLike): string | null {
  return typeof props.signalFoxNodeDisplayName === 'string'
    ? props.signalFoxNodeDisplayName
    : null;
}

function isModalVisible(props: ModalPropsLike): boolean {
  // In many apps the modal is shown via conditional rendering and `visible`
  // is omitted, so treat only an explicit `false` as hidden.
  return props.visible !== false;
}

function updatePendingActiveModal(): void {
  const latestPending = pendingModalOpens[pendingModalOpens.length - 1];
  setPendingActiveModal(
    latestPending
      ? {
          id: latestPending.targetId,
          stackKey: latestPending.targetId,
          source: 'react_native_modal',
        }
      : null
  );
}

function emitModalOpenNow(targetId: string | null, targetName: string | null) {
  let parentModal: string | null = null;
  if (typeof targetId === 'string' && targetId.length > 0) {
    parentModal = modalStackPush({
      id: targetId,
      source: 'react_native_modal',
    });
  }

  const track = modalPatchTrackRef.current;
  if (!track) return;
  track({
    type: 'modal_open',
    signalFoxNodeId: targetId,
    ...(targetName ? { signalFoxNodeDisplayName: targetName } : {}),
    target_type: 'modal',
    payload: {
      modalName: targetId,
      source: 'react_native_modal',
      kind: 'component_modal',
      parent_modal: parentModal,
    },
  });
}

function flushPendingModalOpens(): void {
  const pendingOpens = pendingModalOpens.splice(0, pendingModalOpens.length);
  setPendingActiveModal(null);

  pendingOpens.forEach((pendingOpen) => {
    clearTimeout(pendingOpen.timer);
    emitModalOpenNow(pendingOpen.targetId, pendingOpen.targetName);
  });
}

function scheduleModalOpen(targetId: string, targetName: string | null): void {
  cancelPendingModalOpen(targetId);

  const pendingOpen: PendingModalOpen = {
    targetId,
    targetName,
    timer: setTimeout(() => {
      const index = pendingModalOpens.indexOf(pendingOpen);
      if (index === -1) return;
      pendingModalOpens.splice(index, 1);
      updatePendingActiveModal();
      emitModalOpenNow(targetId, targetName);
    }, MODAL_OPEN_REORDER_WINDOW_MS),
  };

  pendingModalOpens.push(pendingOpen);
  updatePendingActiveModal();
}

function cancelPendingModalOpen(targetId: string | null): boolean {
  if (typeof targetId !== 'string' || targetId.length === 0) return false;

  const index = pendingModalOpens.findIndex(
    (pendingOpen) => pendingOpen.targetId === targetId
  );
  if (index === -1) return false;

  const [pendingOpen] = pendingModalOpens.splice(index, 1);
  if (pendingOpen) {
    clearTimeout(pendingOpen.timer);
  }
  updatePendingActiveModal();
  return true;
}

function cancelAllPendingModalOpens(): void {
  pendingModalOpens.forEach((pendingOpen) => {
    clearTimeout(pendingOpen.timer);
  });
  pendingModalOpens.splice(0, pendingModalOpens.length);
  setPendingActiveModal(null);
}

function PatchedModal(props: ModalPropsLike): React.JSX.Element {
  const prevVisibleRef = useRef<boolean | undefined>(undefined);
  const currentVisibleRef = useRef<boolean>(false);
  const openEmittedRef = useRef<boolean>(false);
  const closeEmittedRef = useRef<boolean>(false);
  const latestTargetIdRef = useRef<string | null>(null);
  const latestTargetDisplayNameRef = useRef<string | null>(null);

  const emitOpenOnce = (targetId: string | null, targetName: string | null) => {
    if (openEmittedRef.current) return;
    openEmittedRef.current = true;
    closeEmittedRef.current = false;

    if (typeof targetId === 'string' && targetId.length > 0) {
      const activeModalId = getActiveModalId();
      if (activeModalId) {
        scheduleModalOpen(targetId, targetName);
        return;
      }
    }

    emitModalOpenNow(targetId, targetName);
  };

  const emitCloseOnce = (
    targetId: string | null,
    targetName: string | null
  ) => {
    if (!openEmittedRef.current) return;
    if (closeEmittedRef.current) return;
    closeEmittedRef.current = true;
    openEmittedRef.current = false;

    if (cancelPendingModalOpen(targetId)) {
      return;
    }

    // For modal_close, the parent must be the "previous" modal (stack after the pop).
    const parentModal =
      typeof targetId === 'string' && targetId.length > 0
        ? modalStackPop(targetId)
        : null;

    const track = modalPatchTrackRef.current;
    if (!track) return;
    track({
      type: 'modal_close',
      signalFoxNodeId: targetId,
      ...(targetName ? { signalFoxNodeDisplayName: targetName } : {}),
      target_type: 'modal',
      payload: {
        modalName: targetId,
        source: 'react_native_modal',
        kind: 'component_modal',
        parent_modal: parentModal,
      },
    });
    flushPendingModalOpens();
  };

  useLayoutEffect(() => {
    const visible = isModalVisible(props);
    const targetId = inferModalTargetFromProps(props);
    const targetName = inferModalDisplayNameFromProps(props);
    latestTargetIdRef.current = targetId;
    latestTargetDisplayNameRef.current = targetName;
    currentVisibleRef.current = visible;
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
    // We only react to `visible`; the name is read on each transition from current props.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [props.visible]);

  useEffect(() => {
    return () => {
      const wasVisible = currentVisibleRef.current === true;
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
        cancelAllPendingModalOpens();
        setModalPatchTrack(null);
      };
    },
  };
}
