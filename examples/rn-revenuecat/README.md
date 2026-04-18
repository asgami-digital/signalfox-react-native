# rn-revenuecat

React Native CLI example for testing SignalFox with:

- React Navigation stack
- RevenueCat (`react-native-purchases`)
- RevenueCat UI (`react-native-purchases-ui`)
- native modal and navigation modal

## Screens

- `Home`
- `PurchaseManual`
- `PurchasePaywallUI`
- `PurchasePresentPaywall`
- `ModalExample`
- `NavigationModal`

## Run

From the repo root:

```sh
yarn example:rn-revenuecat
```

En otra terminal:

```sh
yarn example:rn-revenuecat:ios
```

o:

```sh
yarn example:rn-revenuecat:android
```

## Pending Manual Configuration

1. Copy `examples/rn-revenuecat/.env.example` to `examples/rn-revenuecat/.env`
2. Fill in `SIGNALFOX_EXAMPLE_API_KEY`
3. Fill in `RN_REVENUECAT_API_KEY`
4. Replace the placeholders in `src/config/demoConfig.ts`

Placeholders:

- `REPLACE_WITH_REVENUECAT_PRODUCT_ID`
- `REPLACE_WITH_REVENUECAT_ENTITLEMENT_ID`

## Notes

- The embedded paywall uses `RevenueCatUI.Paywall`.
- The modal flow uses `RevenueCatUI.presentPaywall()` and leaves the `presentPaywallIfNeeded()` variant ready.
- Basic navigation, click, and purchase logs were added to the console.
- The example resolves `@asgami-digital/signalfox-react-native` from the repo root via local dependency plus TypeScript path mapping.
