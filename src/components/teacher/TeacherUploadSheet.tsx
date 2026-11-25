import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { BookOpenText, CheckCircle, FileArrowUp, Plus, Sparkle, WifiHigh } from '@/components/ui/icons';

import { Chip, IconButton, Notice, PillButton, PressableScale, Text } from '@/components/ui';
import { haptic } from '@/design/haptics';
import { spring } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { FONT_SECONDARY, fontFor } from '@/design/typography';
import { IS_PITCH, PITCH_NAMES } from '@/lib/config';
import {
  generateModuleDeck,
  SAMPLE_MODULE_TEXT,
  type GeneratedModuleDeck,
} from '@/services/ai/moduleGenerator';
import { publishModulesToClasses, useTeacher } from '@/services/backend/teacher';
import { pickModuleFile } from '@/services/monitor';

const SUBJECTS = ['Math', 'Science', 'English', 'Filipino', 'General'] as const;

/**
 * Center-docked 3D flip-and-grow card sheet triggered from the middle '+' button
 * on TeacherTabBar. Lets teachers drop/select a lesson file, generate & inspect
 * flashcards + quiz breaks, choose which class(es) receive them, and approve
 * direct phone-to-phone hosting.
 */
export function TeacherUploadSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const visible = useTeacher((s) => s.uploadOpen);
  const setUploadOpen = useTeacher((s) => s.setUploadOpen);
  const classes = useTeacher((s) => s.classes);
  const selectedClass = useTeacher((s) => s.selected);

  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);

  const [step, setStep] = useState<'upload' | 'approve'>('upload');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<string>('Math');
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);
  const [deck, setDeck] = useState<GeneratedModuleDeck | null>(null);
  const [pickedTargetIds, setPickedTargetIds] = useState<string[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneBanner, setDoneBanner] = useState<string | null>(null);

  const webInputRef = useRef<HTMLInputElement | null>(null);
  const defaultTargetId = IS_PITCH ? 'sampaguita' : (selectedClass ?? classes[0]?.id ?? '');
  const targetIds = pickedTargetIds ?? (defaultTargetId ? [defaultTargetId] : []);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      progress.set(withSpring(1, { damping: 16, stiffness: 165, mass: 0.9 }));
    } else {
      progress.set(
        withSpring(0, { ...spring.snappy, overshootClamping: true }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, mounted, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
  }));

  const growWrapperStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      transform: [
        { perspective: 1200 },
        { translateY: interpolate(p, [0, 1], [220, 0], Extrapolation.CLAMP) },
        { scale: interpolate(p, [0, 1], [0.24, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  const frontFaceStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p < 0.45 ? 1 : 0,
      transform: [{ perspective: 1200 }, { rotateY: `${interpolate(p, [0, 0.5], [0, 90], Extrapolation.CLAMP)}deg` }],
    };
  });

  const backFaceStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p >= 0.42 ? 1 : 0,
      transform: [{ perspective: 1200 }, { rotateY: `${interpolate(p, [0.42, 1], [-90, 0], Extrapolation.CLAMP)}deg` }],
    };
  });

  const resetForm = () => {
    setStep('upload');
    setTitle('');
    setSubject('Math');
    setSourceName(null);
    setContent('');
    setShowPaste(false);
    setDeck(null);
    setPickedTargetIds(null);
    setError(null);
    setDoneBanner(null);
  };

  const closeSheet = () => {
    haptic.select();
    setUploadOpen(false);
  };

  const applyUploadedText = (fileName: string, rawText: string) => {
    setError(null);
    setDoneBanner(null);
    if (/[\u0000-\u0008\u000E-\u001F]/.test(rawText.slice(0, 800))) {
      setError('Binary file detected. Choose a .txt, .md, .csv, or .html file, or paste lesson notes.');
      return;
    }
    const clean = rawText.trim().slice(0, 10000);
    if (clean.length < 30) {
      setError('File has very little text. Try a fuller lesson file or paste your notes.');
      return;
    }
    setSourceName(fileName);
    if (!title.trim()) {
      setTitle(fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80));
    }
    setContent(clean);
    haptic.success();
  };

  const readWebFile = async (file: File) => {
    try {
      const txt = await file.text();
      applyUploadedText(file.name, txt);
    } catch {
      setError('Could not read that file.');
    }
  };

  const handleWebInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void readWebFile(file);
  };

  const pickFile = async () => {
    haptic.select();
    setError(null);
    if (Platform.OS === 'web') {
      webInputRef.current?.click();
      return;
    }
    const picked = await pickModuleFile();
    if (!picked) return;
    if (picked.error) {
      setError(picked.error);
      return;
    }
    applyUploadedText(picked.name, picked.text);
  };

  const handleGenerate = async () => {
    setError(null);
    setDoneBanner(null);
    const effectiveTitle = title.trim() || sourceName?.replace(/\.[^/.]+$/, '') || 'Lesson Module';
    if (content.trim().length < 30) {
      setError('Drop/select a lesson file, load the sample lesson, or paste at least 2 sentences first.');
      return;
    }
    if (!title.trim()) setTitle(effectiveTitle);
    setGenerating(true);
    try {
      const generated = await generateModuleDeck({
        title: effectiveTitle,
        subject,
        content: content.trim(),
      });
      setDeck(generated);
      setStep('approve');
      haptic.success();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const toggleClass = (id: string) => {
    haptic.select();
    setPickedTargetIds((prev) => {
      const cur = prev ?? targetIds;
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  };

  const handleApprovePublish = async () => {
    if (!deck || publishing) return;
    const chosenIds = IS_PITCH ? ['sampaguita'] : targetIds;
    if (chosenIds.length === 0) {
      setError('Select at least one class to receive these flashcards & quiz questions.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const { saved, lanUrl } = await publishModulesToClasses(chosenIds, {
        title: title.trim() || 'Lesson Module',
        subject,
        sourceName,
        summary: deck.summary,
        flashcards: deck.flashcards,
        questions: deck.questions,
      });
      haptic.success();
      const clsWord = saved.length === 1 ? '1 class' : `${saved.length} classes`;
      setDoneBanner(
        lanUrl
          ? `Approved for ${clsWord}. Students download directly from your phone (${lanUrl}).`
          : `Approved for ${clsWord}. Hosted locally on your phone & synced directly to students.`,
      );
      setTimeout(() => {
        resetForm();
        setUploadOpen(false);
      }, 1100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  if (!mounted) return null;

  const availableClasses = IS_PITCH
    ? [{ id: 'sampaguita', name: `Grade 8 - ${PITCH_NAMES.section}`, grade: 8, join_code: 'SAMP8' }]
    : classes;

  const webDropProps =
    Platform.OS === 'web'
      ? ({
          onDragOver: (e: { preventDefault: () => void }) => {
            e.preventDefault();
            setDraggingOver(true);
          },
          onDragLeave: () => setDraggingOver(false),
          onDrop: (e: { preventDefault: () => void; dataTransfer?: { files?: FileList } }) => {
            e.preventDefault();
            setDraggingOver(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) void readWebFile(file);
          },
        } as Record<string, unknown>)
      : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      {Platform.OS === 'web' ? (
        <input
          ref={webInputRef}
          type="file"
          accept=".txt,.md,.csv,.json,.html,text/*"
          onChange={handleWebInput}
          style={{ display: 'none' }}
        />
      ) : null}

      <Animated.View style={[styles.scrim, { backgroundColor: c.scrim }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close upload card" />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.centerWrap, { paddingBottom: Math.max(insets.bottom + 82, 92), paddingTop: insets.top + 16 }]}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.cardFrame, growWrapperStyle]}>
          {/* Compact front face shown briefly at the start of the 3D flip */}
          <Animated.View style={[styles.frontFace, { backgroundColor: '#C84317' }, frontFaceStyle]} pointerEvents="none">
            <Plus size={44} weight="bold" color="#FFFFFF" />
            <Text variant="title" color="#FFFFFF" align="center">
              UPLOAD MODULE
            </Text>
          </Animated.View>

          {/* Back face: expands into drag-drop upload & class approval workflow */}
          <Animated.View style={[styles.backCard, backFaceStyle]}>
            <View style={styles.topRow}>
              <View style={styles.titleRow}>
                <Plus size={22} weight="bold" color="#FFFFFF" />
                <Text variant="title" color="#FFFFFF" numberOfLines={1} style={styles.flex}>
                  {step === 'upload' ? 'UPLOAD MODULE' : 'APPROVE & SEND'}
                </Text>
              </View>
              <IconButton kind="close" tone="onAccent" size={34} accessibilityLabel="Close upload sheet" onPress={closeSheet} />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollInner}
            >
              {error ? <Notice text={error} /> : null}
              {doneBanner ? (
                <View style={styles.doneBanner}>
                  <CheckCircle size={18} weight="fill" color="#187B43" />
                  <Text variant="subhead" color="#111111" style={styles.flex}>
                    {doneBanner}
                  </Text>
                </View>
              ) : null}

              {step === 'upload' ? (
                <>
                  <PressableScale
                    onPress={() => void pickFile()}
                    accessibilityLabel="Drag and drop or tap to select lesson file"
                    style={styles.dropTap}
                  >
                    <View
                      {...(webDropProps ?? {})}
                      style={[
                        styles.dropZone,
                        draggingOver && styles.dropZoneActive,
                      ]}
                    >
                      <FileArrowUp size={30} weight="fill" color="#FFFFFF" />
                      <Text variant="title" color="#FFFFFF" align="center">
                        {sourceName ? sourceName : 'DRAG & DROP HERE'}
                      </Text>
                      <Text variant="caption" color="rgba(255,255,255,0.92)" align="center">
                        {content
                          ? `${content.length.toLocaleString('en-US')} chars ready for flashcards & quiz`
                          : 'Supports .txt, .md, .csv, .html'}
                      </Text>
                    </View>
                  </PressableScale>

                  <PressableScale
                    onPress={() => void pickFile()}
                    accessibilityLabel="Select module to upload"
                    style={styles.selectPill}
                  >
                    <Text variant="headline" color="#C84317" style={[fontFor(800), styles.selectLabel]}>
                      SELECT MODULE TO UPLOAD
                    </Text>
                  </PressableScale>

                  <View style={styles.helperRow}>
                    <PressableScale
                      onPress={() => {
                        haptic.select();
                        setShowPaste((v) => !v);
                      }}
                      style={styles.ghostChip}
                    >
                      <Text variant="caption" color="#FFFFFF">
                        {showPaste ? 'Hide notes box' : 'Paste lesson notes'}
                      </Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => {
                        haptic.select();
                        setError(null);
                        setTitle('Linear Equations & Slope');
                        setSubject('Math');
                        setSourceName('sample-linear-equations.txt');
                        setContent(SAMPLE_MODULE_TEXT);
                      }}
                      style={styles.ghostChip}
                    >
                      <Text variant="caption" color="#FFFFFF">
                        Load sample lesson
                      </Text>
                    </PressableScale>
                  </View>

                  {content || showPaste ? (
                    <View style={styles.metaPanel}>
                      <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="Module title (e.g. Linear Equations)"
                        placeholderTextColor="rgba(17,17,17,0.45)"
                        style={styles.whiteInput}
                        maxLength={120}
                      />
                      <View style={styles.subjRow}>
                        {SUBJECTS.map((subj) => {
                          const active = subject === subj;
                          return (
                            <PressableScale
                              key={subj}
                              onPress={() => setSubject(subj)}
                              style={[styles.subjBtn, { backgroundColor: active ? '#C84317' : '#F3F2EE' }]}
                            >
                              <Text variant="caption" color={active ? '#FFFFFF' : '#111111'}>
                                {subj}
                              </Text>
                            </PressableScale>
                          );
                        })}
                      </View>
                      {showPaste ? (
                        <TextInput
                          value={content}
                          onChangeText={setContent}
                          placeholder="Paste definitions, formulas, or reading notes..."
                          placeholderTextColor="rgba(17,17,17,0.45)"
                          multiline
                          textAlignVertical="top"
                          style={[styles.whiteInput, styles.pasteInput]}
                        />
                      ) : null}
                      <PillButton
                        label={generating ? 'Building flashcards & quiz...' : 'Review & Create Flashcards'}
                        icon={<Sparkle size={17} weight="fill" color="#FFFFFF" />}
                        block
                        size="lg"
                        disabled={generating || content.trim().length < 30}
                        onPress={() => void handleGenerate()}
                        style={{ backgroundColor: '#161616' }}
                      />
                    </View>
                  ) : null}
                </>
              ) : deck ? (
                <View style={styles.metaPanel}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flex}>
                      <Text variant="title" color="#111111" numberOfLines={2}>
                        {title.trim() || 'Generated Module'}
                      </Text>
                      <Text variant="caption" color="#62666C">
                        {subject} · {deck.flashcards.length} flashcards · {deck.questions.length} quiz questions
                      </Text>
                    </View>
                    <Chip label="Back" kind="neutral" onPress={() => setStep('upload')} />
                  </View>

                  <Text variant="subhead" color="#4B5057">
                    {deck.summary}
                  </Text>

                  <Text variant="overline" color="#C84317">
                    Select class to receive this module
                  </Text>
                  <View style={styles.classWrap}>
                    {availableClasses.length > 1 ? (
                      <PressableScale
                        onPress={() => {
                          haptic.select();
                          setPickedTargetIds(
                            targetIds.length === availableClasses.length
                              ? [availableClasses[0].id]
                              : availableClasses.map((cl) => cl.id),
                          );
                        }}
                        style={[
                          styles.classPill,
                          {
                            backgroundColor: targetIds.length === availableClasses.length ? '#C84317' : '#EFECE6',
                          },
                        ]}
                      >
                        <Text
                          variant="caption"
                          color={targetIds.length === availableClasses.length ? '#FFFFFF' : '#111111'}
                        >
                          All classes
                        </Text>
                      </PressableScale>
                    ) : null}
                    {availableClasses.map((cl) => {
                      const picked = targetIds.includes(cl.id);
                      return (
                        <PressableScale
                          key={cl.id}
                          onPress={() => toggleClass(cl.id)}
                          accessibilityState={{ selected: picked }}
                          style={[
                            styles.classPill,
                            { backgroundColor: picked ? '#C84317' : '#EFECE6' },
                          ]}
                        >
                          {picked ? <CheckCircle size={15} weight="fill" color="#FFFFFF" /> : <BookOpenText size={15} color="#62666C" />}
                          <Text variant="caption" color={picked ? '#FFFFFF' : '#111111'}>
                            {cl.name}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>

                  <View style={styles.p2pNote}>
                    <WifiHigh size={16} weight="bold" color="#187B43" />
                    <Text variant="caption" color="#187B43" style={styles.flex}>
                      Saved on your phone & downloaded directly by students to save cloud storage.
                    </Text>
                  </View>

                  <Text variant="overline" color="#62666C">
                    Flashcards ({deck.flashcards.length})
                  </Text>
                  {deck.flashcards.map((fc, idx) => (
                    <View key={fc.id} style={styles.itemCard}>
                      <View style={styles.rowBetween}>
                        <Text variant="subhead" color="#C84317" style={styles.flex}>
                          #{idx + 1} · {fc.front}
                        </Text>
                        {deck.flashcards.length > 1 ? (
                          <IconButton
                            kind="remove"
                            tone="danger"
                            size={30}
                            accessibilityLabel="Remove flashcard"
                            onPress={() =>
                              setDeck((d) =>
                                d ? { ...d, flashcards: d.flashcards.filter((x) => x.id !== fc.id) } : null,
                              )
                            }
                          />
                        ) : null}
                      </View>
                      <Text variant="caption" color="#33363B">
                        {fc.back}
                      </Text>
                    </View>
                  ))}

                  <Text variant="overline" color="#62666C">
                    Quiz Breaks ({deck.questions.length})
                  </Text>
                  {deck.questions.map((q, idx) => (
                    <View key={q.id} style={styles.itemCard}>
                      <View style={styles.rowBetween}>
                        <Text variant="subhead" color="#111111" style={styles.flex}>
                          Q{idx + 1}. {q.prompt}
                        </Text>
                        {deck.questions.length > 1 ? (
                          <IconButton
                            kind="remove"
                            tone="danger"
                            size={30}
                            accessibilityLabel="Remove quiz question"
                            onPress={() =>
                              setDeck((d) =>
                                d ? { ...d, questions: d.questions.filter((x) => x.id !== q.id) } : null,
                              )
                            }
                          />
                        ) : null}
                      </View>
                      <Text variant="caption" color="#187B43">
                        Answer: {q.options[q.answer]}
                      </Text>
                    </View>
                  ))}

                  <PillButton
                    label={publishing ? 'Sharing to class phones...' : 'Approve & Send to Class'}
                    block
                    size="lg"
                    disabled={publishing || targetIds.length === 0}
                    onPress={() => void handleApprovePublish()}
                  />
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  centerWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  cardFrame: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '88%',
  },
  frontFace: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
    height: 180,
    borderRadius: radius.sheet,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  backCard: {
    backgroundColor: '#C84317',
    borderRadius: radius.sheet,
    borderCurve: 'continuous',
    padding: 20,
    maxHeight: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  flex: { flex: 1 },
  scrollInner: { gap: 14, paddingBottom: 4 },
  dropTap: { width: '100%' },
  dropZone: {
    backgroundColor: '#F4A98E',
    borderRadius: 26,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.9)',
    minHeight: 186,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dropZoneActive: { backgroundColor: '#F7BDAA', borderColor: '#FFFFFF' },
  selectPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  selectLabel: { fontSize: 15, letterSpacing: 0.4 },
  helperRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  ghostChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  metaPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  whiteInput: {
    backgroundColor: '#F3F2EE',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111111',
    fontFamily: FONT_SECONDARY,
  },
  pasteInput: { minHeight: 96 },
  subjRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subjBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  classWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  p2pNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E9F7EE',
    borderRadius: 12,
    padding: 10,
  },
  itemCard: {
    backgroundColor: '#F4F4F0',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E9F7EE',
    borderRadius: 14,
    padding: 12,
  },
});
