# @asgami-digital/signalfox-react-native

SignalFox for React Native is the official client library for instrumenting your app with SignalFox.

It helps you track app lifecycle, native modals, native touchables, navigation, and purchase flows with a single imperative `SignalFox.init()` at startup. It also lets you assign stable `signalFoxId` values to the UI elements that matter most, so SignalFox can build a consistent understanding of your app structure over time.

## Links

- Website: https://signalfox.io
- Documentation: https://docs.signalfox.io
- GitHub: https://github.com/asgami-digital/signalfox-react-native

## What This Library Does

Use this library when you want to:

- initialize SignalFox once (for example at app bootstrap or in a root `useEffect`)
- connect your app using your SignalFox API key
- automatically track app lifecycle events
- enable tracking for native modals and native touchables at startup
- add optional integrations such as React Navigation, RevenueCat, or `react-native-iap`
- assign stable `signalFoxId` values to screens, modals, and interactive elements you want SignalFox to understand

## Installation

Install the package:

```sh
npm install @asgami-digital/signalfox-react-native
```

or:

```sh
yarn add @asgami-digital/signalfox-react-native
```

If you use optional integrations, install the corresponding packages in your app as needed:

- `@react-navigation/native`
- `react-native-purchases`
- `react-native-purchases-ui`
- `react-native-iap`

For iOS, run CocoaPods after installing dependencies:

```sh
cd ios && pod install
```

## Quick Start

The basic setup has two steps:

1. apply the startup patches as early as possible
2. call `SignalFox.init({ apiKey, integrations })` once your app boots

### 1. Apply Startup Patches

Call these patch initializers before your app renders, and before importing code that renders React Native `Modal`, `Pressable`, or touchable components.

They enable tracking for native modals and native touchables.

```ts
import {
  applyModalPatch,
  applyTouchablePatch,
} from '@asgami-digital/signalfox-react-native';

applyModalPatch();
applyTouchablePatch();
```

A common place for this is your app entry file, such as `index.js`, using `require()` before loading your app module so the patches run first.

### 2. Initialize SignalFox

Call `SignalFox.init()` after patches are applied. It returns a `Promise` (you can `void` it from an effect or await it during bootstrap).

```tsx
import { useEffect } from 'react';
import { SignalFox } from '@asgami-digital/signalfox-react-native';
import App from './src/App';

export default function Root() {
  useEffect(() => {
    void SignalFox.init({ apiKey: 'YOUR_SIGNALFOX_API_KEY' });
  }, []);

  return <App />;
}
```

You can also start initialization from your entry file (after patches), without React:

```ts
void SignalFox.init({ apiKey: 'YOUR_SIGNALFOX_API_KEY' });
```

## Initialization options

`SignalFox.init` accepts:

- `apiKey`: your SignalFox API key
- `logOnly`: optional boolean for local or debug-only usage
- `integrations`: optional array of extra integrations

Basic example:

```ts
await SignalFox.init({ apiKey: 'YOUR_SIGNALFOX_API_KEY' });
```

Example with optional integrations:

```tsx
import { useEffect } from 'react';
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { navigationRef } from './navigation';

import {
  SignalFox,
  reactNavigationIntegration,
  revenueCatIntegration,
} from '@asgami-digital/signalfox-react-native';

useEffect(() => {
  void SignalFox.init({
    apiKey: 'YOUR_SIGNALFOX_API_KEY',
    integrations: [
      reactNavigationIntegration({ navigationRef }),
      revenueCatIntegration({
        purchases: Purchases,
        revenueCatUI: RevenueCatUI,
      }),
    ],
  });
}, []);
```

Calling `init` again with the same effective configuration is a no-op. A second `init` with a different `apiKey`, `logOnly`, or integration set is ignored (with a console warning). Concurrent `init` calls share a single in-flight setup.

Use `SignalFox.destroy()` only when you need to tear down the SDK in the same JS process (for example in tests).

The runtime already includes default integrations for app lifecycle, native modals, and native touchables. You do not need to pass those manually.

## Optional Integrations

You can extend SignalFox with optional integrations depending on the libraries your app uses.

### React Navigation

Use `reactNavigationIntegration` if your app uses `@react-navigation/native`.

```tsx
import { useEffect } from 'react';
import {
  SignalFox,
  reactNavigationIntegration,
} from '@asgami-digital/signalfox-react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';

const navigationRef = createNavigationContainerRef();

export function Root() {
  useEffect(() => {
    void SignalFox.init({
      apiKey: 'YOUR_SIGNALFOX_API_KEY',
      integrations: [reactNavigationIntegration({ navigationRef })],
    });
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>{/* app */}</NavigationContainer>
  );
}
```

### Expo Router

Use `expoRouterIntegration` if your app uses Expo Router.

```tsx
import { useEffect, useMemo } from 'react';
import { Stack, useNavigationContainerRef } from 'expo-router';
import {
  SignalFox,
  expoRouterIntegration,
} from '@asgami-digital/signalfox-react-native';

export default function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  const integrations = useMemo(
    () => [expoRouterIntegration({ navigationRef })],
    [navigationRef]
  );

  useEffect(() => {
    void SignalFox.init({
      apiKey: 'YOUR_SIGNALFOX_API_KEY',
      integrations,
    });
  }, [integrations]);

  return <Stack />;
}
```

### RevenueCat

Use `revenueCatIntegration` if your app uses `react-native-purchases`.

If you also use `react-native-purchases-ui`, pass `revenueCatUI` as well.

```tsx
import { useEffect } from 'react';
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import {
  SignalFox,
  revenueCatIntegration,
} from '@asgami-digital/signalfox-react-native';

useEffect(() => {
  void SignalFox.init({
    apiKey: 'YOUR_SIGNALFOX_API_KEY',
    integrations: [
      revenueCatIntegration({
        purchases: Purchases,
        revenueCatUI: RevenueCatUI,
      }),
    ],
  });
}, []);
```

