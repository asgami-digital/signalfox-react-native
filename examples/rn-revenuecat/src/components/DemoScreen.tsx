import type { ReactNode } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text } from 'react-native';

type DemoScreenProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function DemoScreen({ title, subtitle, children }: DemoScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>SignalFox Demo</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7ff',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  eyebrow: {
    color: '#4f6aa3',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0d1b33',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#52627d',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
});
