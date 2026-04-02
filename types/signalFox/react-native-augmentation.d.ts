import 'react';
import 'react-native';

declare module 'react' {
  interface Attributes {
    signalFoxId?: string;
  }
}

/** Host components use `ViewProps`, not `React.Attributes` (see RN typings). */
declare module 'react-native' {
  interface ViewProps {
    signalFoxId?: string;
  }
}

export {};
