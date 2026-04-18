import { Pressable, StyleSheet, Text } from 'react-native';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  signalFoxId: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function ActionButton({
  label,
  onPress,
  signalFoxId,
  variant = 'primary',
}: ActionButtonProps) {
  return (
    <Pressable
      signalFoxId={signalFoxId}
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
    backgroundColor: '#0e63ff',
  },
  secondary: {
    backgroundColor: '#12213f',
  },
  ghost: {
    backgroundColor: '#e7eefc',
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  ghostLabel: {
    color: '#17346d',
  },
});
