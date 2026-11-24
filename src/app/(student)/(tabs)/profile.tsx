import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Clock, FileText, HouseLine, Info, Lifebuoy, ShieldCheck, UserCircle } from 'phosphor-react-native';

import { PatyAvatar } from '@/components/mascot/Paty';
import { Screen } from '@/components/student/Screen';
import { BooksArt, LanguageArt, MoonArt, ShieldArt } from '@/components/student/TileArt';
import { Card, DarkTile, LargeTitleHeader, ListGroup, ListRow, PressableScale, SegmentedControl, Stagger, Text, Toggle } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { SUBJECTS } from '@/data/localQuestions';
import { useTheme } from '@/design/theme';
import { radius, space } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { formatClock, useT } from '@/i18n/useT';
import { IS_PITCH } from '@/lib/config';
import * as api from '@/services/backend/api';
import { flushStudent } from '@/services/backend/sync';
import { openBatterySettings, openOverlaySettings, openScrollSettings, platform, requestAccess } from '@/services/monitor';
import { useDevice } from '@/services/monitor/bridge';
import { patchProfile, useAuth } from '@/store/useAuth';
import { DEFAULT_SENTINEL, useAppStore, type ThemePref } from '@/store/useAppStore';
import { useSession } from '@/store/useSession';

const FREQ_OPTIONS = [
  { sec: 15, label: '15s' },
  { sec: 30, label: '30s' },
  { sec: 60, label: '1m' },
  { sec: 180, label: '3m' },
  { sec: 300, label: '5m' },
  { sec: 600, label: '10m' },
  { sec: 900, label: '15m' },
] as const;

