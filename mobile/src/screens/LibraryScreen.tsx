import { Image } from 'expo-image';
import { useState, useSyncExternalStore } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Preview } from '../components/Preview';
import { ImageRef } from '../lib/actions';
import { library } from '../lib/storage';
import { theme } from '../theme';

export function LibraryScreen() {
  const entries = useSyncExternalStore(
    listener => library.subscribe(listener),
    () => library.list()
  );
  const [preview, setPreview] = useState<(ImageRef & { id: string }) | null>(null);

  return (
    <View style={styles.screen}>
      <FlatList
        data={entries}
        numColumns={2}
        keyExtractor={entry => entry.id}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={<Text style={styles.empty}>Saved images appear here.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.tile}
            onPress={() =>
              setPreview({
                id: item.id,
                uri: item.uri,
                title: item.title,
                query: item.query,
                source: item.source,
                cutout: item.cutout
              })
            }>
            <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="contain" transition={100} />
            <Text style={styles.caption} numberOfLines={1}>
              {item.cutout ? 'Cutout · ' : ''}
              {item.title}
            </Text>
          </Pressable>
        )}
      />
      <Preview
        item={preview}
        onClose={() => setPreview(null)}
        onDelete={() => {
          if (preview) library.remove(preview.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  grid: { padding: 10, gap: 10 },
  column: { gap: 10 },
  tile: { flex: 1, backgroundColor: theme.raised, borderRadius: 12, borderWidth: 1, borderColor: theme.line, padding: 6 },
  thumb: { width: '100%', height: 150, borderRadius: 8 },
  caption: { color: theme.muted, fontSize: 11, paddingTop: 6 },
  empty: { color: theme.faint, textAlign: 'center', marginTop: 60, fontSize: 14 }
});
