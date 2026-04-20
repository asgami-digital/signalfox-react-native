# Examples

This repo now contains two separate example apps:

- `examples/rn-revenuecat`: React Native CLI + React Navigation + RevenueCat
- `examples/expo-rniap`: Expo Router + react-native-iap

Both are intended to test:

- navigation
- modals
- clicks / interaction
- purchases

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

- `rn-revenuecat` uses `react-native.config.js`, `babel.config.js`, and `metro.config.js` to point to the local package in the repo.
- `expo-rniap` uses `metro.config.js`, `tsconfig.json`, and the `workspace:*` dependency to resolve `@asgami-digital/signalfox-react-native`.

## Verification Performed

- `react-native config` in `examples/rn-revenuecat` correctly detects the local library.
- `expo config` and `expo prebuild --no-install` work in `examples/expo-rniap`.
- TypeScript passes in the root library and in `examples/expo-rniap`.
