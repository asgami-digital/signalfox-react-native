/**
 * Monkey-patch de Touchables/Pressable para component_press.
 */

import React from 'react';
import type { AnalyticsEventType } from '../types/events';
import type {
  AnalyticsIntegration,
  IAnalyticsCore,
} from '../types/integration';

type TrackFn = (event: { type: string } & Record<string, unknown>) => void;
const touchableTrackRef: { current: TrackFn | null } = { current: null };
const RN_TOUCHABLE_PATCH_MARKER = Symbol.for(
  'signalFox.rnTouchablePatchApplied'
);

function setTouchableTrack(fn: TrackFn | null): void {
  touchableTrackRef.current = fn;
}

function extractTextFromChildren(children: unknown): string | null {
  if (children == null) return null;
  if (typeof children === 'string') return children.trim() || null;
  if (Array.isArray(children)) {
    for (const child of children) {
      const t = extractTextFromChildren(child);
      if (t) return t;
    }
    return null;
  }
  if (React.isValidElement(children)) {
    const anyEl = children as any;
    const isText =
      anyEl?.type &&
      (anyEl.type === 'Text' ||
        anyEl.type?.displayName === 'Text' ||
        anyEl.type?.name === 'Text');
    const inner = extractTextFromChildren(anyEl.props?.children);
    return isText ? inner : inner;
  }
  return null;
}

/** Solo signalFoxId */
function inferTargetId(props: Record<string, unknown>): string | null {
  return typeof (props as any).signalFoxId === 'string'
    ? (props as any).signalFoxId
    : null;
}

function inferTargetName(props: Record<string, unknown>): string | null {
  const title =
    typeof (props as any).title === 'string'
      ? ((props as any).title as string).trim()
      : '';
  if (title.length > 0) return title;
  return extractTextFromChildren((props as any).children);
}

function inferTargetType(
  componentName: string
): 'button' | 'touchable' | 'tab' | 'unknown' {
  if (componentName === 'Button') return 'button';
  if (componentName === 'Pressable' || componentName.includes('Touchable'))
    return 'touchable';
  return 'unknown';
}

function makePatchedComponent(Original: any, componentName: string): any {
  function Patched(props: any) {
    const onPress = props?.onPress;
    if (typeof onPress !== 'function') {
      return React.createElement(Original, props);
    }
    const targetId = inferTargetId(props);
    const targetName = inferTargetName(props);
    const wrappedOnPress = (...args: any[]) => {
      const track = touchableTrackRef.current;
      if (track) {
        track({
          type: 'component_press',
          target_id: targetId,
          target_name: targetName,
          target_type: inferTargetType(componentName),
          payload: {
            source: 'react_native_touchable',
            rnComponent: componentName,
          },
        });
      }
      return onPress(...args);
    };
    return React.createElement(Original, { ...props, onPress: wrappedOnPress });
  }

  Patched.displayName = `SignalFoxPatched(${componentName})`;
  return Patched;
}

function patchExportGetter(RN: any, exportName: string): void {
  const desc = Object.getOwnPropertyDescriptor(RN, exportName);
  const Original = RN[exportName];
  const Patched = makePatchedComponent(Original, exportName);

  try {
    Object.defineProperty(RN, exportName, {
      configurable: true,
      enumerable: desc?.enumerable ?? true,
      get() {
        return Patched;
      },
    });
  } catch {
    // ignore
  }
}

export function applyTouchablePatch(): void {
  const RN = require('react-native');
  if ((RN as any)[RN_TOUCHABLE_PATCH_MARKER]) return;
  (RN as any)[RN_TOUCHABLE_PATCH_MARKER] = true;
  const targets = [
    'Pressable',
    'Button',
    'TouchableOpacity',
    'TouchableHighlight',
    'TouchableWithoutFeedback',
    'TouchableNativeFeedback',
  ];
  for (const name of targets) {
    if (RN[name]) patchExportGetter(RN, name);
  }
}

export function reactNativeTouchablePatchIntegration(): AnalyticsIntegration {
  return {
    name: 'reactNativeTouchablePatch',
    setup(core: IAnalyticsCore) {
      setTouchableTrack((e) =>
        core.trackEvent(
          e as { type: AnalyticsEventType } & Record<string, unknown>
        )
      );
      return () => setTouchableTrack(null);
    },
  };
}
