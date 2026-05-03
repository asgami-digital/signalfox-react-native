import {
  applyModalPatch,
  applyTouchablePatch,
} from '@asgami-digital/signalfox-react-native';

applyModalPatch();
applyTouchablePatch();

/** `SignalFox.init` vive en `src/app/_layout.tsx` (necesita `useNavigationContainerRef` de Expo Router). */
