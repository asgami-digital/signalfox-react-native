import 'react';
import 'react-native';

declare module 'react' {
  interface Attributes {
    signalFoxId?: string;
    signalFoxDisplayName?: string;
  }
}

declare module 'react-native' {
  interface ViewProps {
    signalFoxId?: string;
    signalFoxDisplayName?: string;
  }
}

export {};
