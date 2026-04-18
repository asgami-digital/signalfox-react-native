import { StyleSheet, Text, View } from 'react-native';

type InfoCardProps = {
  title: string;
  body: string;
};

export function InfoCard({ title, body }: InfoCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2fb',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  title: {
    color: '#10213f',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    color: '#42506b',
    fontSize: 14,
    lineHeight: 20,
  },
});
