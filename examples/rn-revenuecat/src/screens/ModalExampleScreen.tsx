import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { DemoScreen } from '../components/DemoScreen';
import { InfoCard } from '../components/InfoCard';
import { logDemoEvent } from '../utils/logger';

export function ModalExampleScreen() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <DemoScreen
      title="ModalExampleScreen"
      subtitle="Interaction examples using React Native Modal and buttons that trigger events."
    >
      <InfoCard
        title="Test Coverage"
        body="Here you can validate native modal open/close, taps inside the modal, and buttons that do not navigate."
      />

      <ActionButton
        label="Open native modal"
        signalFoxNodeId="modal_example_open_native_modal"
        onPress={() => {
          logDemoEvent('open_native_modal');
          setIsVisible(true);
        }}
      />
      <ActionButton
        label="Test click"
        signalFoxNodeId="modal_example_idle_click"
        variant="ghost"
        onPress={() => {
          logDemoEvent('modal_example_idle_click');
        }}
      />

      <Modal
        signalFoxNodeId="modal_example_native_modal"
        animationType="slide"
        transparent
        visible={isVisible}
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>React Native Modal</Text>
            <Text style={styles.body}>
              This modal exists to test open, dismiss, and click behavior with
              SignalFox.
            </Text>
            <ActionButton
              label="Trigger alert"
              signalFoxNodeId="modal_example_alert_button"
              variant="secondary"
              onPress={() => {
                logDemoEvent('native_modal_alert');
                Alert.alert('Interaction', 'Click inside the modal');
              }}
            />
            <ActionButton
              label="Close modal"
              signalFoxNodeId="modal_example_close_native_modal"
              variant="ghost"
              onPress={() => {
                logDemoEvent('close_native_modal');
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
