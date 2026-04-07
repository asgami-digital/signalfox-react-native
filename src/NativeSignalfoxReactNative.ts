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
}

export default TurboModuleRegistry.getEnforcing<Spec>('SignalfoxReactNative');
