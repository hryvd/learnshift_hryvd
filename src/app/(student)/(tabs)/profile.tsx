import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { FileText, GearSix, Info, Lifebuoy, ShieldCheck, Sparkle, UserCircle } from '@/components/ui/icons';

import { PatyAvatar } from '@/components/mascot/Paty';
import { Screen } from '@/components/student/Screen';
import { BooksArt, LanguageArt, MoonArt, ShieldArt } from '@/components/student/TileArt';
import { Card, DarkTile, LargeTitleHeader, ListGroup, ListRow, SegmentedControl, Stagger, Text } from '@/components/ui';
import { SUBJECTS } from '@/data/localQuestions';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { formatClock, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import * as api from '@/services/backend/api';
import { flushStudent } from '@/services/backend/sync';
import { useDevice } from '@/services/monitor/bridge';
import { patchProfile, useAuth } from '@/store/useAuth';
import { useAppStore, type ThemePref } from '@/store/useAppStore';

export default function Profile() {
  const { c } = useTheme();
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const bedtime = useAppStore((s) => s.bedtime);
  const guardian = useAppStore((s) => s.guardian);
  const offline = useAppStore((s) => s.offline);
  const themePref = useAppStore((s) => s.themePref);
  const name = useAppStore((s) => s.studentName);
  const classes = useAppStore((s) => s.classes);
  const userId = useAuth((s) => s.profile?.id ?? null);
  const grade = useAuth((s) => s.profile?.grade ?? null);
  const learningGrade = useAppStore((s) => s.learningGrade);
  const learningSubject = useAppStore((s) => s.learningSubject);
  const fil = lang === 'fil';
  const displayGrade = IS_PITCH ? learningGrade : (learningGrade || grade);
  const subjectLabel =
    learningSubject === 'mixed'
      ? t.profile.allSubjects
      : (SUBJECTS.find((s) => s.id === learningSubject)?.label ?? t.profile.allSubjects);
  const personalizationValue = `Grade ${displayGrade} · ${subjectLabel}`;
  const syncSettingNow = () => {
    void useDevice.getState().refresh();
    if (!IS_PITCH && userId) void flushStudent(userId).catch(() => {});
  };

  let i = 0;
  return (
    <Screen tabs header={<LargeTitleHeader title={fil ? 'Mga Setting' : 'Settings'} />}>
      <Stagger index={i++}>
        <Card
          style={styles.me}
          onPress={IS_PITCH ? undefined : () => router.push('/account')}
          accessibilityLabel={IS_PITCH ? undefined : `${name}, ${t.profile.account}`}
        >
          <PatyAvatar size={58} />
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="subhead">{t.profile.grade(displayGrade, classes[0]?.name ?? '')}</Text>
          </View>
        </Card>
      </Stagger>

      <Stagger index={i++} style={styles.grid}>
        <DarkTile
          title={t.profile.bedtime}
          status={formatClock(bedtime.start)}
          style={styles.tile}
          onPress={() => router.push('/bedtime')}
          art={<MoonArt />}
        />
        <DarkTile
          title={t.profile.language}
          status={lang === 'en' ? t.common.english : t.common.filipino}
          style={styles.tile}
          onPress={() => {
            const nextLang = lang === 'en' ? 'fil' : 'en';
            useAppStore.getState().setLang(nextLang);
            if (!IS_PITCH && userId) {
              patchProfile({ lang: nextLang });
              void api.updateProfile({ lang: nextLang }).catch(() => {});
            }
            syncSettingNow();
          }}
          art={<LanguageArt />}
        />
        <DarkTile
          title={t.profile.guardian}
          status={guardian.linked ? `${t.profile.linked} · ${guardian.name}` : t.acct.linkTitle}
          statusAccent
          style={styles.tile}
          onPress={() => router.push(IS_PITCH ? '/privacy' : '/account')}
          art={<ShieldArt />}
        />
        <DarkTile
          title={t.profile.offline}
          status={t.learn.offlineStatus(offline.length)}
          style={styles.tile}
          onPress={() => router.push('/offline')}
          art={<BooksArt />}
        />
      </Stagger>

      <Stagger index={i++}>
        <Card style={styles.gap}>
          <Text variant="headline">{t.profile.appearance}</Text>
          <SegmentedControl<ThemePref>
            options={[
              { value: 'auto', label: t.profile.auto },
              { value: 'day', label: t.profile.day },
              { value: 'night', label: t.profile.night },
            ]}
            value={themePref}
            onChange={(p) => {
              useAppStore.getState().setThemePref(p);
              syncSettingNow();
            }}
          />
        </Card>
      </Stagger>

      <Stagger index={i++}>
        <ListGroup>
          <ListRow
            title={t.profile.personalization}
            value={personalizationValue}
            icon={<Sparkle size={20} weight="fill" color={c.accent} />}
            onPress={() => router.push('/personalization' as Href)}
          />
          {!IS_PITCH ? (
            <ListRow
              title={t.profile.account}
              icon={<UserCircle size={20} weight="fill" color={c.accent} />}
              onPress={() => router.push('/account')}
            />
          ) : null}
          <ListRow
            title={t.profile.advanced}
            icon={<GearSix size={20} weight="fill" color={c.textSecondary} />}
            onPress={() => router.push('/advanced' as Href)}
          />
        </ListGroup>
      </Stagger>

      <Stagger index={i++}>
        <ListGroup>
          <ListRow
            title={t.profile.privacy}
            icon={<ShieldCheck size={20} weight="fill" color={c.success} />}
            onPress={() => router.push('/privacy')}
          />
          <ListRow
            title={t.profile.help}
            icon={<Lifebuoy size={20} weight="fill" color={c.tabInsights} />}
            onPress={() => router.push('/tutor')}
          />
          <ListRow
            title={t.profile.terms}
            icon={<FileText size={20} weight="fill" color={c.textSecondary} />}
            onPress={() => router.push('/privacy')}
          />
          <ListRow
            title={t.profile.version}
            value="1.0.0"
            icon={<Info size={20} weight="fill" color={c.textSecondary} />}
            chevron={false}
          />
        </ListGroup>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  tile: { flexBasis: '47%', flexGrow: 1 },
});
