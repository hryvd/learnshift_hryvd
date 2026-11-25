import { useEffect, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Ellipse, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { CrownSimple, Lighthouse, TrendUp } from '@/components/ui/icons';

import {
  Building,
  ISLA_CX,
  ISLA_VH,
  ISLA_VW,
  LAND,
  LandLayer,
  PALMS,
  Palm,
  Pier,
  palette,
  stand,
} from '@/components/isla/IslaScene';
import {
  bridgeTier,
  unlockedGroupBuildings,
  type Archipelago,
  type ArchipelagoMember,
  type BridgeTier,
  type GroupBuildingId,
} from '@/data/kapuluan';
import { BUILDINGS } from '@/data/seed';
import { spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { radius } from '@/design/tokens';
import { fontFor } from '@/design/typography';
import { Text } from '@/components/ui';

const WORLD_W = 860;
const WORLD_H = 620;
const CENTER_X = WORLD_W / 2;
const CENTER_Y = WORLD_H / 2 + 28;
const ME_WIDTH = 258;
const MATE_WIDTH = 212;

type SlotOffset = { dx: number; dy: number };

const FRIEND_SLOTS: Record<number, SlotOffset[]> = {
  0: [],
  1: [{ dx: 205, dy: -82 }],
  2: [
    { dx: -208, dy: -86 },
    { dx: 208, dy: -86 },
  ],
  3: [
    { dx: -212, dy: -92 },
    { dx: 212, dy: -92 },
    { dx: 200, dy: 112 },
  ],
  4: [
    { dx: -214, dy: -94 },
    { dx: 214, dy: -94 },
    { dx: -200, dy: 112 },
    { dx: 200, dy: 112 },
  ],
};

type PlacedMember = {
  member: ArchipelagoMember;
  x: number;
  y: number;
  w: number;
  h: number;
};

function computeMemberPositions(members: ArchipelagoMember[]): PlacedMember[] {
  const ordered = [...members].sort((a, b) =>
    a.isMe === b.isMe ? a.studentId.localeCompare(b.studentId) : a.isMe ? -1 : 1,
  );
  const me = ordered.find((m) => m.isMe) ?? ordered[0];
  const others = ordered.filter((m) => m.studentId !== me?.studentId).slice(0, 4);
  const slots = FRIEND_SLOTS[others.length] ?? FRIEND_SLOTS[4];

  const list: PlacedMember[] = [];
  if (me) {
    const mePush = me.driftLevel * 44;
    list.push({
      member: me,
      x: CENTER_X,
      y: CENTER_Y + mePush,
      w: ME_WIDTH,
      h: (ME_WIDTH * ISLA_VH) / ISLA_VW,
    });
  }

  others.forEach((m, idx) => {
    const slot = slots[idx] ?? { dx: 180, dy: -90 };
    const dist = Math.hypot(slot.dx, slot.dy) || 1;
    const driftPush = m.driftLevel * 78;
    const ux = slot.dx / dist;
    const uy = slot.dy / dist;
    list.push({
      member: m,
      x: CENTER_X + slot.dx + ux * driftPush,
      y: CENTER_Y + slot.dy + uy * driftPush,
      w: MATE_WIDTH,
      h: (MATE_WIDTH * ISLA_VH) / ISLA_VW,
    });
  });

  return list;
}

/** Draw one island cleanly inside a single SVG without nested GestureDetectors. */
function MiniIslandSvg({
  member,
  w,
  h,
  night,
  tiles,
}: {
  member: ArchipelagoMember;
  w: number;
  h: number;
  night: boolean;
  tiles: { col: number; row: number }[];
}) {
  const p = palette(night);
  const drifting = member.driftLevel >= 0.25;
  const farAdrift = member.driftLevel >= 0.55;
  const waterY = 56 + 3 * 28 + 8;

  const things: { key: string; depth: number; node: ReactNode }[] = [];
  BUILDINGS.forEach((b) => {
    if (!member.built.includes(b.id)) return;
    const pt = stand(b.cell[0], b.cell[1]);
    things.push({
      key: `b-${b.id}`,
      depth: b.cell[0] + b.cell[1] + b.cell[0] * 0.01,
      node: <Building key={b.id} id={b.id} x={pt.x} y={pt.y} night={night} />,
    });
  });

  PALMS.forEach(([col, row], i) => {
    const pt = stand(col, row);
    things.push({
      key: `p-${i}`,
      depth: col + row + col * 0.01,
      node: <Palm key={`palm-${i}`} x={pt.x} y={pt.y} night={night} />,
    });
  });

  things.sort((a, b) => a.depth - b.depth);

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${ISLA_VW} ${ISLA_VH}`}>
      {/* Lagoon water */}
      <Ellipse
        cx={ISLA_CX}
        cy={waterY}
        rx={ISLA_VW * 0.46}
        ry={ISLA_VH * 0.34}
        fill={drifting ? (night ? '#162844' : '#6AA3BC') : p.lagoonOut}
        opacity={0.72}
      />
      <Ellipse
        cx={ISLA_CX}
        cy={waterY - 2}
        rx={ISLA_VW * 0.41}
        ry={ISLA_VH * 0.29}
        fill={drifting ? (night ? '#1E3352' : '#85BACF') : p.lagoonIn}
        opacity={0.9}
      />

      {/* Parola leader halo */}
      {member.isLighthouseLeader ? (
        <>
          <Ellipse
            cx={ISLA_CX}
            cy={waterY - 2}
            rx={ISLA_VW * 0.47}
            ry={ISLA_VH * 0.35}
            fill="none"
            stroke="#FFB21E"
            strokeWidth={3}
            strokeDasharray="10 7"
            opacity={0.85}
          />
          <Polygon
            points={`${ISLA_CX},${waterY - 120} ${ISLA_CX - 68},${waterY - 38} ${ISLA_CX + 68},${waterY - 38}`}
            fill="#FFE285"
            opacity={night ? 0.24 : 0.16}
          />
        </>
      ) : null}

      {/* Choppy white-caps around drifting island */}
      {drifting ? (
        <G opacity={0.85}>
          <Path d="M 52 172 Q 72 162 92 172" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <Path d="M 326 168 Q 346 158 366 168" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <Path d="M 102 222 Q 124 212 146 222" stroke="#FFFFFF" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </G>
      ) : null}

      <LandLayer p={p} tiles={tiles} />
      <Pier p={p} />
      {things.map((t) => t.node)}

      {/* Shore Paty waving a wooden Sagwan paddle on drifting islands */}
      {drifting ? (
        <G transform="translate(302, 168)">
          {/* Tiny wooden paddle */}
          <G transform="rotate(-24 14 4)">
            <Line x1={14} y1={-12} x2={14} y2={16} stroke="#8D5A36" strokeWidth={2.6} strokeLinecap="round" />
            <Ellipse cx={14} cy={-15} rx={4.5} ry={7.5} fill="#C68B59" stroke="#784B2A" strokeWidth={1} />
          </G>
          {/* Paty miniature tarsier */}
          <Circle cx={4} cy={12} r={8.5} fill={night ? '#8A5D41' : '#A8714A'} />
          <Circle cx={1} cy={10.5} r={3.2} fill="#FFFDF8" />
          <Circle cx={7} cy={10.5} r={3.2} fill="#FFFDF8" />
          <Circle cx={1.2} cy={10.6} r={1.6} fill="#1E1812" />
          <Circle cx={6.8} cy={10.6} r={1.6} fill="#1E1812" />
          <Path d="M 1 15 Q 4 17.5 7 15" stroke="#5A3720" strokeWidth={1.3} fill="none" strokeLinecap="round" />
        </G>
      ) : null}

      {/* Anod fog clouds */}
      {drifting ? (
        <G opacity={farAdrift ? 0.62 : 0.42}>
          <Ellipse cx={116} cy={118} rx={68} ry={22} fill={night ? '#889BB8' : '#E8F0F5'} />
          <Ellipse cx={292} cy={136} rx={76} ry={24} fill={night ? '#889BB8' : '#E8F0F5'} />
          <Ellipse cx={210} cy={92} rx={84} ry={20} fill={night ? '#9BB0CD' : '#F4F8FB'} />
        </G>
      ) : null}
    </Svg>
  );
}

/** Shared central reef featuring unlocked Kapuluan Group Buildings. */
function SharedReef({ streakDays, night }: { streakDays: number; night: boolean }) {
  const unlocked = unlockedGroupBuildings(streakDays).map((b) => b.id);
  const has = (id: GroupBuildingId) => unlocked.includes(id);
  const reefFill = night ? '#8D7C62' : '#F2DFAF';
  const reefEdge = night ? '#665742' : '#D5BD88';

  return (
    <View style={[styles.reefWrap, { left: CENTER_X - 90, top: CENTER_Y - 196 }]} pointerEvents="none">
      <Svg width={180} height={110} viewBox="0 0 180 110">
        {/* Reef lagoon halo */}
        <Ellipse cx={90} cy={66} rx={78} ry={32} fill={night ? '#193556' : '#7AD3DE'} opacity={0.55} />
        <Ellipse cx={90} cy={63} rx={62} ry={24} fill={reefEdge} />
        <Ellipse cx={90} cy={60} rx={59} ry={21} fill={reefFill} />

        {/* 3-day unlock: Bangka Dock */}
        {has('bangka_dock') ? (
          <G transform="translate(26, 56)">
            <Rect x={0} y={10} width={22} height={6} rx={2} fill="#8D5A36" />
            <Path d="M 4 22 Q 16 14 28 22 Q 16 26 4 22 Z" fill="#C8400F" />
            <Line x1={9} y1={17} x2={7} y2={26} stroke="#E8C99B" strokeWidth={1.3} />
            <Line x1={23} y1={17} x2={25} y2={26} stroke="#E8C99B" strokeWidth={1.3} />
          </G>
        ) : null}

        {/* 7-day unlock: Nipa Tambayan */}
        {has('tambayan') ? (
          <G transform="translate(64, 34)">
            <Rect x={4} y={18} width={20} height={14} fill="#D9B382" />
            <Polygon points="0,19 14,5 28,19" fill="#9E6A3A" />
            <Circle cx={14} cy={24} r={2.8} fill="#FFB21E" opacity={night ? 0.95 : 0.7} />
          </G>
        ) : null}

        {/* 14-day unlock: Fiesta Plaza Banderitas */}
        {has('fiesta_plaza') ? (
          <G transform="translate(46, 20)">
            <Path d="M 0 12 Q 44 22 88 12" stroke={night ? '#E2DDD5' : '#6A5643'} strokeWidth={1.4} fill="none" />
            <Polygon points="14,14 20,21 24,15" fill="#E5484D" />
            <Polygon points="30,16 36,24 41,16" fill="#FFB21E" />
            <Polygon points="48,16 54,24 59,16" fill="#1E9BF0" />
            <Polygon points="65,15 71,22 76,14" fill="#2FBF5B" />
          </G>
        ) : null}

        {/* 30-day unlock: Barangay Court */}
        {has('court') ? (
          <G transform="translate(106, 48)">
            <Polygon points="0,10 18,4 32,12 14,18" fill="#5A9A6E" stroke="#FFFFFF" strokeWidth={1} />
            <Line x1={28} y1={8} x2={28} y2={-2} stroke="#ECE8E1" strokeWidth={1.8} />
            <Rect x={25} y={-4} width={6} height={4} fill="#FFFFFF" />
          </G>
        ) : null}

        {/* 100-day unlock: Grand Parola */}
        {has('grand_parola') ? (
          <G transform="translate(82, 4)">
            <Polygon points="5,38 9,8 15,8 19,38" fill="#FFFFFF" stroke="#C8400F" strokeWidth={1.2} />
            <Rect x={8} y={16} width={8} height={5} fill="#C8400F" />
            <Rect x={6.5} y={26} width={11} height={5} fill="#C8400F" />
            <Circle cx={12} cy={6} r={5} fill="#FFE285" />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

/** Tulay Bridges drawn smoothly from center island dock to every friend's island. */
function TulayBridgesSvg({
  placed,
  tier,
  todayComplete,
  night,
}: {
  placed: PlacedMember[];
  tier: BridgeTier;
  todayComplete: boolean;
  night: boolean;
}) {
  const me = placed.find((p) => p.member.isMe);
  if (!me) return null;
  const friends = placed.filter((p) => !p.member.isMe);

  const tierColors: Record<BridgeTier, { main: string; trim: string; width: number }> = {
    rope: { main: '#C49A6C', trim: '#8F643A', width: 4 },
    bamboo: { main: '#D6B85A', trim: '#7F6824', width: 5.5 },
    wood: { main: '#A06238', trim: '#6B3D1E', width: 7 },
    stone: { main: night ? '#9CA4B8' : '#C8C5BD', trim: '#FFB21E', width: 9 },
  };
  const cfg = tierColors[tier];

  return (
    <Svg width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} pointerEvents="none">
      {friends.map((f) => {
        const x1 = me.x;
        const y1 = me.y;
        const x2 = f.x;
        const y2 = f.y;
        const mx = (x1 + x2) / 2;
        const sag = 16 + f.member.driftLevel * 42;
        const my = (y1 + y2) / 2 + sag;
        const strained = f.member.driftLevel >= 0.45;
        const activeColor = strained ? (night ? '#F2A65A' : '#E07A48') : cfg.main;
        const waitingPlank = !f.member.goalMetToday || !todayComplete;

        return (
          <G key={f.member.studentId}>
            {/* Shadow / water wake beneath bridge */}
            <Path
              d={`M ${x1} ${y1 + 5} Q ${mx} ${my + 8} ${x2} ${y2 + 5}`}
              stroke={night ? '#081226' : '#4E99AC'}
              strokeWidth={cfg.width + 4}
              strokeOpacity={0.28}
              fill="none"
              strokeLinecap="round"
            />
            {/* Main Tulay deck */}
            <Path
              d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
              stroke={activeColor}
              strokeWidth={cfg.width}
              strokeDasharray={waitingPlank || tier === 'rope' ? '10 6' : undefined}
              fill="none"
              strokeLinecap="round"
            />
            {/* Bridge crossbars or stone lanterns */}
            {[0.25, 0.5, 0.75].map((t) => {
              const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
              const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
              if (tier === 'stone' && !strained) {
                return (
                  <G key={t}>
                    <Circle cx={bx} cy={by - 4} r={night ? 5.5 : 3.5} fill="#FFB21E" opacity={night ? 0.5 : 0.35} />
                    <Circle cx={bx} cy={by - 4} r={2.2} fill="#FFF2B2" />
                  </G>
                );
              }
              return <Circle key={t} cx={bx} cy={by} r={2.4} fill={cfg.trim} />;
            })}
          </G>
        );
      })}
    </Svg>
  );
}

/** Animated island node so drift recovery visibly glides the island smoothly across water. */
function AnimatedIslandNode({
  item,
  night,
  tiles,
  selected,
  onPress,
}: {
  item: PlacedMember;
  night: boolean;
  tiles: { col: number; row: number }[];
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const px = useSharedValue(item.x - item.w / 2);
  const py = useSharedValue(item.y - item.h / 2);

  useEffect(() => {
    px.set(withSpring(item.x - item.w / 2, spring.smooth));
    py.set(withSpring(item.y - item.h / 2, spring.smooth));
  }, [item.x, item.y, item.w, item.h, px, py]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: px.get() }, { translateY: py.get() }],
  }));

  const m = item.member;
  const firstName = m.isMe ? 'You' : m.displayName.split(' ')[0];
  const drifting = m.driftLevel >= 0.25;

  return (
    <Animated.View style={[styles.islandSlot, { width: item.w, height: item.h + 26 }, anim]}>
      <MiniIslandSvg member={m} w={item.w} h={item.h} night={night} tiles={tiles} />

      {/* Nameplate + status */}
      <View
        style={[
          styles.namePill,
          {
            backgroundColor: selected ? c.accent : night ? 'rgba(22,26,44,0.92)' : 'rgba(255,255,255,0.94)',
            borderColor: selected ? c.accent : drifting ? c.warning : c.hairline,
          },
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: m.goalMetToday ? c.success : drifting ? c.warning : c.textTertiary,
            },
          ]}
        />
        <Text variant="caption" color={selected ? 'onAccent' : 'text'} style={fontFor(700)} numberOfLines={1}>
          {firstName}
        </Text>
        <Text variant="caption" color={selected ? 'onAccent' : 'textSecondary'} tabular style={fontFor(600)}>
          {m.agos7d}
        </Text>
        {m.isLighthouseLeader ? (
          <Lighthouse size={12} weight="fill" color={selected ? c.onAccent : c.spark} />
        ) : m.isMostImproved ? (
          <TrendUp size={12} weight="bold" color={selected ? c.onAccent : c.success} />
        ) : m.role === 'owner' ? (
          <CrownSimple size={11} weight="fill" color={selected ? c.onAccent : c.textTertiary} />
        ) : null}
      </View>

      {/* Transparent accessible tap overlay (never inline on SVG) */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${firstName}, tide score ${m.agos7d}`}
        style={styles.islandHit}
      />
    </Animated.View>
  );
}

