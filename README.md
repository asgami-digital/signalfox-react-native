# @asgami-digital/signalfox-react-native

Official React Native SDK for SignalFox.

SignalFox helps you understand how users move through your app by automatically tracking lifecycle events, navigation, modals, touch interactions, and purchase flows. You can also add stable `signalFoxNodeId` values to the screens, modals, buttons, and meaningful UI elements you care about, so SignalFox can build a consistent map of your app structure over time.

That structured data can then be used by SignalFox to power AI-assisted analysis, including suggested funnels, drop-off explanations, monetization insights, and clearer summaries of how users interact with your app.

## Links

- Website: https://signalfox.io
- Documentation: https://docs.signalfox.io
- GitHub: https://github.com/asgami-digital/signalfox-react-native

## What the SDK Tracks

SignalFox can track the following automatically after setup:

- app lifecycle and session events
- React Native `Modal` open and close events
- native touchable and pressable interactions
- screen navigation through React Navigation or Expo Router
- purchase events through RevenueCat or `react-native-iap`

You can also use manual tracking methods for custom flows, subviews, and modal-like surfaces that are not covered by the automatic integrations.


## AI-Assisted App Analytics

SignalFox is designed to collect analytics in a way that is understandable not only as raw events, but also as app structure.

By combining automatic tracking with stable `signalFoxNodeId` values, SignalFox can understand which screens, modals, buttons, flows, and purchase actions matter in your app. This gives the platform better context for AI-assisted features such as:

- detecting likely funnels from real user behavior
- explaining where users drop off and what they did before leaving
- identifying important purchase origins and conversion paths
- summarizing navigation patterns, friction points, and unusual behavior
- helping teams understand the app without manually building every report from scratch

The SDK does not require you to write AI prompts or manually describe your app. Your job is to install the SDK, enable the integrations you use, and add meaningful `signalFoxNodeId` values where they provide useful product context.


## Installation

Install the SDK with npm:

```sh
npm install @asgami-digital/signalfox-react-native
```

Or with Yarn:

```sh
yarn add @asgami-digital/signalfox-react-native
```

If you plan to use optional integrations, make sure the corresponding packages are also installed in your app:

- `@react-navigation/native`
- `expo-router`
- `react-native-purchases`
- `react-native-purchases-ui`
- `react-native-iap`

For iOS projects, install pods after adding the dependencies:

```sh
cd ios && pod install
```

## Quick Start

A typical setup has two parts:

1. apply the startup patches before your app renders
2. initialize SignalFox once when your app starts

### 1. Apply Startup Patches

Call the patch functions as early as possible, before rendering your app and before importing code that renders React Native `Modal`, `Pressable`, or touchable components.

```ts
import {
  applyModalPatch,
  applyTouchablePatch,
} from '@asgami-digital/signalfox-react-native';

applyModalPatch();
applyTouchablePatch();
```

The safest place to do this is usually your app entry file, such as `index.js`, before loading your root app module.

### 2. Initialize SignalFox

Call `SignalFox.init()` once after the patches have been applied.

```tsx
import { useEffect } from 'react';
import { SignalFox } from '@asgami-digital/signalfox-react-native';
import App from './src/App';

export default function Root() {
  useEffect(() => {
    void SignalFox.init({
      apiKey: 'YOUR_SIGNALFOX_API_KEY',
    });
  }, []);

  return <App />;
}
```

You can also initialize SignalFox directly from your entry file:

```ts
void SignalFox.init({
  apiKey: 'YOUR_SIGNALFOX_API_KEY',
});
```

## Initialization Options

`SignalFox.init()` accepts the following options:

| Option | Required | Description |
| --- | --- | --- |
| `apiKey` | Yes | Your SignalFox API key. |
| `logOnly` | No | Enables local/debug-only logging without sending events. |
| `integrations` | No | Additional integrations such as navigation or purchase tracking. |

Basic example:

```ts
await SignalFox.init({
  apiKey: 'YOUR_SIGNALFOX_API_KEY',
});
```

Example with integrations:

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

Calling `SignalFox.init()` multiple times with the same effective configuration is safe and treated as a no-op. If it is called again with a different `apiKey`, `logOnly` value, or integration set, the second call is ignored and a warning is printed to the console. Concurrent calls share the same in-flight initialization.

Use `SignalFox.destroy()` only when you need to tear down the SDK within the same JavaScript process, such as in tests.

App lifecycle, native modal tracking, and native touchable tracking are included by default once the SDK is initialized and the startup patches have been applied. You do not need to pass them as integrations.

## Optional Integrations

Use optional integrations to connect SignalFox with the navigation and purchase libraries already used by your app.

### React Navigation

