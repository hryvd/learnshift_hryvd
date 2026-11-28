import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullQuizOverlay } from '@/components/student/FullQuizOverlay';
import { DecelerationDeckView } from '@/components/student/MicroDeckView';
import { SUBJECTS, type SubjectId } from '@/data/localQuestions';
import { exitToHome, exitToLastApp } from '@/services/exitBreak';
import { lastUsedApp } from '@/services/monitor';

function parseSubjectParam(raw?: string): SubjectId | 'mixed' | undefined {
  if (!raw) return undefined;
  if (raw === 'mixed') return 'mixed';
  return SUBJECTS.some((s) => s.id === raw) ? (raw as SubjectId) : undefined;
}

/** Five questions, then a clear stopping point. Preferences live in Profile -> Personalization. */
export default function Feed() {
  const { mode, subject } = useLocalSearchParams<{ mode?: string; subject?: string }>();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [appName] = useState(() => lastUsedApp() || 'LearnShift');
  const subjectOverride = parseSubjectParam(subject);
  // The feed opens from inside LearnShift (Home, Learn, Shift): Home is the main exit,
  // the last real app is optional. Both remove this screen so reopening never loops here.
  const unlock = () => (appName === 'LearnShift' ? exitToHome() : exitToLastApp());
  if (mode === 'decel') {
    return (
      <DecelerationDeckView
        pageHeight={height}
        pageWidth={width}
        topOffset={insets.top + 20}
        onCloseApp={() => router.back()}
        onWindDown={() => router.push('/winddown')}
        onDismiss={() => router.back()}
      />
    );
  }
  return (
    <FullQuizOverlay
      appName={appName}
      onUnlock={unlock}
      onHome={exitToHome}
      onDismiss={exitToHome}
      subjectOverride={subjectOverride}
    />
  );
}
