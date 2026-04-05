/**
 * Los parches deben ejecutarse con require() antes de cargar App (evita hoisting de import).
 */
require('@asgami-digital/signalfox-react-native/lib/module/signalFox/integrations/reactNativeModalPatch').applyModalPatch();
require('@asgami-digital/signalfox-react-native/lib/module/signalFox/integrations/reactNativeTouchablePatch').applyTouchablePatch();
require('@asgami-digital/signalfox-react-native/lib/module/signalFox/integrations/reactNavigationIntegration').applyReactNavigationPatch();

const { AppRegistry } = require('react-native');
const App = require('./src/App').default;
const { name: appName } = require('./app.json');

AppRegistry.registerComponent(appName, () => App);
