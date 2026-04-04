/**
 * Integración con @react-navigation/native.
 */

import type {
  AnalyticsIntegration,
  IAnalyticsCore,
} from '../types/integration';
import {
  getActiveRouteInfo,
  isRoutePresentedAsModal,
  type ActiveRouteInfo,
} from '../utils/getActiveRouteInfo';
import {
  getActiveRouteName,
  type NavStateLike,
} from '../utils/getActiveRouteName';

// Interval para fallback mínimo si no se puede adjuntar un listener del navigator.
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

const NAV_METHODS_TO_WRAP = [
  'navigate',
  'navigateDeprecated',
  'reset',
  'resetRoot',
  'goBack',
  'push',
  'replace',
  'pop',
  'popToTop',
  'popTo',
] as const;

type NavPatchTarget = Record<string, unknown>;

type NavPatchRegistryEntry = {
  refCount: number;
  restore: () => void;
};

const navigationRefPatchRegistry = new WeakMap<object, NavPatchRegistryEntry>();

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
 * Firma estable de la rama activa raíz → hoja (tipos de navigator, índices, nombres y keys de ruta).
 * Detecta cambios en stacks/tabs anidados que no alteran el índice ni los nombres solo en el nivel raíz.
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

/**
 * Envuelve métodos del ref / objeto de navegación para registrar el instante de la intención.
 * Idempotente por objeto: varias inicializaciones incrementan refCount; cada release lo decrementa.
 */
function acquireNavigationRefIntentPatch(
  target: unknown,
  onNavigationIntent: () => void
): () => void {
  if (!target || typeof target !== 'object') {
    return () => {};
  }

  const key = target as object;
  const existing = navigationRefPatchRegistry.get(key);
  if (existing) {
    existing.refCount += 1;
    return () => {
      existing.refCount -= 1;
      if (existing.refCount <= 0) {
        existing.restore();
        navigationRefPatchRegistry.delete(key);
      }
    };
  }

  const nav = target as NavPatchTarget;
  const originals = new Map<string, (...args: unknown[]) => unknown>();

  for (const name of NAV_METHODS_TO_WRAP) {
    const value = nav[name];
    if (typeof value !== 'function') {
      continue;
    }
    const original = value as (...args: unknown[]) => unknown;
    originals.set(name, original);
    nav[name] = (...args: unknown[]) => {
      onNavigationIntent();
      return original.apply(nav, args);
    };
  }

  const dispatchVal = nav.dispatch;
  if (typeof dispatchVal === 'function' && !originals.has('dispatch')) {
    const originalDispatch = dispatchVal as (action: unknown) => unknown;
    originals.set('dispatch', originalDispatch);
    nav.dispatch = (action: unknown) => {
      if (shouldMarkDispatchAction(action)) {
        onNavigationIntent();
      }
      return originalDispatch.call(nav, action);
    };
  }

  const restore = () => {
    for (const [name, fn] of originals) {
      nav[name] = fn;
    }
  };

  navigationRefPatchRegistry.set(key, { refCount: 1, restore });

  return () => {
    const entry = navigationRefPatchRegistry.get(key);
    if (!entry) {
      return;
    }
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      entry.restore();
      navigationRefPatchRegistry.delete(key);
    }
  };
}

interface RouteChainEntry {
  name: string;
  presentation?: string;
  selectedByNavigatorType?: string;
}

interface NavigatorContextPayload {
  root_navigator: string | null;
  active_tab: string | null;
  stack_path: string[];
  presentation: string | null;
  parent_modal: string | null;
}

export interface NavigationRefLike {
  current: {
    getRootState(): unknown;
    isReady?(): boolean;
    /** Compatible con @react-navigation/native (event map tipado). */

    addListener?: (type: any, listener: () => void) => () => void;
  } | null;

  addListener?: (type: any, listener: () => void) => () => void;
}