export default function Profile() {
  const { c } = useTheme();
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const bedtime = useAppStore((s) => s.bedtime);
  const guardian = useAppStore((s) => s.guardian);
  const offline = useAppStore((s) => s.offline);
  const themePref = useAppStore((s) => s.themePref);
  const [confirm, setConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const name = useAppStore((s) => s.studentName);
  const classes = useAppStore((s) => s.classes);
  const userId = useAuth((s) => s.profile?.id ?? null);
  const grade = useAuth((s) => s.profile?.grade ?? null);
  const overlayIntervalSec = useAppStore((s) => s.sentinel?.overlayIntervalSec ?? DEFAULT_SENTINEL.overlayIntervalSec);
  const guardianBreakSec = useAppStore((s) => (s.guardian.linked ? s.limits.breakIntervalSec : null));
  const effectiveIntervalSec = guardianBreakSec ?? overlayIntervalSec;
  const monitorAllApps = useAppStore((s) => s.sentinel?.monitorAllApps ?? DEFAULT_SENTINEL.monitorAllApps);
  const learningGrade = useAppStore((s) => s.learningGrade);
  const learningSubject = useAppStore((s) => s.learningSubject);
  const fil = lang === 'fil';
  const devStatus = useDevice((s) => s.status);
  const pitchGrade = IS_PITCH ? 8 : grade;
  const syncSettingNow = () => {
    void useDevice.getState().refresh();
    if (!IS_PITCH && userId) void flushStudent(userId).catch(() => {});
  };

  let i = 0;
  return (
    <Screen tabs header={<LargeTitleHeader title={fil ? 'Mga Setting' : 'Settings'} />}>
      <Stagger index={i++}>
        <Card style={styles.me}>
          <PatyAvatar size={58} />
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="subhead">{t.profile.grade(pitchGrade, classes[0]?.name ?? '')}</Text>
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
          <Text variant="headline">{fil ? 'Ang iyong mga tanong' : 'Your questions'}</Text>
          <Text variant="subhead">{fil ? 'Piliin ang baitang at paksang gusto mong aralin.' : 'Choose your grade and what you want to practise.'}</Text>
          <Text variant="body">{fil ? 'Baitang' : 'Grade'}</Text>
          <View style={styles.freqRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((grade) => (
              <PressableScale
                key={grade}
                accessibilityLabel={`Grade ${grade}`}
                accessibilityState={{ selected: learningGrade === grade }}
                onPress={() => {
                  useAppStore.getState().setLearningGrade(grade);
                  if (!IS_PITCH && userId) {
                    patchProfile({ grade });
                    void api.updateProfile({ grade }).catch(() => {});
                  }
                  syncSettingNow();
                }}
                style={[styles.freqPill, { backgroundColor: learningGrade === grade ? c.accent : c.inset }]}
              >
                <Text color={learningGrade === grade ? c.onAccent : c.text}>{grade}</Text>
              </PressableScale>
            ))}
          </View>
          <Text variant="body">{fil ? 'Paksa' : 'Subject'}</Text>
          <View style={styles.freqRow}>
            {[{ id: 'mixed' as const, label: fil ? 'Lahat' : 'All subjects' }, ...SUBJECTS].map((subject) => (
              <PressableScale
                key={subject.id}
                accessibilityLabel={subject.label}
                accessibilityState={{ selected: learningSubject === subject.id }}
                onPress={() => {
                  useAppStore.getState().setLearningSubject(subject.id);
                  syncSettingNow();
                }}
                style={[styles.freqPill, { backgroundColor: learningSubject === subject.id ? c.accent : c.inset }]}
              >
                <Text color={learningSubject === subject.id ? c.onAccent : c.text}>{subject.label}</Text>
              </PressableScale>
            ))}
          </View>
          <Text variant="caption">{fil ? 'Nasa app ang 500 tanong. Ang mga sagot sa practice feed ay mananatili sa sesyon mo.' : '500 questions are included in the app. Practice-feed answers stay in your session.'}</Text>
        </Card>
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
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text variant="headline">{fil ? 'Kailan ka magpapahinga?' : 'When should a break be ready?'}</Text>
              <Text variant="subhead">
                {guardianBreakSec != null
                  ? fil
                    ? `Itinakda ni ${guardian.name || 'Guardian mo'}. Umiikli ito kapag tuloy-tuloy ka sa libangan.`
                    : `Set by ${guardian.name || 'your guardian'}. Shortens automatically if entertainment scrolling persists.`
                  : fil
                    ? 'Pagkatapos ng timer, maghihintay kami sa susunod mong pag-swipe pataas.'
                    : 'When the timer ends, we wait for your next upward scroll.'}
              </Text>
            </View>
            <Clock size={20} weight="fill" color={c.accent} />
          </View>
          <View style={styles.freqRow}>
            {FREQ_OPTIONS.map((opt) => {
              const active = effectiveIntervalSec === opt.sec;
              return (
                <PressableScale
                  key={opt.sec}
                  disabled={guardianBreakSec != null}
                  accessibilityLabel={`Break ready after ${opt.label}`}
                  accessibilityState={{ selected: active, disabled: guardianBreakSec != null }}
                  onPress={() => {
                    haptic.select();
                    useAppStore.getState().setOverlayInterval(opt.sec);
                    syncSettingNow();
                  }}
                  style={[
                    styles.freqPill,
                    { backgroundColor: active ? c.accent : c.inset, opacity: guardianBreakSec != null && !active ? 0.45 : 1 },
                  ]}
                >
                  <Text variant="caption" color={active ? c.onAccent : c.text} style={fontFor(700)}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text variant="subhead" color="text">
                Include other apps
              </Text>
              <Text variant="caption">Also include non-study apps beyond video, social and games.</Text>
            </View>
            <Toggle
              value={monitorAllApps}
              onChange={(v) => {
                useAppStore.getState().setMonitorAllApps(v);
                syncSettingNow();
              }}
              accessibilityLabel="Include other apps"
            />
          </View>
        </Card>
      </Stagger>

      {platform === 'android' ? (
        <Stagger index={i++}>
          <ListGroup>
            <ListRow
              title="App usage permission"
              value={devStatus.access ? 'On' : 'Tap to grant'}
              icon={<ShieldCheck size={20} weight="fill" color={devStatus.access ? c.success : c.accent} />}
              onPress={() => void requestAccess()}
            />
            <ListRow
              title="Show learning breaks over apps"
              value={devStatus.overlay ? 'On' : 'Tap to grant'}
              icon={<ShieldCheck size={20} weight="fill" color={devStatus.overlay ? c.success : c.accent} />}
              onPress={openOverlaySettings}
            />
            <ListRow
              title="Wait for my scroll"
              value={devStatus.scrollAccess ? 'On' : 'Set up'}
              icon={<ShieldCheck size={20} color={c.accent} />}
              onPress={openScrollSettings}
            />
            <ListRow
              title="Keep breaks running"
              value={devStatus.battery ? 'Unrestricted' : 'Optimize'}
              icon={<Info size={20} weight="fill" color={devStatus.battery ? c.success : c.textSecondary} />}
              onPress={openBatterySettings}
            />
          </ListGroup>
        </Stagger>
      ) : null}

      <Stagger index={i++}>
        <ListGroup>
          <ListRow title={fil ? 'Subukan ang pag-swipe' : 'Try the swipe demo'} value="Preview" icon={<Clock size={20} color={c.accent} />} onPress={() => router.push({ pathname: '/simulate', params: { app: 'tiktok' } })} />
          {IS_PITCH ? <ListRow title="Demo controls" icon={<Info size={20} color={c.accent} />} onPress={() => router.push('/demo')} /> : null}
          <ListRow title={fil ? 'I-setup ang learning breaks' : 'Set up learning breaks'} icon={<HouseLine size={20} color={c.accent} />} onPress={() => router.push('/account')} />
        </ListGroup>
      </Stagger>

      <Stagger index={i++}>
        <ListGroup>
          {!IS_PITCH ? (
            <ListRow
              title="Account"
              icon={<UserCircle size={20} weight="fill" color={c.accent} />}
              onPress={() => router.push('/account')}
            />
          ) : null}
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

      <Stagger index={i++}>
        <ListGroup>
          <ListRow
            title={IS_PITCH ? (cleared ? t.profile.delDone : confirm ? t.profile.delConfirm : t.profile.del) : t.profile.del}
            destructive
            chevron={false}
            onPress={() => {
              if (!IS_PITCH) {
                router.push('/account');
                return;
              }
              if (!confirm) {
                setConfirm(true);
                return;
              }
              useAppStore.getState().reset();
              useSession.getState().setSimMinutes(0);
              setConfirm(false);
              setCleared(true);
            }}
          />
        </ListGroup>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  freqPill: { paddingHorizontal: 12, minHeight: 48, minWidth: 48, borderRadius: radius.pill, justifyContent: 'center', alignItems: 'center' },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  tile: { flexBasis: '47%', flexGrow: 1 },
});
