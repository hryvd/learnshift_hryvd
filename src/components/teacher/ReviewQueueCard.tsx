import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Card, Chip, EmptyState, Notice, PillButton, Text } from '@/components/ui';
import { QUESTION_BY_ID } from '@/data/questions';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH } from '@/lib/config';
import { useDesktop } from '@/hooks/useDesktop';
import { loadReview, reviewAnswer, useTeacher, type ReviewRow } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

/** Shared AI explanation review queue for both real teacher accounts and the pitch demo. */
export function TeacherReviewQueueCard() {
  return IS_PITCH ? <PitchReviewQueue /> : <RealReviewQueue />;
}

function RealReviewQueue() {
  const { c } = useTheme();
  const review = useTeacher((s) => s.review);
  const loadError = useTeacher((s) => s.reviewError);
  const { isDesktop } = useDesktop();
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const act = async (id: string, status: 'approved' | 'edited', note?: string) => {
    if (busy) return;
    setBusy(id);
    setError(null);
    setSaved(null);
    try {
      await reviewAnswer(id, status, note);
      setEditing(null);
      setSaved(status === 'approved' ? 'Approved. The student sees this explanation.' : 'Saved your edited explanation.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const open = review.filter((r) => r.status === 'needs_review');
  const done = review.filter((r) => r.status === 'approved' || r.status === 'edited').slice(0, 6);

  const text = (r: ReviewRow) =>
    r.teacherNote ??
    [r.content.what, ...(r.content.steps ?? [])].filter(Boolean).join(' ') ??
    '';

  return (
    <Card style={styles.gap}>
      <View>
        <Text variant="title">{T.review}</Text>
        <Text variant="subhead">{T.reviewSub}</Text>
      </View>
      {loadError ? (
        <View style={styles.gap}>
          <Notice text={loadError} />
          <PillButton label="Try again" kind="secondary" size="sm" onPress={() => void loadReview()} />
        </View>
      ) : null}
      {error ? <Notice text={error} /> : null}
      {saved ? <Notice tone="success" text={saved} /> : null}
      {open.length === 0 ? <EmptyState title={T.empty} subtitle={T.emptySub} expression="proud" /> : null}
      <View style={isDesktop ? styles.grid : styles.gap}>
      {open.map((r) => {
        const q = QUESTION_BY_ID[r.questionId];
        const draft = drafts[r.id] ?? text(r);
        return (
          <View key={r.id} style={[styles.reviewItem, { backgroundColor: c.inset }, isDesktop && styles.gridItem]}>
            <View style={styles.rowBetween}>
              <Text variant="subhead" color="text" style={styles.flex} numberOfLines={1}>
                {r.student}
              </Text>
              <Chip label={T.confidence(Math.round(r.confidence * 100))} kind="tinted" style={styles.smallChip} />
            </View>
            {q ? <Text variant="headline">{q.prompt.en}</Text> : null}
            {q ? (
              <Text variant="subhead">
                {T.wrong}:{' '}
                <Text variant="subhead" color="danger">
                  {q.options[r.wrongIndex]}
                </Text>
                {'  ·  '}
                {q.options[q.answer]} ✓
              </Text>
            ) : null}
            <Text variant="overline">
              {T.draft} · {r.source === 'generated' ? T.generated : T.bank} · {r.lang.toUpperCase()}
            </Text>
            {editing === r.id ? (
              <TextInput
                value={draft}
                onChangeText={(v) => setDrafts((d) => ({ ...d, [r.id]: v }))}
                multiline
                autoFocus
                onKeyPress={(e) => {
                  const k = e.nativeEvent as { key: string; ctrlKey?: boolean; metaKey?: boolean };
                  if (k.key === 'Enter' && (k.ctrlKey || k.metaKey)) void act(r.id, 'edited', draft);
                  if (k.key === 'Escape') setEditing(null);
                }}
                style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.hairline }]}
                accessibilityLabel={T.draft}
              />
            ) : (
              <Text variant="body">{draft}</Text>
            )}
            {r.content.problems?.length ? (
              <Text variant="caption">
                {T.problems}: {r.content.problems.join('; ')}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {editing === r.id ? (
                <>
                  <PillButton
                    label={busy === r.id ? 'Saving…' : isDesktop ? `${T.save} (Ctrl Enter)` : T.save}
                    size="sm"
                    disabled={!!busy || !draft.trim()}
                    onPress={() => void act(r.id, 'edited', draft)}
                  />
                  <PillButton
                    label="Cancel"
                    kind="neutral"
                    size="sm"
                    disabled={!!busy}
                    onPress={() => {
                      setEditing(null);
                      setDrafts((d) => {
                        const next = { ...d };
                        delete next[r.id];
                        return next;
                      });
                    }}
                  />
                </>
              ) : (
                <>
                  <PillButton
                    label={busy === r.id ? 'Saving…' : T.approve}
                    size="sm"
                    disabled={!!busy}
                    onPress={() => void act(r.id, 'approved')}
                  />
                  <PillButton
                    label={T.edit}
                    kind="secondary"
                    size="sm"
                    disabled={!!busy}
                    onPress={() => setEditing(r.id)}
                  />
                </>
              )}
            </View>
          </View>
        );
      })}
      </View>
      {done.map((r) => (
        <View key={r.id} style={styles.rowBetween}>
          <Text variant="subhead" style={styles.flex} numberOfLines={1}>
            {r.student} · {QUESTION_BY_ID[r.questionId]?.prompt.en ?? r.questionId}
          </Text>
          <Chip label={r.status === 'approved' ? T.approved : T.edited} kind="outline" style={styles.smallChip} />
        </View>
      ))}
    </Card>
  );
}

function PitchReviewQueue() {
  const { c } = useTheme();
  const review = useAppStore((s) => s.review);
  const reviewed = useAppStore((s) => s.reviewed);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const open = review.filter((r) => !reviewed[r.id]);
  const done = review.filter((r) => reviewed[r.id]).slice(0, 4);

  return (
    <Card style={styles.gap}>
      <View>
        <Text variant="title">{T.review}</Text>
        <Text variant="subhead">{T.reviewSub}</Text>
      </View>
      {open.length === 0 ? <EmptyState title={T.empty} subtitle={T.emptySub} expression="proud" /> : null}
      {open.map((r) => {
        const q = QUESTION_BY_ID[r.questionId];
        const draft = drafts[r.id] ?? `${q.hint.en} The right answer is ${q.options[q.answer]}.`;
        return (
          <View key={r.id} style={[styles.reviewItem, { backgroundColor: c.inset }]}>
            <View style={styles.rowBetween}>
              <Text variant="subhead" color="text" style={styles.flex} numberOfLines={1}>
                {r.student}
              </Text>
              <Chip label={T.confidence(Math.round(r.confidence * 100))} kind="tinted" style={styles.smallChip} />
            </View>
            <Text variant="headline">{q.prompt.en}</Text>
            <Text variant="subhead">
              {T.wrong}:{' '}
              <Text variant="subhead" color="danger">
                {q.options[r.wrongIndex]}
              </Text>
            </Text>
            <Text variant="overline">{T.draft}</Text>
            {editing === r.id ? (
              <TextInput
                value={draft}
                onChangeText={(v) => setDrafts((d) => ({ ...d, [r.id]: v }))}
                multiline
                style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.hairline }]}
                accessibilityLabel={T.draft}
              />
            ) : (
              <Text variant="body">{draft}</Text>
            )}
            <View style={styles.actions}>
              {editing === r.id ? (
                <PillButton
                  label={T.save}
                  size="sm"
                  onPress={() => {
                    setEditing(null);
                    useAppStore.getState().setReviewed(r.id, 'edited');
                  }}
                />
              ) : (
                <>
                  <PillButton
                    label={T.approve}
                    size="sm"
                    onPress={() => useAppStore.getState().setReviewed(r.id, 'approved')}
                  />
                  <PillButton label={T.edit} kind="secondary" size="sm" onPress={() => setEditing(r.id)} />
                </>
              )}
            </View>
          </View>
        );
      })}
      {done.map((r) => (
        <View key={r.id} style={styles.rowBetween}>
          <Text variant="subhead" style={styles.flex} numberOfLines={1}>
            {r.student} · {QUESTION_BY_ID[r.questionId].prompt.en}
          </Text>
          <Chip label={reviewed[r.id] === 'approved' ? T.approved : T.edited} kind="outline" style={styles.smallChip} />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  smallChip: { height: 26, paddingHorizontal: 10 },
  reviewItem: { borderRadius: radius.inset, padding: 14, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  gridItem: { flexGrow: 1, flexBasis: 420, minWidth: 0 },
  input: { minHeight: 72, borderRadius: 12, borderWidth: 1, padding: 10, fontSize: 15, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
