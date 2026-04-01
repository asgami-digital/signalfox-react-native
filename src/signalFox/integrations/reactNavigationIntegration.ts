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
  navigatorContext: NavigatorContextPayload
): void {
  core.trackEvent({
    type: 'screen_view',
    payload: {
      screen_name: screenName,
      previous_screen_name: previousScreen ?? null,
      navigator_context: navigatorContext,
    },
  });
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
      let lastStateKey: string | null = null;

      const handleStateChange = () => {
        const ref = navigationRef.current;
        if (!ref?.getRootState) return;
        const state = ref.getRootState() as NavStateLike | undefined;
        if (!state?.routes?.length) return;

        const stateKey = JSON.stringify({
          index: state.index,
          routeNames: state.routes.map((r) => r.name),
        });
        if (stateKey === lastStateKey) return;
        lastStateKey = stateKey;

        const activeName = getActiveRouteName(state);
        if (activeName == null) return;

        const currentInfo = getActiveRouteInfo(state, getRoutePresentation);
        if (!currentInfo) return;
        const navigatorContext = buildNavigatorContext(
          state,
          getRoutePresentation,
          currentInfo
        );

        if (activeName !== previousScreenName) {
          emitScreenView(
            core,
            activeName,
            previousScreenName,
            navigatorContext
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
        const unsubReady = navigationRef.addListener(
          'ready',
          handleStateChange
        );
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
          handleStateChange();
        }
      } catch {
        // ignore
      }

      return () => {
        for (const u of unsubscribers) u();
        if (interval) clearInterval(interval);
      };
    },
  };
}
