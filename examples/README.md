# Examples

Este repo ahora mantiene dos apps de ejemplo separadas:

- `examples/rn-revenuecat`: React Native CLI + React Navigation + RevenueCat
- `examples/expo-rniap`: Expo Router + react-native-iap

Ambas están pensadas para probar:

- navegación
- modales
- clicks / interacción
- compras

## Estructura

### `rn-revenuecat`

- `HomeScreen`
- `PurchaseManualScreen`
- `PurchasePaywallUIScreen`
- `PurchasePresentPaywallScreen`
- `ModalExampleScreen`
- `NavigationModalScreen`

### `expo-rniap`

- `Home`
- `PurchaseScreen`
- `ModalExample`
- `SecondaryFlowScreen`
- `NavigationModal`

## Linking local

- `rn-revenuecat` usa `react-native.config.js`, `babel.config.js` y `metro.config.js` para apuntar al paquete local del repo.
- `expo-rniap` usa `metro.config.js`, `tsconfig.json` y la dependencia local `file:../..` para resolver `@asgami-digital/signalfox-react-native`.

## Verificación hecha

- `react-native config` en `examples/rn-revenuecat` detecta correctamente la librería local.
- `expo config` y `expo prebuild --no-install` funcionan en `examples/expo-rniap`.
- TypeScript pasa en la librería raíz y en `examples/expo-rniap`.