export interface ReactNavigationIntegrationOptions {
  navigationRef: NavigationRefLike;
  getRoutePresentation?: (routeName: string) => string | undefined;
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
 * Camino de nombres de ruta en el Stack activo hasta la pantalla enfocada.
 * Usa state.routes del navigator tipo "stack" (no el nombre de la pantalla como "raíz").
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

/**
 * Pestaña activa: primer navigator tipo tab encontrado al bajar por el estado.
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

function getActiveRouteChain(
  state: NavStateLike | undefined,
  getPresentationForRoute?: (routeName: string) => string | undefined
): RouteChainEntry[] {
  if (
    !state?.routes?.length ||
    state.index < 0 ||
    state.index >= state.routes.length
  ) {
    return [];
  }

  const route = state.routes[state.index];
  if (!route) return [];
  const navigatorType = typeof state.type === 'string' ? state.type : undefined;
  const current: RouteChainEntry = {
    name: route.name,
    presentation: getPresentationForRoute?.(route.name),
    selectedByNavigatorType: navigatorType,
  };

  const nested = route.state as NavStateLike | undefined;
  if (!nested?.routes?.length) {
    return [current];
  }

  return [current, ...getActiveRouteChain(nested, getPresentationForRoute)];
}

/**
 * Identidad del navigator raíz para analytics.
 * `getRootState()` no incluye el `id` de `<Stack.Navigator id="...">` en las versiones típicas;
 * usamos `state.id` si existiera, luego `state.type`, y por último un fallback genérico.
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
  getPresentationForRoute:
    | ((routeName: string) => string | undefined)
    | undefined,
  currentInfo: ActiveRouteInfo
): NavigatorContextPayload {
  const chain = getActiveRouteChain(state, getPresentationForRoute);

  const rootNavigator = getRootNavigatorIdentity(state);

  const stackPath = getStackPathToFocused(state);
  const activeTab = getActiveTabRouteName(state);

  const parentModal =
    [...chain]
      .reverse()
      .slice(1)
      .find((entry) => isRoutePresentedAsModal(entry.presentation))?.name ??
    null;

  return {
    root_navigator: rootNavigator,
    active_tab: activeTab,
    stack_path: stackPath,
    presentation: currentInfo.presentation ?? null,
    parent_modal: parentModal,
  };
}

export function reactNavigationIntegration(
  options: ReactNavigationIntegrationOptions
): AnalyticsIntegration {
  const { navigationRef, getRoutePresentation } = options;

  return {
    name: 'reactNavigation',

    setup(core) {
      let previousScreenName: string | undefined;
      let lastActiveBranchKey: string | null = null;
      let pendingNavigationTimestamp: number | null = null;

      const markNavigationIntent = () => {
        pendingNavigationTimestamp = Date.now();
      };

      const releasePatches: Array<() => void> = [];
      releasePatches.push(
        acquireNavigationRefIntentPatch(
          navigationRef as unknown,
          markNavigationIntent
        )
      );
      releasePatches.push(
        acquireNavigationRefIntentPatch(
          navigationRef.current as unknown,
          markNavigationIntent
        )
      );

      const patchCurrentWhenReady = () => {
        releasePatches.push(
          acquireNavigationRefIntentPatch(
            navigationRef.current as unknown,
            markNavigationIntent
          )
        );
      };

      const handleStateChange = () => {
        const ref = navigationRef.current;
        if (!ref?.getRootState) return;
        const state = ref.getRootState() as NavStateLike | undefined;
        if (!state?.routes?.length) return;

        const activeBranchKey = buildActiveRouteBranchKey(state);
        if (activeBranchKey === lastActiveBranchKey) {
          // Misma rama activa completa (p. ej. solo params): no hay transición de pantalla nueva; evita pending colgado.
          pendingNavigationTimestamp = null;
          return;
        }
        lastActiveBranchKey = activeBranchKey;

        const activeName = getActiveRouteName(state);
        if (activeName == null) {
          pendingNavigationTimestamp = null;
          return;
        }

        const currentInfo = getActiveRouteInfo(state, getRoutePresentation);
        if (!currentInfo) {
          pendingNavigationTimestamp = null;
          return;
        }
        const navigatorContext = buildNavigatorContext(
          state,
          getRoutePresentation,
          currentInfo
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

        // Temporalmente desactivado:
        // no emitimos modal_open/modal_close desde reactNavigationIntegration
        // para evitar cierres/aperturas falsos hasta revisar la lógica.
        //
        // if (!prevModal && currentModal) {
        //   emitModalOpen(core, currentInfo.name, previousScreenName);
        // } else if (prevModal && !currentModal) {
        //   emitModalClose(core, previousRouteInfo!.name, activeName);
        // } else if (
        //   prevModal &&
        //   currentModal &&
        //   previousRouteInfo &&
        //   previousRouteInfo.name !== currentInfo.name
        // ) {
        //   emitModalClose(core, previousRouteInfo.name, activeName);
        //   emitModalOpen(core, currentInfo.name, previousRouteInfo.name);
        // }

        previousScreenName = activeName;
      };

      const unsubscribers: Array<() => void> = [];
      const addStateListener = (
        target:
          | { addListener?: (type: string, listener: () => void) => () => void }
          | null
          | undefined
      ) => {
        const fn = target?.addListener;
        if (typeof fn !== 'function') return;
        const unsub = fn.call(target, 'state', handleStateChange);
        if (typeof unsub === 'function') unsubscribers.push(unsub);
      };

      // Preferimos escuchar cambios en el estado del navigator.
      addStateListener(navigationRef);
      addStateListener(navigationRef.current);

      // Algunas implementaciones emiten 'ready' (si existe, disparamos al primer estado válido).
      if (typeof navigationRef.addListener === 'function') {
        const unsubReady = navigationRef.addListener('ready', () => {
          patchCurrentWhenReady();
          handleStateChange();
        });
        if (typeof unsubReady === 'function') unsubscribers.push(unsubReady);
      }

      let interval: ReturnType<typeof setInterval> | null = null;
      if (unsubscribers.length === 0) {
        // Fallback: polling mínimo hasta que podamos leer el estado.
        interval = setInterval(handleStateChange, POLL_INTERVAL_MS);
      }

      // Intento inicial si el container ya está listo.
      try {
        if (navigationRef.current?.isReady?.()) {
          patchCurrentWhenReady();
          handleStateChange();
        }
      } catch {
        // ignore
      }

      return () => {
        for (const u of unsubscribers) u();
        if (interval) clearInterval(interval);
        for (const release of releasePatches) release();
      };
    },
  };
}
