import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSyncExternalStore, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Preview } from '../components/Preview';
import { QUALITIES, SIZES } from '../lib/api';
import { ImageRef } from '../lib/actions';
import { generations } from '../lib/generations';
import { theme } from '../theme';

export function GenerateScreen() {
  const jobs = useSyncExternalStore(
    listener => generations.subscribe(listener),
    () => generations.list()
  );
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<string>(SIZES[0].size);
  const [quality, setQuality] = useState<string>('medium');
  const [references, setReferences] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<ImageRef | null>(null);

  const attach = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    setReferences(current => [...current, ...result.assets.map(asset => asset.uri)].slice(0, 8));
  };

  const submit = () => {
    setMessage('');
    try {
      generations.add({ prompt: prompt.trim(), size, quality, references });
      setPrompt('');
      setReferences([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not queue that generation.');
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={jobs}
        numColumns={2}
        keyExtractor={job => job.id}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={<Text style={styles.empty}>Describe an image and generate it with GPT Image 2.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.tile}
            onPress={() => {
              if (item.status === 'ready' && item.uri) {
                setPreview({ uri: item.uri, title: item.prompt, query: item.prompt });
              } else if (item.status === 'error') {
                generations.retry(item.id);
              }
            }}
            onLongPress={() => generations.remove(item.id)}>
            {item.status === 'ready' && item.uri ? (
              <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="contain" transition={120} />
            ) : (
              <View style={styles.placeholder}>
                {item.status === 'error' ? (
                  <Text style={styles.error}>{item.error}</Text>
                ) : (
                  <ActivityIndicator color={theme.focus} />
                )}
              </View>
            )}
            <Text style={styles.caption} numberOfLines={2}>
              {item.prompt}
            </Text>
          </Pressable>
        )}
      />

      <View style={styles.composer}>
        {references.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.refs}>
            {references.map(uri => (
              <Pressable key={uri} onPress={() => setReferences(current => current.filter(item => item !== uri))}>
                <Image source={{ uri }} style={styles.ref} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Describe an image…"
          placeholderTextColor={theme.faint}
          multiline
          maxLength={6000}
          accessibilityLabel="Image prompt"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.chips}>
          {SIZES.map(option => (
            <Pressable
              key={option.size}
              style={[styles.chip, size === option.size && styles.chipActive]}
              onPress={() => setSize(option.size)}>
              <Text style={[styles.chipText, size === option.size && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.controls}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.chips}>
            {QUALITIES.map(option => (
              <Pressable
                key={option.quality}
                style={[styles.chip, quality === option.quality && styles.chipActive]}
                onPress={() => setQuality(option.quality)}>
                <Text style={[styles.chipText, quality === option.quality && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.secondary} onPress={() => void attach()}>
            <Text style={styles.secondaryText}>Attach</Text>
          </Pressable>
          <Pressable style={styles.primary} onPress={submit} disabled={!prompt.trim()}>
            <Text style={styles.primaryText}>Generate</Text>
          </Pressable>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Text style={styles.model}>GPT Image 2 · AI Gateway</Text>
      </View>

      <Preview
        item={preview}
        onClose={() => setPreview(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  grid: { padding: 10, gap: 10 },
  column: { gap: 10 },
  tile: { flex: 1, backgroundColor: theme.raised, borderRadius: 12, borderWidth: 1, borderColor: theme.line, padding: 6 },
  thumb: { width: '100%', height: 160, borderRadius: 8 },
  placeholder: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: theme.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10
  },
  error: { color: theme.danger, fontSize: 11, textAlign: 'center' },
  caption: { color: theme.muted, fontSize: 11, paddingTop: 6 },
  empty: { color: theme.faint, textAlign: 'center', marginTop: 60, paddingHorizontal: 30, fontSize: 14 },
  composer: { borderTopWidth: 1, borderColor: theme.line, backgroundColor: theme.raised, padding: 12, gap: 8 },
  strip: { flexGrow: 0, flexShrink: 0 },
  refs: { gap: 8, paddingBottom: 4, alignItems: 'center' },
  ref: { width: 48, height: 48, borderRadius: 8, backgroundColor: theme.subtle },
  input: {
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
    color: theme.ink,
    fontSize: 15
  },
  chips: { gap: 6, alignItems: 'center' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.subtle
  },
  chipActive: { borderColor: theme.focus },
  chipText: { color: theme.muted, fontSize: 12 },
  chipTextActive: { color: theme.ink },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondary: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.subtle
  },
  secondaryText: { color: theme.ink, fontSize: 13 },
  primary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.ink },
  primaryText: { color: theme.bg, fontWeight: '700', fontSize: 13 },
  message: { color: theme.danger, fontSize: 12 },
  model: { color: theme.faint, fontSize: 11 }
});
