# @asgami-digital/signalfox-react-native

SignalFox for React Native is the official client library for instrumenting your app with SignalFox.

It helps you track app lifecycle, native modals, native touchables, navigation, and purchase flows with a simple provider-based setup. It also lets you assign stable `signalFoxId` values to the UI elements that matter most, so SignalFox can build a consistent understanding of your app structure over time.

## Links

- Website: https://signalfox.io
- Documentation: https://docs.signalfox.io
- GitHub: https://github.com/TU-USUARIO/TU-REPO

## What This Library Does

Use this library when you want to:

- initialize SignalFox once at the app root
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
2. wrap your app with `SignalFoxProvider`

### 1. Apply Startup Patches

Call these patch initializers before your app renders.

They enable tracking for native modals and native touchables.

```ts
import {
  applyModalPatch,
  applyTouchablePatch,
} from '@asgami-digital/signalfox-react-native';

applyModalPatch();
applyTouchablePatch();
```

A common place for this is your app entry file, such as `index.js`, or a bootstrap module imported from it.

### 2. Wrap Your App with `SignalFoxProvider`

Wrap your application with `SignalFoxProvider` and pass your SignalFox API key.

```tsx
import React from 'react';
import { SignalFoxProvider } from '@asgami-digital/signalfox-react-native';
import App from './src/App';

export default function Root() {
  return (
    <SignalFoxProvider apiKey="YOUR_SIGNALFOX_API_KEY">
      <App />
    </SignalFoxProvider>
  );
}
```

## Provider Configuration

`SignalFoxProvider` accepts the following main props:

- `apiKey`: your SignalFox API key
- `logOnly`: optional boolean for local or debug-only usage
- `integrations`: optional array of extra integrations

Basic example:

```tsx
<SignalFoxProvider apiKey="YOUR_SIGNALFOX_API_KEY">
  <App />
</SignalFoxProvider>
```

Example with optional integrations:

```tsx
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { navigationRef } from './navigation';

import {
  SignalFoxProvider,
  reactNavigationIntegration,
  revenueCatIntegration,
} from '@asgami-digital/signalfox-react-native';

<SignalFoxProvider
  apiKey="YOUR_SIGNALFOX_API_KEY"
  integrations={[
    reactNavigationIntegration({ navigationRef }),
    revenueCatIntegration({
      purchases: Purchases,
      revenueCatUI: RevenueCatUI,
    }),
  ]}
>
  <App />
</SignalFoxProvider>;
```

The provider already includes its internal default integrations for app lifecycle, native modals, and native touchables. You do not need to pass those manually.

## Optional Integrations

You can extend SignalFox with optional integrations depending on the libraries your app uses.

### React Navigation

Use `reactNavigationIntegration` if your app uses `@react-navigation/native`.

```tsx
import {
  SignalFoxProvider,
  reactNavigationIntegration,
} from '@asgami-digital/signalfox-react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';

const navigationRef = createNavigationContainerRef();

export function Root() {
  return (
    <SignalFoxProvider
      apiKey="YOUR_SIGNALFOX_API_KEY"
      integrations={[reactNavigationIntegration({ navigationRef })]}
    >
      <NavigationContainer ref={navigationRef}>
        {/* app */}
      </NavigationContainer>
    </SignalFoxProvider>
  );
}
```

### RevenueCat

Use `revenueCatIntegration` if your app uses `react-native-purchases`.

If you also use `react-native-purchases-ui`, pass `revenueCatUI` as well.

```tsx
import Purchases from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import {
  SignalFoxProvider,
  revenueCatIntegration,
} from '@asgami-digital/signalfox-react-native';

<SignalFoxProvider
  apiKey="YOUR_SIGNALFOX_API_KEY"
  integrations={[
    revenueCatIntegration({
      purchases: Purchases,
      revenueCatUI: RevenueCatUI,
    }),
  ]}
>
  <App />
</SignalFoxProvider>;
```

### react-native-iap

Use `reactNativeIapIntegration` if your app uses `react-native-iap`.

```tsx
import * as ReactNativeIap from 'react-native-iap';
import {
  SignalFoxProvider,
  reactNativeIapIntegration,
} from '@asgami-digital/signalfox-react-native';

<SignalFoxProvider
  apiKey="YOUR_SIGNALFOX_API_KEY"
  integrations={[
    reactNativeIapIntegration({
      reactNativeIap: ReactNativeIap,
    }),
  ]}
>
  <App />
</SignalFoxProvider>;
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

## Recommended App Startup Shape

A practical setup usually looks like this:

```ts
// index.js
import { AppRegistry } from 'react-native';
import {
  applyModalPatch,
  applyTouchablePatch,
} from '@asgami-digital/signalfox-react-native';
import App from './src/App';
import { name as appName } from './app.json';

applyModalPatch();
applyTouchablePatch();

AppRegistry.registerComponent(appName, () => App);
```

```tsx
// src/App.tsx
import React from 'react';
import {
  SignalFoxProvider,
  reactNavigationIntegration,
} from '@asgami-digital/signalfox-react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';

const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <SignalFoxProvider
      apiKey="YOUR_SIGNALFOX_API_KEY"
      integrations={[reactNavigationIntegration({ navigationRef })]}
    >
      <NavigationContainer ref={navigationRef}>
        {/* screens */}
      </NavigationContainer>
    </SignalFoxProvider>
  );
}
```

## Public API Used Most Often

Most apps only need:

- `SignalFoxProvider`
- `applyModalPatch()`
- `applyTouchablePatch()`
- `reactNavigationIntegration(...)` when using React Navigation
- `revenueCatIntegration(...)` when using RevenueCat
- `reactNativeIapIntegration(...)` when using `react-native-iap`

## Contributing

- [Development workflow](./CONTRIBUTING.md#development-workflow)
- [Sending a pull request](./CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](./CODE_OF_CONDUCT.md)

## License

MIT
