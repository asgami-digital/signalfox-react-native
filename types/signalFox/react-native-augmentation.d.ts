import 'react';
import 'react-native';

declare module 'react' {
  interface Attributes {
    signalFoxNodeId?: string;
    signalFoxNodeDisplayName?: string;
  }
}

/** Host components use `ViewProps`, not `React.Attributes` (see RN typings). */
declare module 'react-native' {
  interface ViewProps {
    signalFoxNodeId?: string;
    signalFoxNodeDisplayName?: string;
  }
}

export {};