### react-native-iap

Use `reactNativeIapIntegration` if your app uses `react-native-iap`.

```tsx
import { useEffect } from 'react';
import * as ReactNativeIap from 'react-native-iap';
import {
  SignalFox,
  reactNativeIapIntegration,
} from '@asgami-digital/signalfox-react-native';

useEffect(() => {
  void SignalFox.init({
    apiKey: 'YOUR_SIGNALFOX_API_KEY',
    integrations: [
      reactNativeIapIntegration({
        reactNativeIap: ReactNativeIap,
      }),
    ],
  });
}, []);
```

## `signalFoxId` Requirements

To make touchable and modal tracking reliable, you must add a unique `signalFoxId` to every native touchable and every native modal you want SignalFox to track.

A good `signalFoxId` should be:

- unique within the app
- stable over time
- descriptive enough to identify the UI element or modal purpose

Good examples:

- `checkout-pay-button`
- `settings-delete-account-button`
- `purchase-paywall-modal`
- `profile-edit-photo-button`

Avoid:

- duplicated IDs
- random values generated on render
- IDs that change between builds for the same UI element

### Touchable Example

```tsx
<Pressable signalFoxId="checkout-pay-button" onPress={handlePay}>
  <Text>Pay now</Text>
</Pressable>
```

```tsx
<TouchableOpacity
  signalFoxId="profile-edit-photo-button"
  onPress={handleEditPhoto}
>
  <Text>Edit photo</Text>
</TouchableOpacity>
```

### Modal Example

```tsx
<Modal
  visible={isOpen}
  signalFoxId="purchase-paywall-modal"
  onRequestClose={handleClose}
>
  {/* modal content */}
</Modal>
```

You can also provide `signalFoxDisplayName` when you want a separate human-readable label, but `signalFoxId` is the required identifier.

## Manual Tracking

Most tracking is automatic once the patches and integrations are set up. Use these methods only for UI surfaces that are not covered automatically.

### Funnel Step

Use `SignalFox.trackFunnelStep()` for explicit product or onboarding funnel milestones.

```ts
import { SignalFox } from '@asgami-digital/signalfox-react-native';

SignalFox.trackFunnelStep({
  funnelName: 'checkout',
  signalFoxNodeId: 'checkout-plan-selected',
  signalFoxNodeDisplayName: 'Plan selected',
  stepIndex: 1,
});
```

Parameters:

- `funnelName`: public funnel name
- `signalFoxNodeId`: stable node identifier
- `signalFoxNodeDisplayName`: optional human-readable label
- `stepIndex`: optional numeric order

### Subview

Use `SignalFox.trackSubview()` when a meaningful area inside the current screen becomes active.

```ts
SignalFox.trackSubview({
  signalFoxNodeId: 'settings-billing-panel',
  signalFoxNodeDisplayName: 'Billing panel',
});
```

Parameters:

- `signalFoxNodeId`: stable node identifier
- `signalFoxNodeDisplayName`: optional human-readable label

### Manual Modal Surface

If part of your UI behaves like a modal but does not use the native React Native `Modal`, you can track it manually with the same modal event family:

```ts
import { SignalFox } from '@asgami-digital/signalfox-react-native';

SignalFox.trackModalShown({
  signalFoxNodeId: 'export-sheet',
  signalFoxNodeDisplayName: 'Export Sheet',
  visible: true,
});

SignalFox.trackModalShown({
  signalFoxNodeId: 'export-sheet',
  signalFoxNodeDisplayName: 'Export Sheet',
  visible: false,
});
```

When `visible` is `true`, SignalFox emits `modal_open`. When `visible` is `false`, it emits `modal_close` only if that modal is currently present in the modal stack.

Parameters:

- `visible`: whether the modal-like surface is currently shown
- `signalFoxNodeId`: stable node identifier
- `signalFoxNodeDisplayName`: optional human-readable label

## Recommended App Startup Shape

A practical setup usually looks like this:

```js
// index.js
const { AppRegistry } = require('react-native');
const signalFox = require('@asgami-digital/signalfox-react-native');

signalFox.applyModalPatch();
signalFox.applyTouchablePatch();

const App = require('./src/App').default;
const { name: appName } = require('./app.json');

AppRegistry.registerComponent(appName, () => App);
```

```tsx
// src/App.tsx
import { useEffect } from 'react';
import {
  SignalFox,
  reactNavigationIntegration,
} from '@asgami-digital/signalfox-react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';

const navigationRef = createNavigationContainerRef();

export default function App() {
  useEffect(() => {
    void SignalFox.init({
      apiKey: 'YOUR_SIGNALFOX_API_KEY',
      integrations: [reactNavigationIntegration({ navigationRef })],
    });
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      {/* screens */}
    </NavigationContainer>
  );
}
```

## Public API Used Most Often

Most apps only need:

- `SignalFox.init(...)` (or the `SignalFox` namespace object with the same methods)
- `applyModalPatch()`
- `applyTouchablePatch()`
- `reactNavigationIntegration(...)` when using React Navigation
- `expoRouterIntegration(...)` when using Expo Router
- `revenueCatIntegration(...)` when using RevenueCat
- `reactNativeIapIntegration(...)` when using `react-native-iap`
- `SignalFox.trackFunnelStep(...)`, `SignalFox.trackSubview(...)`, or `SignalFox.trackModalShown(...)` for manual cases

## Contributing

- [Development workflow](./CONTRIBUTING.md#development-workflow)
- [Sending a pull request](./CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](./CODE_OF_CONDUCT.md)

## License

MIT
