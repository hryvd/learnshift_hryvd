import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip, EmptyState, Notice, PillButton, SegmentedControl, Skeleton, Text } from '@/components/ui';
import { QUESTION_BY_ID } from '@/data/questions';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { teacherStrings as T } from '@/i18n/staff';
import { IS_PITCH } from '@/lib/config';
import { MOD, useShortcut } from '@/lib/shortcuts';
import { loadAllRosters, loadReview, reviewAnswer, useTeacher } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';

type Row = {
  id: string;
  studentId: string | null;
  student: string;
  questionId: string;
  wrongIndex: number;
  confidence: number;
  lang: string;
  source: 'bank' | 'generated' | 'demo';
  problems: string[];
  draft: string;
  status: 'needs_review' | 'approved' | 'edited';
  at: string | null;
};

const EMPTY: never[] = [];

/** Laptop review: scannable queue on the left, one answer to check on the right. */
export function ReviewWorkbench() {
  const { c } = useTheme();
  const real = useTeacher((s) => s.review);
  const loadError = useTeacher((s) => s.reviewError);
  const syncedAt = useTeacher((s) => s.syncedAt);
  const classes = useTeacher((s) => s.classes);
  const students = useTeacher((s) => s.students);
  const pitch = useAppStore((s) => s.review);
  const pitchReviewed = useAppStore((s) => s.reviewed);

  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [classId, setClassId] = useState<string>('all');
  const [pick, setPick] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Class filter needs to know who is in which class.
  useEffect(() => {
    if (!IS_PITCH && classes.length > 1) void loadAllRosters();
  }, [classes.length]);

  const rows: Row[] = useMemo(() => {
    if (IS_PITCH) {
      return pitch.map((r) => {
        const q = QUESTION_BY_ID[r.questionId];
        return {
          id: r.id,
          studentId: null,
          student: r.student,
          questionId: r.questionId,
          wrongIndex: r.wrongIndex,
          confidence: r.confidence,
          lang: 'en',
          source: 'demo' as const,
          problems: [],
          draft: q ? `${q.hint.en} The right answer is ${q.options[q.answer]}.` : '',
          status: pitchReviewed[r.id] ?? 'needs_review',
          at: null,
        };
      });
    }
    return real.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      student: r.student,
      questionId: r.questionId,
      wrongIndex: r.wrongIndex,
      confidence: r.confidence,
      lang: r.lang,
      source: r.source,
      problems: r.content.problems ?? [],
      draft: r.teacherNote ?? [r.content.what, ...(r.content.steps ?? [])].filter(Boolean).join(' '),
      status: r.status === 'auto' ? 'approved' : r.status,
      at: r.at,
    }));
  }, [real, pitch, pitchReviewed]);

  const inClass = useMemo(() => {
    if (classId === 'all') return null;
    return new Set((students[classId] ?? EMPTY).map((s) => s.id));
  }, [classId, students]);

  const list = rows.filter(
    (r) =>
      (tab === 'open' ? r.status === 'needs_review' : r.status !== 'needs_review') &&
      (!inClass || (r.studentId != null && inClass.has(r.studentId))),
  );
  const openCount = rows.filter((r) => r.status === 'needs_review').length;
  const current = list.find((r) => r.id === pick) ?? list[0] ?? null;
  const idx = current ? list.indexOf(current) : -1;

  const select = (r: Row | undefined) => {
    if (!r) return;
    setPick(r.id);
    setEditing(false);
    setError(null);
  };

  const startEdit = (r: Row) => {
    setDraft(r.draft);
    setEditing(true);
    setSaved(null);
  };

  const act = async (r: Row, status: 'approved' | 'edited', note?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (IS_PITCH) useAppStore.getState().setReviewed(r.id, status);
      else await reviewAnswer(r.id, status, note);
      setEditing(false);
      setSaved(status === 'approved' ? 'Approved. Next answer loaded.' : 'Saved your explanation. Next answer loaded.');
      // Auto-advance to the next open item.
      const next = list[idx + 1] ?? list[idx - 1];
      setPick(next && next.id !== r.id ? next.id : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useShortcut('j', () => select(list[idx + 1]), { enabled: !editing });
  useShortcut('k', () => select(list[idx - 1]), { enabled: !editing });
  useShortcut('a', () => current && current.status === 'needs_review' && void act(current, 'approved'), { enabled: !editing && !busy });
  useShortcut('e', () => current && startEdit(current), { enabled: !editing });

  const loading = !IS_PITCH && !syncedAt && real.length === 0 && !loadError;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <SegmentedControl
          options={[
            { value: 'open', label: `Needs review (${openCount})` },
            { value: 'done', label: `Reviewed (${rows.length - openCount})` },
          ]}
          value={tab}
          onChange={(v) => {
            setTab(v as 'open' | 'done');
            setPick(null);
            setEditing(false);
          }}
          style={styles.seg}
        />
        {!IS_PITCH && classes.length > 1 ? (
          <View style={styles.chips}>
            {[{ id: 'all', name: 'All classes' }, ...classes].map((cl) => (
              <Chip key={cl.id} label={cl.name} kind={classId === cl.id ? 'tinted' : 'neutral'} selected={classId === cl.id} onPress={() => setClassId(cl.id)} />
            ))}
          </View>
        ) : null}
        <Text variant="caption" style={styles.keys}>
          J / K move · A approve · E edit
        </Text>
      </View>

      {loadError ? (
        <View style={styles.errRow}>
          <View style={styles.flex}>
            <Notice text={loadError} />
          </View>
          <PillButton label="Try again" kind="secondary" size="sm" onPress={() => void loadReview()} />
        </View>
      ) : null}

      <View style={styles.panes}>
        <View style={[styles.list, { backgroundColor: c.card, borderColor: c.hairline }]}>
          {loading ? (
            <View style={styles.pad}>
              {[0, 1, 2, 3].map((k) => (
                <Skeleton key={k} height={64} r={12} />
              ))}
            </View>
          ) : list.length === 0 ? (
            <EmptyState
              title={tab === 'open' ? T.empty : 'Nothing reviewed yet'}
              subtitle={tab === 'open' ? T.emptySub : 'Approved and edited answers show here.'}
              expression="proud"
            />
          ) : (
            <ScrollView contentContainerStyle={styles.pad}>
              {list.map((r) => {
                const on = r.id === current?.id;
                const q = QUESTION_BY_ID[r.questionId];
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => select(r)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${r.student}: ${q?.prompt.en ?? 'question'}`}
                    style={({ hovered }) => [
                      styles.item,
                      { borderColor: on ? c.accent : 'transparent', backgroundColor: on ? c.accentTint : hovered ? c.inset : 'transparent' },
                    ]}
                  >
                    <View style={styles.itemTop}>
                      <Text variant="subhead" color="text" style={styles.flex} numberOfLines={1}>
                        {r.student}
                      </Text>
                      <Text variant="caption">{T.confidence(Math.round(r.confidence * 100))}</Text>
                    </View>
                    <Text variant="caption" numberOfLines={2}>
                      {q?.prompt.en ?? `Question ${r.questionId}`}
                    </Text>
                    <Text variant="caption" color="textTertiary">
                      {r.lang.toUpperCase()} · {r.source === 'generated' ? 'AI' : r.source === 'bank' ? 'Bank' : 'Demo'}
                      {r.at ? ` · ${new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={[styles.detail, { backgroundColor: c.card, borderColor: c.hairline }]}>
          {current ? (
            <ScrollView contentContainerStyle={styles.detailBody}>
              {saved ? <Notice tone="success" text={saved} /> : null}
              {error ? <Notice text={error} /> : null}
              <Detail r={current} />
              <Text variant="overline">
                {T.draft} · {current.source === 'generated' ? T.generated : current.source === 'bank' ? T.bank : 'Demo'}
              </Text>
              {editing ? (
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  autoFocus
                  accessibilityLabel={T.draft}
                  onKeyPress={(e) => {
                    const k = e.nativeEvent as { key: string; ctrlKey?: boolean; metaKey?: boolean };
                    if (k.key === 'Enter' && (k.ctrlKey || k.metaKey) && draft.trim()) void act(current, 'edited', draft.trim());
                    if (k.key === 'Escape') setEditing(false);
                  }}
                  style={[styles.input, { color: c.text, backgroundColor: c.inset, borderColor: c.hairline }]}
                />
              ) : (
                <Text variant="body">{current.draft || 'No explanation text.'}</Text>
              )}
              <View style={styles.actions}>
                {editing ? (
                  <>
                    <PillButton label="Cancel" kind="neutral" onPress={() => setEditing(false)} disabled={busy} />
                    <PillButton
                      label={busy ? 'Saving…' : `Save (${MOD} Enter)`}
                      onPress={() => void act(current, 'edited', draft.trim())}
                      disabled={busy || !draft.trim()}
                    />
                  </>
                ) : (
                  <>
                    <PillButton label={T.edit} kind="secondary" onPress={() => startEdit(current)} disabled={busy} />
                    {current.status === 'needs_review' ? (
                      <PillButton label={busy ? 'Saving…' : T.approve} onPress={() => void act(current, 'approved')} disabled={busy} />
                    ) : (
                      <Chip label={current.status === 'approved' ? T.approved : T.edited} kind="outline" />
                    )}
                  </>
                )}
              </View>
            </ScrollView>
          ) : (
            <EmptyState title="Pick an answer" subtitle="Choose one on the left to check it." expression="curious" />
          )}
        </View>
      </View>
    </View>
  );
}

function Detail({ r }: { r: Row }) {
  const { c } = useTheme();
  const q = QUESTION_BY_ID[r.questionId];
  return (
    <View style={styles.gap}>
      <Text variant="overline">{r.student}</Text>
      {q ? (
        <>
          <Text variant="title">{q.prompt.en}</Text>
          <View style={[styles.answer, { backgroundColor: c.accentTint }]}>
            <Text variant="caption">{T.wrong}</Text>
            <Text variant="headline" color="danger">
              {q.options[r.wrongIndex] ?? '—'}
            </Text>
          </View>
          <View style={[styles.answer, { backgroundColor: c.inset }]}>
            <Text variant="caption">Correct answer</Text>
            <Text variant="headline" color="success">
              {q.options[q.answer]}
            </Text>
          </View>
        </>
      ) : (
        <Text variant="body">
          This question ({r.questionId}) isn&apos;t in the Grade 7 bank on this device. Review the explanation below.
        </Text>
      )}
      {r.problems.length ? (
        <View style={[styles.answer, { backgroundColor: c.inset }]}>
          <Text variant="caption">{T.problems}</Text>
          {r.problems.map((p, i) => (
            <Text key={i} variant="subhead" color="text">
              • {p}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 12 },
  flex: { flex: 1 },
  gap: { gap: 10 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  seg: { minWidth: 320 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  keys: { marginLeft: 'auto' },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panes: { flex: 1, flexDirection: 'row', gap: 16, minHeight: 420 },
  list: { flex: 0.9, minWidth: 0, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  detail: { flex: 1.5, minWidth: 0, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  pad: { padding: 10, gap: 6 },
  item: { borderRadius: 12, borderWidth: 1.5, padding: 12, gap: 4 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailBody: { padding: 22, gap: 14 },
  answer: { borderRadius: radius.inset, padding: 12, gap: 2 },
  input: { minHeight: 140, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
});
