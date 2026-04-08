/**
 * Integración con AppState de React Native.
 * Emite: app_open, app_background, app_foreground, session_start, session_end.
 * Ver docs/auto-analytics-experiment.md
 */

import { AppState, Platform, type AppStateStatus } from 'react-native';
import type { AnalyticsIntegration } from '../types/integration';

type LifecycleSignal = 'enter_background' | 'enter_foreground' | null;

function resolveLifecycleSignal(params: {
  previousState: AppStateStatus;
  nextState: AppStateStatus;
  isIOS: boolean;
}): LifecycleSignal {
  const { previousState, nextState, isIOS } = params;

  if (isIOS) {
    // iOS can transition to inactive for system UI (permissions, alerts, StoreKit).
    // Treat entering background as app exit even if it passes through inactive.
    if (
      (previousState === 'active' || previousState === 'inactive') &&
      nextState === 'background'
    ) {
      return 'enter_background';
    }
    if (previousState === 'background' && nextState === 'active') {
      return 'enter_foreground';
    }
    return null;
  }

  // Keep existing behavior for non-iOS platforms.
  if (nextState === 'active') {
    if (previousState === 'background' || previousState === 'inactive') {
      return 'enter_foreground';
    }
    return null;
  }
  if (nextState === 'background' || nextState === 'inactive') {
    if (previousState === 'active') {
      return 'enter_background';
    }
  }
  return null;
}

export function appStateIntegration(): AnalyticsIntegration {
  return {
    name: 'appState',

    setup(core, _context) {
      let previousState =
        (AppState.currentState as AppStateStatus) ??
        ('active' as AppStateStatus);
      const isIOS = Platform.OS === 'ios';

      // Al montar: si ya estamos activos, es app_open + session_start
      if (previousState === 'active') {
        core.trackEvent({ type: 'app_open' });
        core.trackEvent({ type: 'session_start' });
      }

      const subscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus) => {
          const signal = resolveLifecycleSignal({
            previousState,
            nextState,
            isIOS,
          });

          console.log('[AUTO_ANALYTICS] AppState transition', {
            previousState,
            nextState,
            signal,
            platform: Platform.OS,
          });

          if (signal === 'enter_foreground') {
            core.trackEvent({ type: 'app_foreground' });
            core.trackEvent({ type: 'session_start' });
          } else if (signal === 'enter_background') {
            core.trackEvent({ type: 'app_background' });
            core.trackEvent({ type: 'session_end' });
          }

          if (nextState === 'inactive' || nextState === 'background') {
            core.flush().catch(() => {
              /* fire-and-forget */
            });
          }

          previousState = nextState;
        }
      );

      return () => {
        subscription.remove();
      };
    },
  };
}
