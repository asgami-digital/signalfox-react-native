# @asgami-digital/signalfox-react-native

SignalFox for React Native helps you instrument app analytics with a provider-first setup and optional integrations for navigation and purchases.

It is designed to work with React Native apps that want a simple initialization flow, automatic lifecycle tracking, and a consistent way to identify native touchables and modals.

## What It Is For

Use this library when you want to:

- initialize SignalFox once at the app root
- attach your SignalFox API key
- enable optional integrations such as React Navigation, RevenueCat, or `react-native-iap`
- intercept native modal and touchable events through startup patches
- assign stable, unique `signalFoxId` values to UI elements you want to track

## Installation

Install the library:

```sh
npm install @asgami-digital/signalfox-react-native
```

or:

```sh
yarn add @asgami-digital/signalfox-react-native
```

If you use optional integrations, install the packages you need in your app as well:

- `@react-navigation/native`
- `react-native-purchases`
- `react-native-purchases-ui`
- `react-native-iap`

For iOS apps, run CocoaPods after installing dependencies:

```sh
cd ios && pod install
```

## Quick Start

There are two pieces to the basic setup:

1. apply the native patches at app startup
2. wrap your app with `SignalFoxProvider`

### 1. Apply Native Patches

Call these patch initializers as early as possible, before your app renders.

They are used to intercept native modal and touchable events.

```ts
import {
  applyModalPatch,
  applyTouchablePatch,
} from '@asgami-digital/signalfox-react-native';

applyModalPatch();
applyTouchablePatch();
```

A common place for this is your entry file, such as `index.js` or a bootstrap module imported from it.

### 2. Initialize the Provider

Wrap your application with `SignalFoxProvider` and provide your SignalFox API key.

```tsx
import React from 'react';
import { SignalFoxProvider } from '@asgami-digital/signalfox-react-native';
import { App } from './src/App';

export default function Root() {
  return (
    <SignalFoxProvider apiKey="YOUR_SIGNALFOX_API_KEY">
      <App />
    </SignalFoxProvider>
  );
}
```

## Provider Configuration

`SignalFoxProvider` accepts:

- `apiKey`: your SignalFox API key
- `logOnly`: optional boolean for local/debug usage
- `integrations`: optional array of extra integrations

Basic example:

```tsx
<SignalFoxProvider apiKey="YOUR_SIGNALFOX_API_KEY">
  <App />
</SignalFoxProvider>
```

Example with optional integrations:

```tsx
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
</SignalFoxProvider>
```

The provider already includes its internal default integrations for app lifecycle, native modals, and native touchables. You do not need to pass those manually.

## Optional Integrations

The library supports optional integrations that you can pass through the provider.

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

This ID should be:

- unique within the app
- stable over time
- readable enough to identify the UI element or modal purpose

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
