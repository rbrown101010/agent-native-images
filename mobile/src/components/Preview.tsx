import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { copyImage, cutout, ImageRef, saveToLibrary, saveToPhotos } from '../lib/actions';
import { theme } from '../theme';

type Props = {
  item: ImageRef | null;
  onClose: () => void;
  onDelete?: (item: ImageRef) => void;
};

export function Preview({ item, onClose, onDelete }: Props) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  if (!item) return null;

  const run = (label: string, task: (target: ImageRef) => Promise<unknown>) => async () => {
    setBusy(label);
    setNote('');
    try {
      await task(item);
      setNote(`${label} done`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel="Close preview" />
        <View style={styles.card}>
          <Image source={{ uri: item.uri }} style={styles.image} contentFit="contain" transition={120} />
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.source ? (
            <Text style={styles.source} numberOfLines={1}>
              {item.source}
            </Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.actions}>
            <Action label="Copy" busy={busy} onPress={run('Copy', copyImage)} />
            <Action label="Save" busy={busy} onPress={run('Save', saveToPhotos)} />
            <Action label="Library" busy={busy} onPress={run('Library', saveToLibrary)} />
            <Action label="Remove BG" busy={busy} onPress={run('Remove BG', cutout)} />
            {onDelete ? (
              <Action
                label="Delete"
                busy={busy}
                danger
                onPress={() => {
                  onDelete(item);
                  onClose();
                }}
              />
            ) : null}
          </ScrollView>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Action({
  label,
  busy,
  onPress,
  danger
}: {
  label: string;
  busy: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.action} onPress={onPress} disabled={Boolean(busy)}>
      {busy === label ? (
        <ActivityIndicator size="small" color={theme.ink} />
      ) : (
        <Text style={[styles.actionText, danger ? styles.actionDanger : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  card: {
    backgroundColor: theme.raised,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: theme.line,
    padding: 16,
    gap: 10
  },
  image: { width: '100%', height: 320, borderRadius: 12, backgroundColor: theme.subtle },
  title: { color: theme.ink, fontSize: 15, fontWeight: '600' },
  source: { color: theme.faint, fontSize: 12 },
  strip: { flexGrow: 0, flexShrink: 0 },
  actions: { gap: 8, paddingVertical: 4, alignItems: 'center' },
  action: {
    minWidth: 84,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: theme.subtle,
    borderWidth: 1,
    borderColor: theme.line
  },
  actionText: { color: theme.ink, fontSize: 13, fontWeight: '600' },
  actionDanger: { color: theme.danger },
  note: { color: theme.muted, fontSize: 12 },
  close: { alignSelf: 'center', paddingVertical: 8 },
  closeText: { color: theme.focus, fontSize: 14, fontWeight: '600' }
});
