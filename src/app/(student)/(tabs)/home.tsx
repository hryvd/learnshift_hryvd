import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, BookOpen, Clock, GearSix, MoonStars, ShieldCheck } from 'phosphor-react-native';

import { Paty } from '@/components/mascot/Paty';
import { Screen } from '@/components/student/Screen';
import { Card, PillButton, PressableScale, Stagger, Text } from '@/components/ui';
import { SUBJECTS } from '@/data/localQuestions';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { useLive } from '@/hooks/useLive';
import { formatDuration } from '@/i18n/useT';
import { platform } from '@/services/monitor';
import { useDevice } from '@/services/monitor/bridge';
import { useAppStore } from '@/store/useAppStore';

export default function Home() {
  const { c } = useTheme();
  const name = useAppStore((s) => s.studentName);
  const grade = useAppStore((s) => s.learningGrade);
  const subject = useAppStore((s) => s.learningSubject);
  const paused = useAppStore((s) => s.paused);
  const lang = useAppStore((s) => s.lang);
  const fil = lang === 'fil';
  const dev = useDevice((s) => s.status);
  const live = useLive();
  const protectedApps = platform === 'android' && dev.access && dev.overlay && dev.scrollAccess && dev.running && !paused;
  return (
    <Screen tabs>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="overline">LEARN SHIFT</Text>
          <Text variant="largeTitle">{fil ? 'Kumusta' : 'Hey'}{name ? `, ${name.split(' ')[0]}` : ''}!</Text>
        </View>
        <PressableScale accessibilityLabel="Open settings" onPress={() => router.push('/profile')} style={[styles.icon, { backgroundColor: c.card }]}>
          <GearSix size={24} color={c.text} />
        </PressableScale>
      </View>
      <Stagger index={0}>
        <Card style={styles.hero}>
          <View style={styles.heroHead}>
            <View style={styles.flex}>
              <Text variant="overline" color="accent">{fil ? 'MALIIT NA HAKBANG, BAGONG KAALAMAN' : 'A LITTLE BREAK. A NEW IDEA.'}</Text>
              <Text variant="largeTitle" style={styles.headline}>{'Scrolling\nbetter minutes.'}</Text>
            </View>
            <Paty size={88} expression="happy" prop="pencil" />
          </View>
          <Text variant="body" color="textSecondary">{fil ? 'Pumili ng sagot. Alamin kung bakit. Mag-swipe kapag handa ka na.' : 'Pick an answer. Find out why. Swipe when you’re ready.'}</Text>
          <View style={[styles.tag, { backgroundColor: c.inset }]}>
            <BookOpen size={18} color={c.accent} />
            <Text variant="subhead">Grade {grade} · {SUBJECTS.find((s) => s.id === subject)?.label ?? (fil ? 'Lahat ng paksa' : 'All subjects')} · Offline</Text>
          </View>
          <PillButton label={fil ? 'Tara, matuto!' : 'Let’s learn'} block size="lg" icon={<ArrowRight size={20} color={c.onAccent} />} onPress={() => router.push('/feed')} />
        </Card>
      </Stagger>
      <Stagger index={1} style={styles.row}>
        <Card style={styles.flex} onPress={() => router.push('/focus')} accessibilityLabel="Start a focus break">
          <Clock size={25} color={c.accent} />
          <Text variant="title" style={styles.mt}>{fil ? 'Oras para tumutok' : 'Time to focus'}</Text>
          <Text variant="subhead">{fil ? 'Magpahinga sa pag-scroll.' : 'Take a break from scrolling.'}</Text>
        </Card>
        <Card style={styles.flex} onPress={() => router.push('/isla')} accessibilityLabel="Visit your island">
          <Text variant="title">🏝️</Text>
          <Text variant="title" style={styles.mt}>{fil ? 'Iyong isla' : 'Your little isla'}</Text>
          <Text variant="subhead">{fil ? 'Tingnan ang iyong nagawa.' : 'See what you’ve grown.'}</Text>
        </Card>
      </Stagger>
      <Stagger index={2}>
        <Card style={styles.gap}>
          <View style={styles.row}>
            <ShieldCheck size={24} color={protectedApps ? c.success : c.accent} />
            <Text variant="headline" style={styles.flex}>{protectedApps ? (fil ? 'Handa ang learning breaks' : 'Learning breaks are ready') : (fil ? 'Ikaw ang may kontrol' : 'You’re in control')}</Text>
          </View>
          <Text variant="body" color="textSecondary">{fil ? 'Ang timer ay paalala lang. Lalabas ang tanong sa susunod mong pag-swipe pataas sa suportadong app.' : 'The timer is only a heads-up. A question appears on your next upward scroll in a supported app.'}</Text>
          <PillButton label={fil ? 'Mga setting ng pahinga' : 'Break settings'} kind="secondary" onPress={() => router.push('/profile')} />
        </Card>
      </Stagger>
      <Stagger index={3}>
        <Card style={styles.today} onPress={() => router.push('/insights')}>
          <View style={styles.flex}>
            <Text variant="overline">{fil ? 'NGAYON' : 'TODAY'}</Text>
            <Text variant="title">{formatDuration(live.usedMinutes)}</Text>
            <Text variant="subhead">{fil ? 'Oras sa screen' : 'Screen time'}</Text>
          </View>
          <MoonStars size={32} color={c.indigo} />
        </Card>
      </Stagger>
    </Screen>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  hero: { gap: 20, paddingVertical: 24 }, heroHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { marginTop: 12, fontSize: 30, lineHeight: 36 }, tag: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14 },
  row: { flexDirection: 'row', gap: space.gap }, mt: { marginTop: 12, marginBottom: 6 }, gap: { gap: 14 },
  today: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