/** Flying Sagwan paddle boost thrown from center island to a drifting mate. */
function SagwanFlight({
  from,
  to,
  seq,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  seq: number;
}) {
  const prog = useSharedValue(0);

  useEffect(() => {
    prog.set(0);
    prog.set(withTiming(1, { duration: 760, easing: Easing.out(Easing.cubic) }));
  }, [seq, prog]);

  const anim = useAnimatedStyle(() => {
    const t = prog.get();
    if (t <= 0.01 || t >= 0.99) return { opacity: 0 };
    const cx = (from.x + to.x) / 2;
    const cy = Math.min(from.y, to.y) - 56;
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x;
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y;
    const rot = `${Math.round(t * 360)}deg`;
    return {
      opacity: t < 0.85 ? 1 : (1 - t) / 0.15,
      transform: [{ translateX: x - 16 }, { translateY: y - 16 }, { rotate: rot }],
    };
  });

  return (
    <Animated.View style={[styles.paddleFlight, anim]} pointerEvents="none">
      <Svg width={32} height={32} viewBox="0 0 32 32">
        <Line x1={6} y1={26} x2={22} y2={10} stroke="#8D5A36" strokeWidth={3.5} strokeLinecap="round" />
        <Ellipse
          cx={24}
          cy={8}
          rx={5}
          ry={7.5}
          transform="rotate(45 24 8)"
          fill="#FFB21E"
          stroke="#8D5A36"
          strokeWidth={1.5}
        />
      </Svg>
    </Animated.View>
  );
}

