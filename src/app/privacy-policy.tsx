import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/design/theme';

const SECTIONS: [string, string[]][] = [
  [
    'Who this covers',
    [
      'This policy covers LearnShift for Teachers, the desktop app and website teachers use to run classes on LearnShift.',
      'Students and families use the separate LearnShift phone app.',
    ],
  ],
  [
    'What we store about teachers',
    [
      'Your name and email address, and your password (stored only as a secure hash by our sign-in provider).',
      'The classes you create, their join codes, and the lesson modules, flashcards and quiz questions you publish.',
      'Your reviews of the AI tutor’s explanations.',
    ],
  ],
  [
    'What teachers can see about students',
    [
      'Only students who joined your class with its code.',
      'Learning data only: answers to practice questions, skill mastery over time, and tutor explanations flagged for review.',
      'Teachers never see screen time, app usage, location, messages or anything a guardian controls. This is enforced by the database, not only by the app.',
    ],
  ],
  [
    'Lesson files',
    [
      'PDF, Word and text files you upload are read on your own computer. Only the lesson text you approve is sent to generate flashcards and quizzes, and only a short excerpt is stored with the module.',
    ],
  ],
  [
    'On your computer',
    [
      'To keep your classes readable when the internet drops, the app keeps a copy of your class data in this browser. Signing out deletes it. Shared laptop mode turns this copy off completely.',
    ],
  ],
  [
    'Where data is kept',
    [
      'Data is stored with Supabase, our database provider, protected by row-level security so each account can reach only what it is allowed to. Connections are encrypted (HTTPS).',
      'We do not sell data, show ads, or share data with advertisers.',
    ],
  ],
  [
    'Deleting your account',
    [
      'Settings › Delete account removes your account, your classes and their modules. Students keep their own learning history in their own accounts.',
    ],
  ],
];

/** Privacy policy (linked from the Microsoft Store listing). */
export default function PrivacyPolicy() {
  const { c } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.body}>
      <View style={styles.col}>
        <Text variant="overline">LearnShift for Teachers</Text>
        <Text style={[styles.h1, { color: c.text }]} role="heading" aria-level={1}>
          Privacy policy
        </Text>
        <Text variant="subhead">Last updated 27 November 2026</Text>
        {SECTIONS.map(([h, ps]) => (
          <View key={h} style={styles.section}>
            <Text variant="title" role="heading" aria-level={2}>
              {h}
            </Text>
            {ps.map((p, i) => (
              <Text key={i} variant="body" style={styles.p}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 32, alignItems: 'center' },
  col: { width: '100%', maxWidth: 720, gap: 8 },
  h1: { fontFamily: 'Inter_800ExtraBold', fontSize: 36, letterSpacing: -1, marginTop: 4 },
  section: { gap: 8, marginTop: 20 },
  p: { lineHeight: 24 },
});
