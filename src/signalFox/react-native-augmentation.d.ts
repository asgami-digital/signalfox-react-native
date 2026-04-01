import 'react-native';

declare module 'react-native' {
  // Extendemos explicitamente solo componentes trackeables.
  // Con RN 0.83 los props publicados son type aliases generados, por eso
  // ampliamos las firmas de los componentes en lugar de interfaces de props.
  export const Pressable: React.ComponentType<
    PressableProps & { signalFoxId?: string }
  >;
  export const TouchableOpacity: React.ComponentType<
    TouchableOpacityProps & { signalFoxId?: string }
  >;
  export const TouchableHighlight: React.ComponentType<
    TouchableHighlightProps & { signalFoxId?: string }
  >;
  export const TouchableWithoutFeedback: React.ComponentType<
    TouchableWithoutFeedbackProps & { signalFoxId?: string }
  >;
  export const TouchableNativeFeedback: React.ComponentType<
    TouchableNativeFeedbackProps & { signalFoxId?: string }
  >;
  export const Modal: React.ComponentType<
    ModalProps & { signalFoxId?: string }
  >;
}
