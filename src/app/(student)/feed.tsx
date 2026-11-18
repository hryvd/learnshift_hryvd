import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullQuizOverlay } from '@/components/student/FullQuizOverlay';
import { DecelerationDeckView } from '@/components/student/MicroDeckView';
import { lastUsedApp, returnToLastApp } from '@/services/monitor';

/** Five questions, then a clear stopping point. Preferences live in Settings. */
export default function Feed() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [appName] = useState(() => lastUsedApp() || 'LearnShift');
  const unlock = () => {
    if (!returnToLastApp()) router.back();
  };
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
  return <FullQuizOverlay appName={appName} onUnlock={unlock} onDismiss={() => router.back()} />;
}
