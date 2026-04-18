# expo-rniap

Ejemplo Expo Router para probar SignalFox con:

- Expo SDK 55
- Expo Router
- `react-native-iap`
- modal nativo y modal presentado por router

## Pantallas

- `/` → `Home`
- `/purchase` → `PurchaseScreen`
- `/modal-example` → `ModalExample`
- `/secondary-flow` → `SecondaryFlowScreen`
- `/navigation-modal` → `NavigationModal`

## Ejecutar

Instala dependencias si hace falta:

```sh
cd examples/expo-rniap
npm install
```

Arranque de desarrollo:

```sh
npm run start
```

Development build nativo:

```sh
npm run ios
```

o:

```sh
npm run android
```

## Configuración manual pendiente

1. Crea `examples/expo-rniap/.env.local`
2. Añade tu API key de SignalFox
3. Edita `src/config/demoConfig.ts` y sustituye los product IDs si hace falta

```sh
EXPO_PUBLIC_SIGNALFOX_API_KEY=ak_dev__your_key_here
```

Sustituye:

- `REPLACE_WITH_IOS_SUBSCRIPTION_PRODUCT_ID`
- `REPLACE_WITH_ANDROID_SUBSCRIPTION_PRODUCT_ID`

## Notas

- `react-native-iap` requiere development build; no sirve en Expo Go.
- `expo prebuild --no-install` ya se probó para validar autolinking y generación nativa.
- La navegación ya usa `expoRouterIntegration()` desde la librería, alimentada con `useNavigationContainerRef()` de `expo-router`.
