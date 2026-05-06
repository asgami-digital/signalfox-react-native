/**
 * Integration with @react-navigation/native.
 *
 * The navigation intent marker (`intent_ts`) uses the internal `__unsafe_action__` event
 * del contenedor, sin monkey-patch de navigate/dispatch en el ref.
 */

import type {
  AnalyticsIntegration,
  IAnalyticsCore,
} from '../types/integration';
import {
  getActiveRouteInfo,
  isRoutePresentedAsModal,
} from '../utils/getActiveRouteInfo';
import {
  getActiveRouteName,
  type NavStateLike,
} from '../utils/getActiveRouteName';
import {
  getActiveModalId,
  modalStackPop,
  modalStackPush,
} from '../core/modalStack';

// Minimal fallback polling interval if a navigator listener cannot be attached.
const POLL_INTERVAL_MS = 350;

const DISPATCH_INTENT_TYPES = new Set<string>([
  'NAVIGATE',
  'NAVIGATE_DEPRECATED',
  'RESET',
  'GO_BACK',
  'PUSH',
  'REPLACE',
  'POP',
  'POP_TO_TOP',
  'POP_TO',
  'JUMP_TO',
]);

function shouldMarkDispatchAction(action: unknown): boolean {
  if (typeof action === 'function') {
    return true;
  }
  if (!action || typeof action !== 'object') {
    return false;
  }
  const t = (action as { type?: unknown }).type;
  return typeof t === 'string' && DISPATCH_INTENT_TYPES.has(t);
}

/**
 * Stable signature of the active root-to-leaf branch (navigator types, indices, route names, and route keys).
 * Detects changes in nested stacks/tabs that do not alter the index or names only at the root level.
 */
function buildActiveRouteBranchKey(state: NavStateLike | undefined): string {
  type RouteBranch = NavStateLike['routes'][number] & { key?: string };

  const segments: Array<{
    type?: string;
    index: number;
    name: string;
    key?: string;
  }> = [];

  let curr: NavStateLike | undefined = state;
  while (
    curr?.routes?.length &&
    curr.index >= 0 &&
    curr.index < curr.routes.length
  ) {
    const route = curr.routes[curr.index] as RouteBranch;
    if (!route?.name) {
      break;
    }
    const routeKey =
      typeof route.key === 'string' && route.key.length > 0
        ? route.key
        : undefined;
    segments.push({
      type: typeof curr.type === 'string' ? curr.type : undefined,
      index: curr.index,
      name: route.name,
      key: routeKey,
    });
    curr = route.state;
  }

  return JSON.stringify(segments);
}

interface NavigatorContextPayload {
  root_navigator: string | null;
  active_tab: string | null;
  stack_path: string[];
  presentation: string | null;
  parent_modal: string | null;
}

/** Typical payload for the internal NavigationContainer `__unsafe_action__` event. */
type NavigationUnsafeActionEvent = {
  data?: { action?: unknown };
};

export interface NavigationRefLike {
  current: {
    getRootState(): unknown;
    isReady?(): boolean;
    getCurrentOptions?(): unknown;
  } | null;

  getCurrentOptions?: () => unknown;

  /**
   * En `createNavigationContainerRef` / NavigationContainer: `state`, `ready`,
   * `__unsafe_action__`, etc. The real signature is generic; we use `unknown` so that
   * `NavigationContainerRefWithCurrent` is assignable here.
   */
  addListener?: unknown;
}

export interface ReactNavigationIntegrationOptions {
  navigationRef: NavigationRefLike;
}

function emitScreenView(
  core: IAnalyticsCore,
  screenName: string,
  previousScreen: string | undefined,
  navigatorContext: NavigatorContextPayload,
  eventTimestampMs?: number
): void {
  const event: Record<string, unknown> = {
    type: 'screen_view',
    payload: {
      screen_name: screenName,
      previous_screen_name: previousScreen ?? null,
      navigator_context: navigatorContext,
    },
  };

  if (
    typeof eventTimestampMs === 'number' &&
    Number.isFinite(eventTimestampMs) &&
    eventTimestampMs > 0
  ) {
    event.timestamp = eventTimestampMs;
  }

  core.trackEvent(event as { type: 'screen_view' } & Record<string, unknown>);
}

