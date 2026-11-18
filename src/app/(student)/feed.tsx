import { router, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullQuizOverlay } from '@/components/student/FullQuizOverlay';
import { DecelerationDeckView } from '@/components/student/MicroDeckView';

/** Five questions, then a clear stopping point. Preferences live in Settings. */
export default function Feed() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  return <FullQuizOverlay appName="LearnShift" onUnlock={() => router.back()} onDismiss={() => router.back()} />;
}
