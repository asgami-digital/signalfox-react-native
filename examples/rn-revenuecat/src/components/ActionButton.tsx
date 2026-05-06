import { Pressable, StyleSheet, Text } from 'react-native';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  signalFoxNodeId: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function ActionButton({
  label,
  onPress,
  signalFoxNodeId,
  variant = 'primary',
}: ActionButtonProps) {
  return (
    <Pressable
      signalFoxNodeId={signalFoxNodeId}
      style={[styles.button, styles[variant]]}
      onPress={onPress}
    >
      <Text style={[styles.label, variant === 'ghost' && styles.ghostLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primary: {
    backgroundColor: '#1d5cff',
  },
  secondary: {
    backgroundColor: '#0b1b33',
  },
  ghost: {
    backgroundColor: '#e8eefc',
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  ghostLabel: {
    color: '#143268',
  },
});