/**
 * Route-name path in the active Stack down to the focused screen.
 * Uses state.routes from the active "stack" navigator (not the screen name as the "root").
 */
function getStackPathToFocused(state: NavStateLike | undefined): string[] {
  if (
    !state?.routes?.length ||
    state.index < 0 ||
    state.index >= state.routes.length
  ) {
    return [];
  }

  const navType = typeof state.type === 'string' ? state.type : '';

  if (navType === 'stack') {
    const names = state.routes.map((r) => r.name);
    const end = state.index + 1;
    return names.slice(0, end);
  }

  const route = state.routes[state.index];
  if (!route) return [];
  const nested = route.state as NavStateLike | undefined;
  if (nested?.routes?.length) {
    const inner = getStackPathToFocused(nested);
    if (inner.length > 0) {
      return inner;
    }
  }

  return [route.name];
}

function getStackEntriesToFocused(
  state: NavStateLike | undefined
): Array<{ name: string; key?: string }> {
  if (
    !state?.routes?.length ||
    state.index < 0 ||
    state.index >= state.routes.length
  ) {
    return [];
  }

  const navType = typeof state.type === 'string' ? state.type : '';

  if (navType === 'stack') {
    const end = state.index + 1;
    return state.routes.slice(0, end).map((route) => ({
      name: route.name,
      key: route.key,
    }));
  }

  const route = state.routes[state.index];
  if (!route) return [];
  const nested = route.state as NavStateLike | undefined;
  if (nested?.routes?.length) {
    const inner = getStackEntriesToFocused(nested);
    if (inner.length > 0) {
      return inner;
    }
  }

  return [{ name: route.name, key: route.key }];
}

/**
 * Active tab: first tab-type navigator found while traversing the state.
 */
function getActiveTabRouteName(state: NavStateLike | undefined): string | null {
  if (
    !state?.routes?.length ||
    state.index < 0 ||
    state.index >= state.routes.length
  ) {
    return null;
  }
  if (state.type === 'tab') {
    return state.routes[state.index]?.name ?? null;
  }
  const route = state.routes[state.index];
  if (!route) return null;
  const nested = route.state as NavStateLike | undefined;
  if (nested?.routes?.length) {
    return getActiveTabRouteName(nested);
  }
  return null;
}

/**
 * Root navigator identity for analytics.
 * `getRootState()` does not include the `id` of `<Stack.Navigator id="...">` in typical versions;
 * we use `state.id` if available, then `state.type`, and finally a generic fallback.
 */
function getRootNavigatorIdentity(
  state: NavStateLike | undefined
): string | null {
  if (!state?.routes?.length) {
    return null;
  }
  const fromId = typeof state.id === 'string' ? state.id.trim() : '';
  if (fromId.length > 0) {
    return fromId;
  }
  if (typeof state.type === 'string' && state.type.length > 0) {
    return state.type;
  }
  return 'stack';
}

function buildNavigatorContext(
  state: NavStateLike | undefined,
  currentPresentation: string | null
): NavigatorContextPayload {
  const rootNavigator = getRootNavigatorIdentity(state);
  const stackPath = getStackPathToFocused(state);
  const activeTab = getActiveTabRouteName(state);

  return {
    root_navigator: rootNavigator,
    active_tab: activeTab,
    stack_path: stackPath,
    presentation: currentPresentation,
    parent_modal: getActiveModalId(),
  };
}

interface FocusedRouteSnapshot {
  name: string;
  key: string;
  presentation: string | null;
  isModal: boolean;
}