export function KapuluanScene({
  archipelago,
  width,
  height,
  selectedMemberId,
  onSelectMember,
  sagwanPulse,
}: {
  archipelago: Archipelago;
  width: number;
  height: number;
  selectedMemberId?: string | null;
  onSelectMember: (studentId: string) => void;
  sagwanPulse?: { toId: string; seq: number } | null;
}) {
  const { isNight } = useTheme();
  const reduced = useReducedMotion();

  const tiles = useMemo(() => {
    const arr: { col: number; row: number }[] = [];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 7; col++) {
        if (LAND(col, rowOr(r))) arr.push({ col, row: r });
      }
    }
    return arr;
  }, []);

  const placed = useMemo(() => computeMemberPositions(archipelago.members), [archipelago.members]);
  const tier = bridgeTier(archipelago.streakDays);

  const fitScale = Math.max(0.54, Math.min(0.92, Math.min(width / WORLD_W, height / WORLD_H) * 1.15));
  const scale = useSharedValue(fitScale);
  const savedScale = useSharedValue(fitScale);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const shimmer = useSharedValue(0.3);

  useEffect(() => {
    scale.set(withSpring(fitScale, spring.smooth));
    savedScale.set(fitScale);
    tx.set(withSpring(0, spring.smooth));
    ty.set(withSpring(0, spring.smooth));
    savedTx.set(0);
    savedTy.set(0);
  }, [archipelago.id, fitScale, scale, savedScale, tx, ty, savedTx, savedTy]);

  useEffect(() => {
    if (reduced) return;
    shimmer.set(
      withRepeat(withSequence(withTiming(0.75, { duration: 2400 }), withTiming(0.28, { duration: 2400 })), -1, true),
    );
  }, [reduced, shimmer]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.set(Math.max(-220, Math.min(220, savedTx.get() + e.translationX)));
      ty.set(Math.max(-170, Math.min(170, savedTy.get() + e.translationY)));
    })
    .onEnd(() => {
      savedTx.set(tx.get());
      savedTy.set(ty.get());
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.max(0.45, Math.min(1.65, savedScale.get() * e.scale)));
    })
    .onEnd(() => {
      savedScale.set(scale.get());
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const worldStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.get(),
  }));

  const mePos = placed.find((p) => p.member.isMe);
  const sagwanTarget = sagwanPulse ? placed.find((p) => p.member.studentId === sagwanPulse.toId) : null;

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[
          styles.viewport,
          {
            width,
            height,
            backgroundColor: isNight ? '#101D38' : '#73C2D6',
          },
        ]}
      >
        {/* Subtle sea shimmer wave bands */}
        <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]} pointerEvents="none">
          <Svg width={width} height={height} viewBox="0 0 400 300" preserveAspectRatio="none">
            <Path
              d="M 32 76 Q 72 68 112 76"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeOpacity={0.35}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M 272 114 Q 312 106 352 114"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeOpacity={0.3}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M 74 236 Q 116 228 158 236"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeOpacity={0.28}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M 244 248 Q 288 240 332 248"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeOpacity={0.3}
              fill="none"
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.world, worldStyle]}>
          <TulayBridgesSvg placed={placed} tier={tier} todayComplete={archipelago.todayComplete} night={isNight} />
          <SharedReef streakDays={archipelago.streakDays} night={isNight} />
          {placed.map((item) => (
            <AnimatedIslandNode
              key={item.member.studentId}
              item={item}
              night={isNight}
              tiles={tiles}
              selected={selectedMemberId === item.member.studentId}
              onPress={() => onSelectMember(item.member.studentId)}
            />
          ))}
          {sagwanPulse && mePos && sagwanTarget ? (
            <SagwanFlight from={mePos} to={sagwanTarget} seq={sagwanPulse.seq} />
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function rowOr(r: number): number {
  return r;
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  world: {
    width: WORLD_W,
    height: WORLD_H,
  },
  reefWrap: {
    position: 'absolute',
    width: 180,
    height: 110,
  },
  islandSlot: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
  },
  namePill: {
    position: 'absolute',
    bottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  islandHit: {
    ...StyleSheet.absoluteFill,
    minWidth: 56,
    minHeight: 56,
  },
  paddleFlight: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 32,
    height: 32,
  },
});
