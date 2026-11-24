import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { useLoop } from '@/components/isla/IslaScene';
import { useTheme } from '@/design/theme';

const rnd = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const STARS = Array.from({ length: 34 }, (_, i) => ({
  x: rnd(i, 1),
  y: rnd(i, 2),
  s: 1.5 + rnd(i, 3) * 2,
  ms: 1400 + rnd(i, 4) * 2600,
}));

const SWELLS = Array.from({ length: 12 }, (_, i) => ({
  x: rnd(i, 7),
  y: rnd(i, 8),
  w: 18 + rnd(i, 9) * 30,
  ms: 2600 + rnd(i, 10) * 2600,
}));

const ROAD = Array.from({ length: 10 }, (_, i) => ({
  x: rnd(i, 30),
  y: rnd(i, 31),
  w: 10 + rnd(i, 32) * 22,
  ms: 1200 + rnd(i, 33) * 1600,
}));

/**
 * Sky and open sea behind the isla. `horizon` is the y (px) where sea meets
 * sky, so the island sits in the water. Day: sun, drifting clouds. Night:
 * moon and twinkling stars.
 */
export function IslaBackdrop({ horizon, width, height }: { horizon: number; width: number; height: number }) {
  const { isNight } = useTheme();
  const seaH = Math.max(0, height - horizon);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={isNight ? ['#070B22', '#141B44', '#27295A'] : ['#8FD3F2', '#C4EAF6', '#FFF0DC']}
        locations={[0, 0.55, 1]}
        style={[styles.abs, { left: 0, top: 0, width, height: horizon + 2 }]}
      />
      {isNight ? (
        STARS.map((s, i) => <Star key={i} s={s} w={width} h={horizon * 0.9} />)
      ) : (
        <Sun x={width * 0.8} y={Math.max(60, horizon * 0.32)} />
      )}
      {isNight ? <Moon x={width * 0.8} y={Math.max(70, horizon * 0.3)} /> : null}
      <SkyCloud y={horizon * 0.28} w={width} scale={1} ms={70000} delay={0} night={isNight} />
      <SkyCloud y={horizon * 0.55} w={width} scale={0.65} ms={52000} delay={26000} night={isNight} />

      <View style={[styles.abs, { left: 0, top: horizon, width, height: seaH }]}>
        <LinearGradient
          colors={isNight ? ['#26386A', '#1A2550', '#111836'] : ['#A9E3EA', '#6CC4D8', '#3E9FC0']}
          style={StyleSheet.absoluteFill}
        />
        {/* sun or moon road: glints clustered under the light */}
        {ROAD.map((r, i) => (
          <Swell key={`r${i}`} s={{ ...r, x: 0.8 + (r.x - 0.5) * (0.06 + r.y * 0.14) - r.w / width / 2 }} w={width} h={seaH * 0.75} night={isNight} />
        ))}
        {SWELLS.map((s, i) => (
          <Swell key={i} s={s} w={width} h={seaH} night={isNight} />
        ))}
      </View>
      {/* far islands on the horizon */}
      <Svg
        width={width}
        height={34}
        viewBox="0 0 400 34"
        preserveAspectRatio="none"
        style={[styles.abs, { left: 0, top: horizon - 33 }]}
      >
        <Path
          d="M-10 34 C 20 14, 50 8, 84 18 C 100 12, 116 16, 130 34 Z"
          fill={isNight ? '#2C3566' : '#9FCFCB'}
        />
        <Path
          d="M300 34 C 320 18, 344 6, 372 14 C 388 10, 402 16, 412 34 Z"
          fill={isNight ? '#323C70' : '#A9D4CC'}
        />
      </Svg>
      <View style={[styles.abs, { left: 0, top: horizon, width, height: 1.5, backgroundColor: isNight ? 'rgba(160,180,255,0.25)' : 'rgba(255,255,255,0.8)' }]} />
    </View>
  );
}

function Sun({ x, y }: { x: number; y: number }) {
  const t = useLoop(4200);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.get() * 0.12 }], opacity: 0.55 - t.get() * 0.2 }));
  return (
    <>
      <Animated.View style={[styles.abs, styles.round, { left: x - 70, top: y - 70, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,240,200,0.6)' }, halo]} />
      <View style={[styles.abs, { left: x - 30, top: y - 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF4D2' }]} />
      <View style={[styles.abs, { left: x - 24, top: y - 24, width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFE29A' }]} />
    </>
  );
}

function Moon({ x, y }: { x: number; y: number }) {
  const t = useLoop(5000);
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + t.get() * 0.2 }));
  return (
    <>
      <Animated.View style={[styles.abs, { left: x - 50, top: y - 50, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(245,220,160,0.35)' }, halo]} />
      <View style={[styles.abs, { left: x - 20, top: y - 20, width: 40, height: 40, borderRadius: 20, backgroundColor: '#F7E7BE' }]} />
      <View style={[styles.abs, { left: x - 10, top: y - 26, width: 40, height: 40, borderRadius: 20, backgroundColor: '#141B44' }]} />
    </>
  );
}

function Star({ s, w, h }: { s: (typeof STARS)[number]; w: number; h: number }) {
  const t = useLoop(s.ms, s.ms * s.x);
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + t.get() * 0.75 }));
  return (
    <Animated.View
      style={[
        styles.abs,
        { left: s.x * w, top: s.y * h, width: s.s, height: s.s, borderRadius: s.s, backgroundColor: '#FFF6DA' },
        style,
      ]}
    />
  );
}

function SkyCloud({
  y,
  w,
  scale,
  ms,
  delay,
  night,
}: {
  y: number;
  w: number;
  scale: number;
  ms: number;
  delay: number;
  night: boolean;
}) {
  const t = useLoop(ms, delay, false);
  const cw = 150 * scale;
  const ch = 56 * scale;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -cw + t.get() * (w + cw * 2) }] }));
  return (
    <Animated.View style={[styles.abs, { left: 0, top: y, width: cw, height: ch, opacity: night ? 0.3 : 0.95 }, style]}>
      <Svg width={cw} height={ch} viewBox="0 0 220 82">
        <Path
          d="M30 78c-16 0-26-10-26-22s10-22 26-22c4-16 18-28 36-28 14 0 26 7 32 18 6-4 13-6 20-6 20 0 36 14 38 32 2 0 4-1 6-1 14 0 26 10 26 23s-12 4-26 4H30Z"
          fill={night ? '#5A6690' : '#FFFFFF'}
        />
      </Svg>
    </Animated.View>
  );
}

function Swell({ s, w, h, night }: { s: (typeof SWELLS)[number]; w: number; h: number; night: boolean }) {
  const t = useLoop(s.ms, s.ms * s.y);
  const style = useAnimatedStyle(() => ({
    opacity: t.get() * (night ? 0.35 : 0.8),
    transform: [{ translateX: t.get() * 14 }, { scaleX: 0.5 + t.get() * 0.5 }],
  }));
  return (
    <Animated.View
      style={[
        styles.abs,
        {
          left: s.x * w,
          top: 6 + s.y * (h - 12),
          width: s.w,
          height: 2,
          borderRadius: 1,
          backgroundColor: night ? '#9FB2E8' : '#FFFFFF',
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  round: { overflow: 'hidden' },
});
