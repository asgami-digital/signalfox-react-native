/**
 * Los parches deben ejecutarse con require() antes de cargar App (evita hoisting de import).
 */
require('react-native-gesture-handler');
const signalFox = require('@asgami-digital/signalfox-react-native');
signalFox.applyModalPatch();
signalFox.applyTouchablePatch();

const { AppRegistry } = require('react-native');
const App = require('./src/App').default;
const { name: appName } = require('./app.json');

AppRegistry.registerComponent(appName, () => App);
