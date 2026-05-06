import 'react';
import 'react-native';

declare module 'react' {
  interface Attributes {
    signalFoxNodeId?: string;
    signalFoxNodeDisplayName?: string;
  }
}

declare module 'react-native' {
  interface ViewProps {
    signalFoxNodeId?: string;
    signalFoxNodeDisplayName?: string;
  }
}

export {};
