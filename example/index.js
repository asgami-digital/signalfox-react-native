import { AppRegistry } from 'react-native';
import {
  applyModalPatch,
  applyTouchablePatch,
} from '@asgami-digital/signalfox-react-native';
import App from './src/App';
import { name as appName } from './app.json';

applyModalPatch();
applyTouchablePatch();

AppRegistry.registerComponent(appName, () => App);
