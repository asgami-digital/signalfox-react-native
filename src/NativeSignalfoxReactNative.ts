import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
  getAppVersion(): Promise<string>;
  getAnonymousId(): Promise<string>;
  getDeviceModel(): Promise<string>;
  getOsVersion(): Promise<string>;

  /**
   * Inicia listeners nativos de compras y activa la emisión de eventos hacia JS.
   * Los eventos se publican en el channel `signalfox_purchase_event`.
   */
  startNativePurchaseAnalytics(): Promise<void>;

  /**
   * Detiene listeners nativos de compras.
   */
  stopNativePurchaseAnalytics(): Promise<void>;

  /**
   * Fuerza una reconciliación nativa (ej: re-query de compras activas)
   * que puede emitir `restore_completed`.
   */
  reconcileNativePurchases(): Promise<void>;

  /**
   * Abre una ventana heurística de paywall para inferir `purchase_started`
   * a partir de `inactive` mientras RevenueCatUI está visible.
   */
  beginHeuristicPaywallSession(): Promise<void>;

  /**
   * Cierra la ventana heurística del paywall y devuelve si se observó
   * `inactive` durante su vida y en qué instante ocurrió.
   */
  endHeuristicPaywallSession(): Promise<{
    sawInactiveDuringPaywall?: boolean;
    inactiveAt?: number;
  } | null>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SignalfoxReactNative');
