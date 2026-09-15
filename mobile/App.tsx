import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { loadKeys } from './src/lib/keys';
import { GenerateScreen } from './src/screens/GenerateScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { theme } from './src/theme';

const TABS = ['Search', 'Generate', 'Library', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Search');

  useEffect(() => {
    void loadKeys();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.brand}>Agent Native Images</Text>
        </View>
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}>
          {tab === 'Search' ? <SearchScreen /> : null}
          {tab === 'Generate' ? <GenerateScreen /> : null}
          {tab === 'Library' ? <LibraryScreen /> : null}
          {tab === 'Settings' ? <SettingsScreen /> : null}
        </KeyboardAvoidingView>
        <View style={styles.tabBar}>
          {TABS.map(name => (
            <Pressable key={name} style={styles.tab} onPress={() => setTab(name)} accessibilityLabel={name}>
              <Text style={[styles.tabText, tab === name && styles.tabTextActive]}>{name}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.line },
  brand: { color: theme.ink, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  body: { flex: 1 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderColor: theme.line, backgroundColor: theme.raised },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { color: theme.faint, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: theme.ink }
});
