/**
 * Monkey-patch de Touchables/Pressable para component_press.
 */

import React from 'react';
import type { AnalyticsEventType } from '../types/events';
import type {
  AnalyticsIntegration,
  IAnalyticsCore,
} from '../types/integration';
import { getActiveModalId } from '../core/modalStack';

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
    return extractTextFromChildren(anyEl.props?.children);
  }
  return null;
}

/** Solo signalFoxId */
function inferTargetId(props: Record<string, unknown>): string | null {
  const v = (props as any).signalFoxId;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function inferTargetName(
  props: Record<string, unknown>,
  targetId: string | null
): string | null {
  const explicitDisplayName =
    typeof (props as any).signalFoxDisplayName === 'string'
      ? ((props as any).signalFoxDisplayName as string).trim()
      : '';
  if (explicitDisplayName.length > 0) return explicitDisplayName;
  return targetId;
}

function inferComponentText(props: Record<string, unknown>): string | null {
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
    const targetName = inferTargetName(props, targetId);
    const componentText = inferComponentText(props);
    const wrappedOnPress = (...args: any[]) => {
      const track = touchableTrackRef.current;
      if (track) {
        // Capturamos el parent modal ANTES de ejecutar el handler original,
        // para no perder contexto si el modal se cierra en el mismo tick.
        const parent_modal = getActiveModalId();
        track({
          type: 'component_press',
          signalFoxId: targetId,
          ...(targetName ? { signalFoxDisplayName: targetName } : {}),
          target_type: inferTargetType(componentName),
          payload: {
            source: 'react_native_touchable',
            rnComponent: componentName,
            parent_modal,
            ...(componentText ? { component_text: componentText } : {}),
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
    setup(core: IAnalyticsCore, _context) {
      setTouchableTrack((e) =>
        core.trackEvent(
          e as { type: AnalyticsEventType } & Record<string, unknown>
        )
      );
      return () => setTouchableTrack(null);
    },
  };
}
