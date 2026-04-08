/**
 * Provider de auto-analytics. Inicializa el core, registra integraciones y expone track vía context.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { AnalyticsCore } from '../core/AnalyticsCore';
import { isDevApiKey } from '../core/constants';
import { appStateIntegration } from '../integrations/appStateIntegration';
import { nativePurchaseIntegration } from '../integrations/nativePurchaseIntegration';
import { reactNativeModalPatchIntegration } from '../integrations/reactNativeModalPatch';
import type { AnalyticsIntegration } from '../types/integration';
import type { AnalyticsEventType } from '../types/events';
import type { FlowStepParams } from '../types/events';
import type { SubviewParams } from '../types/events';

export interface SignalFoxProviderProps {
  apiKey: string;
  logOnly?: boolean;
  integrations?: AnalyticsIntegration[];
  children: React.ReactNode;
}

export interface SignalFoxContextValue {
  track: (name: string, properties?: Record<string, unknown>) => void;
  trackStep: (params: FlowStepParams) => void;
  trackSubview: (params: SubviewParams) => void;
  /** Solo para casos avanzados; las integraciones usan el core directamente. */
  trackEvent: (
    event: { type: AnalyticsEventType } & Record<string, unknown>
  ) => void;
  /** @deprecated usar track() */
  sendEvent: (name: string, properties: Record<string, unknown>) => void;
}

const SignalFoxContext = createContext<SignalFoxContextValue | null>(null);

export function SignalFoxProvider({
  apiKey,
  logOnly = false,
  integrations = [],
  children,
}: SignalFoxProviderProps): React.JSX.Element {
  const coreRef = useRef<AnalyticsCore | null>(null);
  const pendingRef = useRef<(() => void)[]>([]);
  const cleanupRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    let isCancelled = false;

    const flushPending = () => {
      const core = coreRef.current;
      if (!core) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      for (const run of batch) {
        run();
      }
    };

    const setup = async () => {
      const instance = new AnalyticsCore({
        apiKey,
        logOnly,
      });

      coreRef.current = instance;
      instance.startSession();

      await instance.init();
      if (isCancelled) {
        instance.destroy();
        coreRef.current = null;
        pendingRef.current = [];
        return;
      }

      flushPending();

      if (!isDevApiKey(apiKey)) {
        instance.startFlushTimer();
      }

      const list =
        integrations.length > 0
          ? integrations
          : [
              appStateIntegration(),
              nativePurchaseIntegration(),
              reactNativeModalPatchIntegration(),
            ];
      const setupContext = { allIntegrations: list } as const;
      cleanupRef.current = list.map((integration) =>
        integration.setup(instance, setupContext)
      );
    };

    setup().catch((error) => {
      console.warn('[SignalFoxProvider] setup failed', error);
    });

    return () => {
      isCancelled = true;
      cleanupRef.current.forEach((cleanup) => cleanup());
      cleanupRef.current = [];
      coreRef.current?.destroy();
      coreRef.current = null;
      pendingRef.current = [];
    };
  }, [apiKey, logOnly, integrations]);

  const stableValue = useMemo<SignalFoxContextValue>(
    () => ({
      track: (name: string, properties?: Record<string, unknown>) => {
        if (coreRef.current === null) {
          pendingRef.current.push(() =>
            coreRef.current?.track(name, properties)
          );
          return;
        }
        coreRef.current.track(name, properties);
      },
      trackStep: (params: FlowStepParams) => {
        if (coreRef.current === null) {
          pendingRef.current.push(() => coreRef.current?.trackStep(params));
          return;
        }
        coreRef.current.trackStep(params);
      },
      trackSubview: (params: SubviewParams) => {
        if (coreRef.current === null) {
          pendingRef.current.push(() => coreRef.current?.trackSubview(params));
          return;
        }
        coreRef.current.trackSubview(params);
      },
      trackEvent: (event: { type: string } & Record<string, unknown>) => {
        const typed = event as {
          type: AnalyticsEventType;
        } & Record<string, unknown>;
        if (coreRef.current === null) {
          pendingRef.current.push(() => coreRef.current?.trackEvent(typed));
          return;
        }
        coreRef.current.trackEvent(typed);
      },
      sendEvent: (name: string, properties: Record<string, unknown>) => {
        if (coreRef.current === null) {
          pendingRef.current.push(() =>
            coreRef.current?.sendEvent?.(name, properties)
          );
          return;
        }
        coreRef.current.sendEvent(name, properties);
      },
    }),
    []
  );

  return (
    <SignalFoxContext.Provider value={stableValue}>
      {children}
    </SignalFoxContext.Provider>
  );
}

export function useSignalFox(): SignalFoxContextValue | null {
  return useContext(SignalFoxContext);
}
