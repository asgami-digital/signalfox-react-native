/**
 * API imperativa: init único por proceso, cola hasta que el core esté listo,
 * y protección frente a init concurrente o repetido con distinta configuración.
 */

import { AnalyticsCore } from '../core/AnalyticsCore';
import { isDevApiKey } from '../core/constants';
import { appStateIntegration } from '../integrations/appStateIntegration';
import { EXPO_ROUTER_INTEGRATION_NAME } from '../integrations/expoRouterIntegration';
import { reactNativeModalPatchIntegration } from '../integrations/reactNativeModalPatch';
import { reactNativeTouchablePatchIntegration } from '../integrations/reactNativeTouchablePatch';
import {
  trackModalShown as emitTrackModalShown,
  type TrackModalShownParams,
} from '../purchase/purchaseAnalyticsBridge';
import { sortIntegrationsForSetup } from '../utils/sortIntegrationsForSetup';
import type { AnalyticsIntegration } from '../types/integration';
import type { FunnelStepParams, SubviewParams } from '../types/events';

export interface SignalFoxInitOptions {
  apiKey: string;
  logOnly?: boolean;
  /** Se fusionan con las integraciones internas (AppState, modal patch, touchable patch). */
  integrations?: AnalyticsIntegration[];
}

function buildDefaultIntegrations(): AnalyticsIntegration[] {
  return [
    appStateIntegration(),
    reactNativeModalPatchIntegration(),
    reactNativeTouchablePatchIntegration(),
  ];
}

function mergeIntegrations(
  integrations: readonly AnalyticsIntegration[]
): AnalyticsIntegration[] {
  const merged = [...buildDefaultIntegrations(), ...integrations];
  const seenNames = new Set<string>();

  return merged.filter((integration) => {
    if (seenNames.has(integration.name)) {
      return false;
    }
    seenNames.add(integration.name);
    return true;
  });
}

function integrationSignature(integrations: readonly AnalyticsIntegration[]) {
  return mergeIntegrations(integrations)
    .map((i) => i.name)
    .join('\0');
}

function makeConfigSignature(options: SignalFoxInitOptions): string {
  const logOnly = options.logOnly ?? false;
  const names = integrationSignature(options.integrations ?? []);
  return `${options.apiKey}\0${logOnly}\0${names}`;
}

let coreRef: AnalyticsCore | null = null;
const pendingRef: (() => void)[] = [];
let cleanupRef: (() => void)[] = [];
let activeInit: Promise<void> | null = null;
let completedSignature: string | null = null;

function flushPending(): void {
  const core = coreRef;
  if (!core) return;
  const batch = pendingRef.splice(0, pendingRef.length);
  for (const run of batch) {
    run();
  }
}

async function runSetup(options: SignalFoxInitOptions): Promise<void> {
  const apiKey = options.apiKey;
  const logOnly = options.logOnly ?? false;

  const instance = new AnalyticsCore({
    apiKey,
    logOnly,
  });

  await instance.init();

  coreRef = instance;
  instance.startSession();

  const rawList = mergeIntegrations(options.integrations ?? []);
  const list = sortIntegrationsForSetup(rawList);
  const setupContext = { allIntegrations: list } as const;
  const hasNavigationIntegration = list.some(
    (integration) =>
      integration.name === 'reactNavigation' ||
      integration.name === EXPO_ROUTER_INTEGRATION_NAME
  );
  if (hasNavigationIntegration) {
    instance.markNavigationIntentPending?.();
  }

  cleanupRef = list.map((integration) =>
    integration.setup(instance, setupContext)
  );

  flushPending();

  if (!isDevApiKey(apiKey)) {
    instance.startFlushTimer();
  }

  completedSignature = makeConfigSignature(options);
}

/**
 * Inicializa SignalFox una sola vez por configuración efectiva.
 * Llamadas concurrentes comparten la misma promesa; misma config tras completar es no-op;
 * config distinta tras éxito se ignora (aviso en consola).
 */
export async function init(options: SignalFoxInitOptions): Promise<void> {
  const sig = makeConfigSignature(options);

  if (coreRef && completedSignature === sig) {
    return;
  }
  if (coreRef && completedSignature !== null && completedSignature !== sig) {
    console.warn(
      '[SignalFox] init() ignorado: ya inicializado con otra configuración (apiKey, logOnly o integraciones).'
    );
    return;
  }

  while (activeInit) {
    await activeInit;
  }

  if (coreRef && completedSignature === sig) {
    return;
  }
  if (coreRef && completedSignature !== null && completedSignature !== sig) {
    console.warn(
      '[SignalFox] init() ignorado: ya inicializado con otra configuración (apiKey, logOnly o integraciones).'
    );
    return;
  }

  activeInit = runSetup(options)
    .catch((error) => {
      console.warn('[SignalFox] init() falló', error);
      teardownAfterFailedSetup();
      throw error;
    })
    .finally(() => {
      activeInit = null;
    });

  return activeInit;
}

function teardownAfterFailedSetup(): void {
  cleanupRef.forEach((cleanup) => cleanup());
  cleanupRef = [];
  coreRef?.destroy();
  coreRef = null;
  pendingRef.length = 0;
  completedSignature = null;
}

/**
 * Solo para tests o entornos que necesiten reiniciar el SDK en el mismo proceso.
 */
export function destroy(): void {
  cleanupRef.forEach((cleanup) => cleanup());
  cleanupRef = [];
  coreRef?.destroy();
  coreRef = null;
  pendingRef.length = 0;
  completedSignature = null;
  activeInit = null;
}

export function trackFunnelStep(params: FunnelStepParams): void {
  if (coreRef === null) {
    pendingRef.push(() => coreRef?.trackFunnelStep(params));
    return;
  }
  coreRef.trackFunnelStep(params);
}

export function trackSubview(params: SubviewParams): void {
  if (coreRef === null) {
    pendingRef.push(() => coreRef?.trackSubview(params));
    return;
  }
  coreRef.trackSubview(params);
}

export function trackModalShown(params: TrackModalShownParams): void {
  emitTrackModalShown(params);
}

export const SignalFox = {
  init,
  destroy,
  trackFunnelStep,
  trackSubview,
  trackModalShown,
};

export type SignalFoxApi = {
  init: typeof init;
  destroy: typeof destroy;
  trackFunnelStep: typeof trackFunnelStep;
  trackSubview: typeof trackSubview;
  trackModalShown: typeof trackModalShown;
};
