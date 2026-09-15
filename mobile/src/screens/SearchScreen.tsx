import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import { Preview } from '../components/Preview';
import { planSearches, SearchKind, SearchResult, searchImages } from '../lib/api';
import { ImageRef } from '../lib/actions';
import { keys } from '../lib/keys';
import { parseQueries } from '../lib/queries';
import { theme } from '../theme';

const KINDS: { label: string; kind: SearchKind }[] = [
  { label: 'All', kind: 'all' },
  { label: 'Transparent', kind: 'transparent' },
  { label: 'Icons', kind: 'icons' }
];

type Tab = { query: string; results: SearchResult[]; loading: boolean; error: string };

export function SearchScreen() {
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<SearchKind>('all');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<ImageRef | null>(null);
  const { width } = useWindowDimensions();
  const columns = width > 700 ? 4 : 2;

  const runQueries = useCallback(
    async (value: string, searchKind: SearchKind) => {
      let queries: string[];
      try {
        queries = parseQueries(value, 12);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not read those searches.');
        return;
      }
      if (!queries.length) return;
      setMessage('');
      setActive(0);
      setTabs(queries.map(query => ({ query, results: [], loading: true, error: '' })));
      await Promise.all(
        queries.map(async query => {
          try {
            const results = await searchImages({ query, kind: searchKind }, keys().serper);
            setTabs(current =>
              current.map(tab => (tab.query === query ? { ...tab, results, loading: false } : tab))
            );
          } catch (error) {
            setTabs(current =>
              current.map(tab =>
                tab.query === query
                  ? {
                      ...tab,
                      loading: false,
                      error: error instanceof Error ? error.message : 'Search failed.'
                    }
                  : tab
              )
            );
          }
        })
      );
    },
    []
  );

  useEffect(() => {
    if (tabs.length) void runQueries(tabs.map(tab => tab.query).join('; '), kind);
    // Re-run the visible searches whenever the image filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const aiSearch = async () => {
    setPlanning(true);
    setMessage('');
    try {
      const plan = await planSearches(input, keys().gateway);
      setInput(plan);
      await runQueries(plan, kind);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI search failed.');
    } finally {
      setPlanning(false);
    }
  };

  const current = tabs[active];
  const data = useMemo(() => current?.results ?? [], [current]);

  return (
    <View style={styles.screen}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Search Google Images…"
          placeholderTextColor={theme.faint}
          returnKeyType="search"
          onSubmitEditing={() => void runQueries(input, kind)}
          accessibilityLabel="Image search"
        />
        <Pressable style={styles.aiButton} onPress={() => void aiSearch()} disabled={planning}>
          {planning ? <ActivityIndicator size="small" color={theme.ink} /> : <Text style={styles.aiText}>AI</Text>}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {KINDS.map(option => (
          <Pressable
            key={option.kind}
            style={[styles.chip, kind === option.kind && styles.chipActive]}
            onPress={() => setKind(option.kind)}>
            <Text style={[styles.chipText, kind === option.kind && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {tabs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {tabs.map((tab, index) => (
            <Pressable
              key={tab.query}
              style={[styles.chip, active === index && styles.chipActive]}
              onPress={() => setActive(index)}>
              <Text style={[styles.chipText, active === index && styles.chipTextActive]} numberOfLines={1}>
                {tab.query}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {current?.error ? <Text style={styles.message}>{current.error}</Text> : null}

      {current?.loading ? (
        <ActivityIndicator style={styles.loading} color={theme.focus} />
      ) : (
        <FlatList
          key={columns}
          data={data}
          numColumns={columns}
          keyExtractor={item => item.key}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={
            tabs.length ? null : <Text style={styles.empty}>Search Google Images, or describe a brief and tap AI.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.tile}
              onPress={() =>
                setPreview({
                  uri: item.sourceUrl,
                  title: item.title,
                  query: item.query,
                  source: item.source
                })
              }>
              <Image source={{ uri: item.previewUrl }} style={styles.thumb} contentFit="contain" transition={100} />
              <Text style={styles.domain} numberOfLines={1}>
                {item.domain}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Preview item={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.raised,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.ink,
    fontSize: 15
  },
  aiButton: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.subtle,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12
  },
  aiText: { color: theme.focus, fontWeight: '700', fontSize: 14 },
  chips: { gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.raised,
    maxWidth: 200
  },
  chipActive: { backgroundColor: theme.subtle, borderColor: theme.focus },
  chipText: { color: theme.muted, fontSize: 13 },
  chipTextActive: { color: theme.ink },
  message: { color: theme.danger, fontSize: 13, paddingHorizontal: 14, paddingBottom: 6 },
  loading: { marginTop: 40 },
  grid: { padding: 10, gap: 10 },
  column: { gap: 10 },
  tile: { flex: 1, backgroundColor: theme.raised, borderRadius: 12, borderWidth: 1, borderColor: theme.line, padding: 6 },
  thumb: { width: '100%', height: 150, borderRadius: 8 },
  domain: { color: theme.faint, fontSize: 11, paddingTop: 6 },
  empty: { color: theme.faint, textAlign: 'center', marginTop: 60, paddingHorizontal: 30, fontSize: 14 }
});
