# @asgami/signalfox-react-native

React Native SDK for SignalFox analytics

## Installation


```sh
npm install @asgami/signalfox-react-native
```


## Usage


```js
import { multiply } from '@asgami/signalfox-react-native';

// ...

const result = multiply(3, 7);
```

## TypeScript: `signalFoxId` en componentes de React Native

El SDK amplía los tipos de `Pressable`, `Modal`, `Touchable*` (etc.) para aceptar la prop opcional `signalFoxId`. Según la versión de TypeScript, la resolución de tipos del paquete y si usas `exports` en `package.json`, a veces esa ampliación **no se aplica sola** al consumir la librería instalada desde npm.

Haz **una** de estas dos cosas en tu app (recomendado el import en el punto de entrada):

### Opción A — import en el entry (Metro y TypeScript)

En `index.js` / `index.tsx` o en la raíz de tu navegación, **antes** de otros imports de pantallas:

```ts
import '@asgami-digital/signalfox-react-native/react-native-augmentations';
```

No añade lógica en runtime (el módulo está vacío); solo fuerza a TypeScript a cargar la ampliación de `react-native`.

### Opción B — referencia en un `.d.ts` global

Crea o edita un archivo incluido en tu `tsconfig` (por ejemplo `signalfox-env.d.ts`):

```ts
/// <reference types="@asgami-digital/signalfox-react-native/react-native-augmentations" />
```

Si `/// <reference types="..." />` no resuelve en tu versión de TypeScript, usa ruta al paquete:

```ts
/// <reference path="./node_modules/@asgami-digital/signalfox-react-native/react-native-augmentations.d.ts" />
```

Con **pnpm**, la ruta puede ser distinta; en ese caso suele ser más fiable la **opción A**.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