Use `reactNavigationIntegration()` if your app uses `@react-navigation/native`.

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
    <NavigationContainer ref={navigationRef}>
      {/* app */}
    </NavigationContainer>
  );
}
```

### Expo Router

Use `expoRouterIntegration()` if your app uses Expo Router.

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

Use `revenueCatIntegration()` if your app uses `react-native-purchases`.

If your app also uses RevenueCat Paywalls through `react-native-purchases-ui`, pass `revenueCatUI` as well.

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

Use `reactNativeIapIntegration()` if your app uses `react-native-iap`.

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

## Using `signalFoxNodeId`

Add `signalFoxNodeId` to the UI elements that are analytically meaningful for your app, such as important buttons, modals, paywalls, forms, onboarding steps, purchase actions, and key settings actions.

You do not need to add `signalFoxNodeId` to every single component. For example, purely decorative elements, loading modals, processing states, or buttons with no analytical value can usually be left untracked.

A good `signalFoxNodeId` should be:

- stable over time
- descriptive of the element's purpose
- unique enough to identify the action or surface being tracked
- consistent across app versions when the same element keeps the same meaning

Good examples:

- `checkout-pay-button`
- `settings-delete-account-button`
- `purchase-paywall-modal`
- `profile-edit-photo-button`
- `onboarding-plan-selected`

Avoid IDs that are:

- randomly generated at render time
- based on unstable array indexes
- changed between builds for the same UI element
- duplicated across unrelated actions or surfaces

For repeated components with the same analytical meaning, you may reuse the same ID when that is intentional. For example, a list of many filter buttons could use a shared ID such as `filter-changed` if you only care that a filter was changed, not which exact button rendered it. If each item has a distinct business meaning, use distinct IDs.

You can also provide `signalFoxNodeDisplayName` when you want a more human-readable label in SignalFox while keeping the ID stable for tracking.

### Touchable Example

```tsx
<Pressable signalFoxNodeId="checkout-pay-button" onPress={handlePay}>
  <Text>Pay now</Text>
</Pressable>
```

```tsx
<TouchableOpacity
  signalFoxNodeId="profile-edit-photo-button"
  signalFoxNodeDisplayName="Edit profile photo"
  onPress={handleEditPhoto}
>
  <Text>Edit photo</Text>
</TouchableOpacity>
```

### Modal Example

```tsx
<Modal
  visible={isOpen}
  signalFoxNodeId="purchase-paywall-modal"
  signalFoxNodeDisplayName="Purchase Paywall"
  onRequestClose={handleClose}
>
  {/* modal content */}
</Modal>
```

## Manual Tracking

Most events are tracked automatically once the startup patches and integrations are configured. Use manual tracking only for important surfaces or flows that the SDK cannot infer automatically.

### Funnel Steps

Use `SignalFox.trackFunnelStep()` for explicit funnel milestones, such as onboarding, checkout, activation, or export flows.

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

| Parameter | Required | Description |
| --- | --- | --- |
| `funnelName` | Yes | Public name of the funnel. |
| `signalFoxNodeId` | Yes | Stable node identifier for this step. |
| `signalFoxNodeDisplayName` | No | Human-readable label shown in SignalFox. |
| `stepIndex` | No | Numeric order of the step within the funnel. |

### Subviews

Use `SignalFox.trackSubview()` when a meaningful area inside the current screen becomes active.

```ts
SignalFox.trackSubview({
  signalFoxNodeId: 'settings-billing-panel',
  signalFoxNodeDisplayName: 'Billing panel',
});
```

Parameters:

| Parameter | Required | Description |
| --- | --- | --- |
| `signalFoxNodeId` | Yes | Stable node identifier for the subview. |
| `signalFoxNodeDisplayName` | No | Human-readable label shown in SignalFox. |

### Manual Modal-Like Surfaces

If part of your UI behaves like a modal but does not use the native React Native `Modal`, track it manually with `SignalFox.trackModalShown()`.

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

When `visible` is `true`, SignalFox emits a `modal_open` event. When `visible` is `false`, SignalFox emits a `modal_close` event only if that modal is currently present in the modal stack.

Parameters:

| Parameter | Required | Description |
| --- | --- | --- |
| `visible` | Yes | Whether the modal-like surface is currently visible. |
| `signalFoxNodeId` | Yes | Stable node identifier for the surface. |
| `signalFoxNodeDisplayName` | No | Human-readable label shown in SignalFox. |

## Recommended App Startup Structure

A practical React Native setup usually looks like this:

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

## Commonly Used API

Most apps only need the following exports:

- `SignalFox.init(...)`
- `SignalFox.destroy()` for tests or teardown scenarios
- `applyModalPatch()`
- `applyTouchablePatch()`
- `reactNavigationIntegration(...)`
- `expoRouterIntegration(...)`
- `revenueCatIntegration(...)`
- `reactNativeIapIntegration(...)`
- `SignalFox.trackFunnelStep(...)`
- `SignalFox.trackSubview(...)`
- `SignalFox.trackModalShown(...)`

## Contributing

- [Development workflow](./CONTRIBUTING.md#development-workflow)
- [Sending a pull request](./CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](./CODE_OF_CONDUCT.md)

## License

MIT
