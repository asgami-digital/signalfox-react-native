# expo-rniap

Expo Router example for testing SignalFox with:

- Expo SDK 55
- Expo Router
- `react-native-iap`
- native modal and router-presented modal

## Screens

- `/` → `Home`
- `/purchase` → `PurchaseScreen`
- `/modal-example` → `ModalExample`
- `/secondary-flow` → `SecondaryFlowScreen`
- `/navigation-modal` → `NavigationModal`

## Run

Install dependencies if needed:

```sh
cd examples/expo-rniap
npm install
```

Development startup:

```sh
npm run start
```

Native development build:

```sh
npm run ios
```

o:

```sh
npm run android
```

## Pending Manual Configuration

1. Create `examples/expo-rniap/.env.local`
2. Add your SignalFox API key
3. Edit `src/config/demoConfig.ts` and replace the product IDs if needed

```sh
EXPO_PUBLIC_SIGNALFOX_API_KEY=ak_dev__your_key_here
```

Replace:

- `REPLACE_WITH_IOS_SUBSCRIPTION_PRODUCT_ID`
- `REPLACE_WITH_ANDROID_SUBSCRIPTION_PRODUCT_ID`

## Notes

- `react-native-iap` requires a development build; it does not work in Expo Go.
- `expo prebuild --no-install` has already been tested to validate autolinking and native project generation.
- Navigation already uses `expoRouterIntegration()` from the library, fed by `useNavigationContainerRef()` from `expo-router`.