function normalizePresentation(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function getCurrentPresentation(
  navigationRef: NavigationRefLike
): string | null {
  const fromRef =
    typeof navigationRef.getCurrentOptions === 'function'
      ? navigationRef.getCurrentOptions()
      : undefined;
  const fromCurrent =
    typeof navigationRef.current?.getCurrentOptions === 'function'
      ? navigationRef.current.getCurrentOptions()
      : undefined;
  const options =
    fromRef && typeof fromRef === 'object' ? fromRef : fromCurrent;

  return normalizePresentation(
    options && typeof options === 'object'
      ? (options as { presentation?: unknown }).presentation
      : undefined
  );
}

function emitNavigationModalOpen(
  core: IAnalyticsCore,
  route: FocusedRouteSnapshot,
  previousScreenName: string | undefined
): void {
  const parentModal = modalStackPush({
    id: route.name,
    stackKey: route.key,
    source: 'react_navigation',
  });

  core.trackEvent({
    type: 'modal_open',
    signalFoxNodeId: route.name,
    target_type: 'modal',
    payload: {
      modalName: route.name,
      source: 'react_navigation',
      kind: 'screen_modal',
      previous_screen_name: previousScreenName ?? null,
      previousScreen: previousScreenName ?? null,
      currentScreen: route.name,
      screen_name: route.name,
      presentation: route.presentation,
      parent_modal: parentModal,
    },
  });
}

function emitNavigationModalClose(
  core: IAnalyticsCore,
  route: FocusedRouteSnapshot,
  currentScreenName: string | undefined
): void {
  const parentModal = modalStackPop(route.key);

  core.trackEvent({
    type: 'modal_close',
    signalFoxNodeId: route.name,
    target_type: 'modal',
    payload: {
      modalName: route.name,
      source: 'react_navigation',
      kind: 'screen_modal',
      previous_screen_name: route.name,
      previousScreen: route.name,
      currentScreen: currentScreenName ?? null,
      screen_name: currentScreenName ?? null,
      presentation: route.presentation,
      parent_modal: parentModal,
    },
  });
}

export function reactNavigationIntegration(
  options: ReactNavigationIntegrationOptions
): AnalyticsIntegration {
  const { navigationRef } = options;

  return {
    name: 'reactNavigation',

    setup(core: IAnalyticsCore, _context): () => void {
      let previousScreenName: string | undefined;
      let previousRouteSnapshot: FocusedRouteSnapshot | null = null;
      let previousStackRouteKeys = new Set<string>();
      let lastActiveBranchKey: string | null = null;
      let pendingNavigationTimestamp: number | null = null;
      let bootstrapInterval: ReturnType<typeof setInterval> | null = null;
      let stateListenerAttached = false;
      let attachedStateListenerTarget: unknown = null;

      const markNavigationIntent = () => {
        pendingNavigationTimestamp = Date.now();
        core.markNavigationIntentPending?.();
      };
      markNavigationIntent();

      core.setNavigationIntentTimeoutListener?.(() => {
        pendingNavigationTimestamp = null;
      });

      const stopBootstrapPolling = () => {
        if (bootstrapInterval) {
          clearInterval(bootstrapInterval);
          bootstrapInterval = null;
        }
      };

      const tryAttachStateListener = (target: unknown) => {
        if (
          stateListenerAttached ||
          !target ||
          typeof target !== 'object' ||
          target === attachedStateListenerTarget
        ) {
          return;
        }
        const fn = (target as { addListener?: unknown }).addListener;
        if (typeof fn !== 'function') return;
        const unsub = fn.call(target, 'state', handleStateChange);
        if (typeof unsub !== 'function') return;
        stateListenerAttached = true;
        attachedStateListenerTarget = target;
        unsubscribers.push(unsub);
      };

      const handleStateChange = () => {
        // Some apps initialize `navigationRef.current` after this integration setup.
        // Retry binding the listener so we do not depend only on bootstrap polling.
        tryAttachStateListener(navigationRef.current);

        const ref = navigationRef.current;
        if (!ref?.getRootState) return;
        const state = ref.getRootState() as NavStateLike | undefined;
        if (!state?.routes?.length) return;

        const activeBranchKey = buildActiveRouteBranchKey(state);
        if (activeBranchKey === lastActiveBranchKey) {
          // Same full active branch (for example, only params changed): there is no
          // new screen transition; avoid leaving pending state hanging.
          pendingNavigationTimestamp = null;
          core.clearNavigationIntentPending?.();
          return;
        }
        lastActiveBranchKey = activeBranchKey;

        const activeName = getActiveRouteName(state);
        if (activeName == null) {
          pendingNavigationTimestamp = null;
          core.clearNavigationIntentPending?.();
          return;
        }

        const currentInfo = getActiveRouteInfo(state);
        if (!currentInfo) {
          pendingNavigationTimestamp = null;
          core.clearNavigationIntentPending?.();
          return;
        }
        const currentPresentation = getCurrentPresentation(navigationRef);
        const currentRouteKey =
          typeof currentInfo.key === 'string' && currentInfo.key.length > 0
            ? currentInfo.key
            : activeBranchKey;
        const currentRouteSnapshot: FocusedRouteSnapshot = {
          name: currentInfo.name,
          key: currentRouteKey,
          presentation: currentPresentation,
          isModal: isRoutePresentedAsModal(currentPresentation ?? undefined),
        };
        const currentStackEntries = getStackEntriesToFocused(state);
        const currentStackRouteKeys = new Set(
          currentStackEntries
            .map((entry) =>
              typeof entry.key === 'string' && entry.key.length > 0
                ? entry.key
                : null
            )
            .filter((entryKey): entryKey is string => entryKey != null)
        );

        if (
          previousRouteSnapshot?.isModal &&
          (!currentRouteSnapshot.isModal ||
            !currentStackRouteKeys.has(previousRouteSnapshot.key))
        ) {
          emitNavigationModalClose(
            core,
            previousRouteSnapshot,
            currentRouteSnapshot.name
          );
        }

        if (
          currentRouteSnapshot.isModal &&
          !previousStackRouteKeys.has(currentRouteSnapshot.key)
        ) {
          emitNavigationModalOpen(
            core,
            currentRouteSnapshot,
            previousScreenName
          );
        }

        const navigatorContext = buildNavigatorContext(
          state,
          currentRouteSnapshot.presentation
        );

        const intentTs = pendingNavigationTimestamp;
        pendingNavigationTimestamp = null;

        if (activeName !== previousScreenName) {
          const tsForEvent =
            typeof intentTs === 'number' &&
            Number.isFinite(intentTs) &&
            intentTs > 0
              ? intentTs
              : undefined;
          emitScreenView(
            core,
            activeName,
            previousScreenName,
            navigatorContext,
            tsForEvent
          );
        }

        previousScreenName = activeName;
        previousRouteSnapshot = currentRouteSnapshot;
        previousStackRouteKeys = currentStackRouteKeys;
        core.clearNavigationIntentPending?.();
        // Stop startup polling only after we have a persistent state listener.
        if (stateListenerAttached) {
          stopBootstrapPolling();
        }
      };

      const unsubscribers: Array<() => void> = [];

      /**
       * Internal container API: emitted on every processed action (navigate from screens, ref, etc.).
       * Sirve para intent_ts sin monkey-patch de navigate/dispatch en el ref.
       */
      const addListener = navigationRef.addListener;
      if (typeof addListener === 'function') {
        const unsubUnsafe = addListener.call(
          navigationRef,
          '__unsafe_action__',
          (event?: NavigationUnsafeActionEvent) => {
            const action = event?.data?.action;
            if (!shouldMarkDispatchAction(action)) return;
            markNavigationIntent();
          }
        );
        if (typeof unsubUnsafe === 'function') unsubscribers.push(unsubUnsafe);
      }

      // Preferimos escuchar cambios en el estado del navigator.
      tryAttachStateListener(navigationRef);
      tryAttachStateListener(navigationRef.current);

      // Some implementations emit 'ready' (if it exists, we trigger on the first valid state).
      if (typeof addListener === 'function') {
        const unsubReady = addListener.call(navigationRef, 'ready', () => {
          handleStateChange();
        });
        if (typeof unsubReady === 'function') unsubscribers.push(unsubReady);
      }

      // Polling de bootstrap siempre activo al inicio para no depender solo de listeners.
      // En release puede haber carreras donde el primer state/ready no se observe.
      bootstrapInterval = setInterval(handleStateChange, POLL_INTERVAL_MS);

      // Initial attempt if the container is already ready.
      try {
        if (navigationRef.current?.isReady?.()) {
          handleStateChange();
        }
      } catch {
        // ignore
      }

      return () => {
        core.setNavigationIntentTimeoutListener?.(null);
        core.clearNavigationIntentPending?.();
        for (const u of unsubscribers) u();
        stopBootstrapPolling();
      };
    },
  };
}
