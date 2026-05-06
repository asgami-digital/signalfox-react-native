import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { logDemoEvent } from '../utils/logger';

export default function ModalExample() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <DemoScreen
      title="ModalExample"
      subtitle="React Native Modal example aligned with the RN CLI app behavior."
    >
      <InfoCard
        title="Coverage"
        body="Open, close, in-modal alerts, and clicks without navigation to validate SignalFox."
      />
      <ActionButton
        label="Open native modal"
        signalFoxNodeId="expo_modal_open_native_modal"
        onPress={() => {
          logDemoEvent('expo_open_native_modal');
          setIsVisible(true);
        }}
      />
      <ActionButton
        label="Test click"
        signalFoxNodeId="expo_modal_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('expo_modal_idle_click');
        }}
      />

      <Modal
        signalFoxNodeId="expo_native_modal"
        animationType="slide"
        transparent
        visible={isVisible}
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>React Native Modal</Text>
            <Text style={styles.body}>
              This modal mirrors the pattern used in the `rn-revenuecat`
              example.
            </Text>
            <ActionButton
              label="Show alert"
              signalFoxNodeId="expo_modal_alert_button"
              variant="secondary"
              onPress={() => {
                logDemoEvent('expo_modal_alert');
                Alert.alert('Interaction', 'Click inside the Expo modal');
              }}
            />
            <ActionButton
              label="Close modal"
              signalFoxNodeId="expo_modal_close_native_modal"
              variant="ghost"
              onPress={() => {
                logDemoEvent('expo_close_native_modal');
                setIsVisible(false);
              }}
            />
          </View>
        </View>
      </Modal>
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(9, 20, 40, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
  },
  title: {
    color: '#10213f',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    color: '#4a5872',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
});
