import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Play } from 'phosphor-react-native';

import { SkillGraph } from '@/components/learn/SkillGraph';
import { Screen } from '@/components/student/Screen';
import {
  Card,
  Chip,
  LargeTitleHeader,
  ListGroup,
  ListRow,
  SegmentedControl,
  Stagger,
  Text,
} from '@/components/ui';
import { SUBJECTS } from '@/data/localQuestions';
import { SKILL_BY_ID, SKILLS } from '@/data/skills';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { useLive } from '@/hooks/useLive';
import { useL, useT } from '@/i18n/useT';
import { useAppStore } from '@/store/useAppStore';

type Seg = 'you' | 'skills';

export default function Learn() {
  const t = useT();
  const { seg } = useLocalSearchParams<{ seg?: string }>();
  const [tab, setTab] = useState<Seg>(seg === 'skills' ? 'skills' : 'you');
  const [lastSeg, setLastSeg] = useState(seg);
  if (seg !== lastSeg) {
    setLastSeg(seg);
    if (seg === 'skills' || seg === 'you') setTab(seg);
  }

  return (
    <Screen tabs header={<LargeTitleHeader title={t.learn.title} />}>
      <SegmentedControl<Seg>
        options={[
          { value: 'you', label: t.learn.forYou },
          { value: 'skills', label: 'Extra math practice' },
        ]}
        value={tab}
        onChange={setTab}
        style={styles.seg}
      />
      {tab === 'you' ? <ForYou /> : <Skills />}
    </Screen>
  );
}

function ForYou() {
  const { c } = useTheme();
  const grade = useAppStore((s) => s.learningGrade);
  const fil = useAppStore((s) => s.lang === 'fil');
  return (
    <View style={{ gap: 14 }}>
      <Card style={{ gap: 12 }}>
        <Text variant="overline">{fil ? 'ANG IYONG PRACTICE' : 'YOUR PRACTICE'}</Text>
        <Text variant="title">Grade {grade} · {fil ? 'Piliin ang paksa' : 'Pick a subject'}</Text>
        <Text variant="body" color="textSecondary">{fil ? 'Maiikling tanong, malinaw na sagot. Kahit walang internet.' : 'Small questions. Clear explanations. Ready without internet.'}</Text>
        <Chip label={fil ? 'Palitan ang baitang' : 'Change grade'} onPress={() => router.push('/profile')} />
      </Card>
      {[{ id: 'mixed' as const, label: fil ? 'Surprise me · All subjects' : 'Surprise me · All subjects' }, ...SUBJECTS].map((subject, index) => (
        <Card key={subject.id} onPress={() => { useAppStore.getState().setLearningSubject(subject.id); router.push('/feed'); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }} accessibilityLabel={`Practice ${subject.label}, grade ${grade}`}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.accentTint, alignItems: 'center', justifyContent: 'center' }}><Text variant="title" color="accent">{['✦', '＋', 'Aa', 'Ab', '⚗', '◎'][index]}</Text></View>
          <View style={{ flex: 1, gap: 4 }}><Text variant="headline">{subject.label}</Text><Text variant="subhead">{subject.id === 'mixed' ? '50' : '10'} {fil ? 'tanong sa baitang mo' : 'questions for your grade'}</Text></View>
          <Play size={20} color={c.accent} weight="fill" />
        </Card>
      ))}
    </View>
  );
}

function Skills() {
  const { c } = useTheme();
  const t = useT();
  const L = useL();
  const live = useLive();
  const mastery = useAppStore((s) => s.mastery);
  const { width } = useWindowDimensions();
  const graphW = Math.min(width, 560) - space.screen * 2 - space.card * 2;
  const sorted = [...SKILLS].sort((a, b) => mastery[a.id] - mastery[b.id]);
  const open = (id: string) => router.push({ pathname: '/skill/[id]', params: { id } });

  return (
    <>
      <Stagger index={0}>
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <View>
              <Text variant="title">{t.learn.mapTitle}</Text>
              <Text variant="subhead">{t.learn.mapSub}</Text>
            </View>
            <Chip label={`${t.learn.rootGap}: ${L(SKILL_BY_ID[live.root].name)}`} kind="accent" />
          </View>
          <SkillGraph mastery={mastery} root={live.root} blocked={live.blocked} width={graphW} onPress={open} />
          <View style={styles.legend}>
            {[
              [c.accentFaded, t.learn.legendLow],
              [c.warning, '50%+'],
              [c.success, t.learn.legendHigh],
            ].map(([col, label]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: col }]} />
                <Text variant="caption">{label}</Text>
              </View>
            ))}
          </View>
        </Card>
      </Stagger>
      <Stagger index={1}>
        <ListGroup>
          {sorted.map((s) => (
            <ListRow
              key={s.id}
              title={L(s.name)}
              value={`${Math.round(mastery[s.id] * 100)}%`}
              onPress={() => open(s.id)}
            />
          ))}
        </ListGroup>
      </Stagger>
    </>
  );
}

const styles = StyleSheet.create({
  seg: { marginTop: 8, marginBottom: 4 },
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: 2 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', gap: space.gap },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  mt: { marginTop: 10 },
  continue: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  feed: {
    borderRadius: radius.tile,
    borderCurve: 'continuous',
    padding: 18,
    minHeight: 190,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  feedArt: { position: 'absolute', right: -14, top: -6 },
  feedText: { gap: 2, maxWidth: '62%' },
  feedMeter: { gap: 8, maxWidth: '70%' },
  darkTrack: { backgroundColor: 'rgba(255,255,255,0.12)' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
