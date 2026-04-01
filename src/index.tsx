/// <reference path="../types/signalFox/react-native-augmentation.d.ts" />
import SignalfoxReactNative from './NativeSignalfoxReactNative';
export * from './signalFox';

export function multiply(a: number, b: number): number {
  return SignalfoxReactNative.multiply(a, b);
}
