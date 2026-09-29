import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AI_MODEL, IMAGE_MODEL } from '../lib/api';
import { Keys, keys, loadKeys, saveKeys } from '../lib/keys';
import { theme } from '../theme';

const FIELDS: { name: keyof Keys; label: string; hint: string }[] = [
  { name: 'serper', label: 'Serper API key', hint: 'Google Images search' },
  { name: 'gateway', label: 'AI Gateway key', hint: `AI search (${AI_MODEL}) and ${IMAGE_MODEL}` },
  { name: 'removebg', label: 'remove.bg API key', hint: 'Background removal' }
];

export function SettingsScreen() {
  const [values, setValues] = useState<Keys>(keys());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadKeys().then(setValues);
  }, []);

  const save = async () => {
    setValues(await saveKeys(values));
    setSaved(true);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>API settings</Text>
      <Text style={styles.subheading}>Keys are stored in the device keychain and never leave this app.</Text>
      {FIELDS.map(field => (
        <View key={field.name} style={styles.field}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            style={styles.input}
            value={values[field.name]}
            onChangeText={text => {
              setSaved(false);
              setValues(current => ({ ...current, [field.name]: text }));
            }}
            placeholder="Paste key"
            placeholderTextColor={theme.faint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel={field.label}
          />
          <Text style={styles.hint}>{field.hint}</Text>
        </View>
      ))}
      <Pressable style={styles.save} onPress={() => void save()}>
        <Text style={styles.saveText}>{saved ? 'Saved' : 'Save keys'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 14 },
  heading: { color: theme.ink, fontSize: 18, fontWeight: '700' },
  subheading: { color: theme.faint, fontSize: 12 },
  field: { gap: 6 },
  label: { color: theme.muted, fontSize: 13 },
  input: {
    backgroundColor: theme.raised,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12,
    padding: 12,
    color: theme.ink,
    fontSize: 15
  },
  hint: { color: theme.faint, fontSize: 11 },
  save: { marginTop: 6, alignItems: 'center', backgroundColor: theme.ink, borderRadius: 12, paddingVertical: 13 },
  saveText: { color: theme.bg, fontWeight: '700', fontSize: 14 }
});
