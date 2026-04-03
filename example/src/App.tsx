import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  multiply,
  SignalFoxProvider,
  appStateIntegration,
  reactNavigationIntegration,
  nativePurchaseIntegration,
  reactNativeModalPatchIntegration,
  reactNativeTouchablePatchIntegration,
} from '@asgami-digital/signalfox-react-native';
import { SIGNALFOX_EXAMPLE_API_KEY } from '@env';

const signalFoxExampleApiKey = (SIGNALFOX_EXAMPLE_API_KEY ?? '').trim();
if (__DEV__ && !signalFoxExampleApiKey) {
  console.warn(
    '[SignalFox example] Falta SIGNALFOX_EXAMPLE_API_KEY. Copia example/.env.example a example/.env y rellénala.'
  );
}

/** Valor desde example/.env (plantilla: example/.env.example). Prefijo dev → flush inmediato en el core. */

type RootStackParamList = {
  Home: undefined;
  Details: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
type DetailsProps = NativeStackScreenProps<RootStackParamList, 'Details'>;

function HomeScreen({ navigation }: HomeProps) {
  const [isModalVisible, setModalVisible] = useState(false);
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const result = multiply(3, 7);

  const openImagePicker = async () => {
    const response = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
    });
    if (response.didCancel) return;
    if (response.errorCode) {
      Alert.alert(
        'Error',
        response.errorMessage ?? 'No se pudo abrir la galería'
      );
      return;
    }
    const asset = response.assets?.[0];
    const uri = asset?.uri;
    if (uri) {
      setPickedImageUri(uri);
      Alert.alert('Imagen seleccionada', asset.fileName ?? uri);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>Demo de navegación</Text>
      <Text style={styles.subtitle}>Resultado SDK: {result}</Text>
      <Text style={styles.hint}>
        Auto-analytics: AppState, navegación (screen_view), modal y toques
        (patches en index.js).
      </Text>

      <Pressable
        signalFoxId="go_details_button"
        style={styles.button}
        onPress={() => {
          console.log('tap_go_details');
          navigation.navigate('Details');
        }}
      >
        <Text style={styles.buttonText}>Ir a Details</Text>
      </Pressable>

      <Pressable
        signalFoxId="open_modal_button"
        style={[styles.button, styles.secondaryButton]}
        onPress={() => {
          console.log('tap_open_modal');
          setModalVisible(true);
        }}
      >
        <Text style={styles.buttonText}>Abrir modal nativo</Text>
      </Pressable>

      <Pressable
        signalFoxId="open_image_picker_button"
        style={[styles.button, styles.imagePickerButton]}
        onPress={() => {
          console.log('tap_open_image_picker');
          void openImagePicker();
        }}
      >
        <Text style={styles.buttonText}>Elegir imagen</Text>
      </Pressable>

      {pickedImageUri ? (
        <Image
          source={{ uri: pickedImageUri }}
          style={styles.pickedPreview}
          resizeMode="cover"
        />
      ) : null}

      <Modal
        signalFoxId="example_modal"
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Modal de ejemplo</Text>
            <Text style={styles.modalText}>
              Este modal usa el componente nativo de React Native.
            </Text>
            <Pressable
              signalFoxId="modal_alert_button"
              style={styles.modalButton}
              onPress={() => {
                console.log('tap_modal_alert');
                Alert.alert('Evento', 'Podrías enviar analítica aquí');
              }}
            >
              <Text style={styles.buttonText}>Lanzar Alert</Text>
            </Pressable>
            <Pressable
              signalFoxId="close_modal_button"
              style={[styles.modalButton, styles.closeButton]}
              onPress={() => {
                console.log('tap_close_modal');
                setModalVisible(false);
              }}
            >
              <Text style={styles.buttonText}>Cerrar modal</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function DetailsScreen({ navigation }: DetailsProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Pantalla Details</Text>
      <Text style={styles.subtitle}>
        Puedes volver con el botón nativo del header o con este botón.
      </Text>

      <Pressable
        signalFoxId="go_back_button"
        style={styles.button}
        onPress={() => {
          console.log('tap_go_back');
          navigation.goBack();
        }}
      >
        <Text style={styles.buttonText}>Volver atrás</Text>
      </Pressable>
    </SafeAreaView>
  );
}

export default function App() {
  const integrations = useMemo(
    () => [
      reactNavigationIntegration({ navigationRef }),
      appStateIntegration(),
      nativePurchaseIntegration(),
      reactNativeModalPatchIntegration(),
      reactNativeTouchablePatchIntegration(),
    ],
    []
  );

  return (
    <SignalFoxProvider
      apiKey={signalFoxExampleApiKey}
      integrations={integrations}
    >
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Inicio' }}
          />
          <Stack.Screen
            name="Details"
            component={DetailsScreen}
            options={{ title: 'Detalles' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SignalFoxProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f6f8fb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1d2738',
  },
  subtitle: {
    fontSize: 15,
    color: '#3c4858',
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    color: '#6b7785',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2f6fed',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#4f7f6f',
  },
  imagePickerButton: {
    backgroundColor: '#7b5cbf',
  },
  pickedPreview: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: '#e2e6ee',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1d2738',
  },
  modalText: {
    fontSize: 14,
    color: '#3c4858',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#2f6fed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeButton: {
    backgroundColor: '#dd4d4d',
  },
});
