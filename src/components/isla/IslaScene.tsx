import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Paty } from '@/components/mascot/Paty';
import { BUILDINGS, type BuildingId } from '@/data/seed';
import { haptic } from '@/design/haptics';
import { ease, spring, useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { useL } from '@/i18n/useT';

const N = 7;
const TW = 56;
const TH = 28;
const SIDE = 18;
const VW = 420;
const VH = 286;
const OX = VW / 2;
const OY = 56;
/** Center of the island's footprint at water level. */
const CX = OX;
const CY = OY + 3 * TH + TH / 2 + SIDE - 4;

export const ISLA_VW = VW;
export const ISLA_VH = VH;
export const ISLA_CX = CX;
export const ISLA_CY = CY;

/** Island mask: a 7×7 grid with the corners rounded off. */
const LAND = (col: number, row: number) => {
  if (col < 0 || row < 0 || col >= N || row >= N) return false;
  const d = Math.abs(col - 3) + Math.abs(row - 3);
  return d <= 4 && !(col === 0 && row === 0) && !(col === 6 && row === 6);
};

export const iso = (col: number, row: number) => ({
  x: OX + (col - row) * (TW / 2),
  y: OY + (col + row) * (TH / 2),
});

/** Where a sprite stands on a cell (its base, just below the tile center). */
const stand = (col: number, row: number) => {
  const { x, y } = iso(col, row);
  return { x, y: y + TH / 2 + 4 };
};

const PALMS: [number, number][] = [
  [0, 3],
  [5, 1],
  [4, 6],
  [6, 2],
];
const PATH: [number, number][] = [
  [3, 4],
  [3, 5],
  [3, 6],
];

// Deterministic scatter: renders stay pure.
const rnd = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

type Pal = {
  grassA: string;
  grassB: string;
  grassLip: string;
  side: string;
  sideDeep: string;
  strata: string;
  sand: string;
  foam: string;
  deep: string;
  lagoonIn: string;
  lagoonOut: string;
  tuft: string;
  stone: string;
  wood: string;
  woodDeep: string;
  night: boolean;
};

function palette(night: boolean): Pal {
  return night
    ? {
        grassA: '#3B5A46',
        grassB: '#35523F',
        grassLip: '#2E4A38',
        side: '#5B4A3A',
        sideDeep: '#463829',
        strata: '#3A2E22',
        sand: '#7A6C58',
        foam: '#7F90B8',
        deep: '#16203C',
        lagoonIn: '#2C4A72',
        lagoonOut: '#1C2B4E',
        tuft: '#4E7A5B',
        stone: '#6D6A72',
        wood: '#6A5442',
        woodDeep: '#4E3D30',
        night,
      }
    : {
        grassA: '#B8E39B',
        grassB: '#A9DA8B',
        grassLip: '#8CCB6E',
        side: '#D9B98A',
        sideDeep: '#C29E6C',
        strata: '#B48A57',
        sand: '#F4E2BC',
        foam: '#FFFFFF',
        deep: '#7FD0E0',
        lagoonIn: '#BDF1F2',
        lagoonOut: '#8EDCE8',
        tuft: '#7DBE5E',
        stone: '#D8CFC2',
        wood: '#B98756',
        woodDeep: '#94683F',
        night,
      };
}

type P = { x: number; y: number };
const pts = (arr: P[]) => arr.map((q) => `${q.x},${q.y}`).join(' ');

/** Footprint corners of a w×d (cells) box centered at (x, y), lifted by `lift`. */
function footprint(x: number, y: number, w: number, d: number, lift = 0) {
  const qx = TW / 4;
  const qy = TH / 4;
  return {
    n: { x: x + (d - w) * qx, y: y - (w + d) * qy - lift },
    e: { x: x + (w + d) * qx, y: y + (w - d) * qy - lift },
    s: { x: x + (w - d) * qx, y: y + (w + d) * qy - lift },
    w: { x: x - (w + d) * qx, y: y + (d - w) * qy - lift },
  };
}

/** Iso box: left, right and top faces. `w` along columns, `d` along rows. */
function Box({
  x,
  y,
  w,
  d,
  h,
  top,
  left,
  right,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  top: string;
  left: string;
  right: string;
}) {
  const b = footprint(x, y, w, d);
  const t = footprint(x, y, w, d, h);
  return (
    <G>
      <Polygon points={pts([t.w, t.s, b.s, b.w])} fill={left} />
      <Polygon points={pts([t.s, t.e, b.e, b.s])} fill={right} />
      <Polygon points={pts([t.n, t.e, t.s, t.w])} fill={top} />
    </G>
  );
}

/** Four-sided roof whose eaves sit at (x, y) and rise to a peak. */
function Roof({
  x,
  y,
  w,
  d,
  peak,
  left,
  right,
  top,
  thatch,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  peak: number;
  left: string;
  right: string;
  top: string;
  /** Draw nipa thatch lines on the front faces. */
  thatch?: string;
}) {
  const b = footprint(x, y, w + 0.18, d + 0.18);
  const pk = { x, y: y - peak };
  const lerp = (a: P, c: P, t: number) => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
  return (
    <G>
      <Polygon points={pts([b.n, b.e, pk])} fill={top} />
      <Polygon points={pts([b.w, b.n, pk])} fill={top} />
      <Polygon points={pts([b.w, b.s, pk])} fill={left} />
      <Polygon points={pts([b.s, b.e, pk])} fill={right} />
      {thatch
        ? [0.3, 0.55, 0.78].map((t) => {
            const l1 = lerp(pk, b.w, t);
            const l2 = lerp(pk, b.s, t);
            const r2 = lerp(pk, b.e, t);
            return (
              <G key={t}>
                <Line x1={l1.x} y1={l1.y} x2={l2.x} y2={l2.y} stroke={thatch} strokeWidth={1.2} opacity={0.6} />
                <Line x1={l2.x} y1={l2.y} x2={r2.x} y2={r2.y} stroke={thatch} strokeWidth={1.2} opacity={0.6} />
              </G>
            );
          })
        : null}
    </G>
  );
}

function Building({ id, x, y, night }: { id: BuildingId; x: number; y: number; night: boolean }) {
  const dim = (day: string, nightC: string) => (night ? nightC : day);
  const shadow = <Ellipse cx={x + 3} cy={y + 3} rx={24} ry={9} fill="#2B1B14" opacity={night ? 0.3 : 0.13} />;
  const glow = night ? '#F5C46B' : '#9BC6E8';
  switch (id) {
    case 'bahay':
      return (
        <G>
          {shadow}
          {[-10, 10, 0].map((dx, i) => (
            <Line
              key={dx}
              x1={x + dx}
              y1={y + (i === 2 ? 5 : 0)}
              x2={x + dx}
              y2={y - 10}
              stroke={dim('#8A6338', '#5E4630')}
              strokeWidth={3}
            />
          ))}
          {/* bamboo ladder */}
          <Line x1={x + 12} y1={y + 6} x2={x + 16} y2={y - 10} stroke={dim('#A27A38', '#6D552F')} strokeWidth={1.6} />
          <Line x1={x + 18} y1={y + 3} x2={x + 21} y2={y - 12} stroke={dim('#A27A38', '#6D552F')} strokeWidth={1.6} />
          {[0, 1, 2].map((i) => (
            <Line
              key={i}
              x1={x + 13 + i * 1.2}
              y1={y + 2 - i * 5}
              x2={x + 18.6 + i}
              y2={y - 1 - i * 5}
              stroke={dim('#A27A38', '#6D552F')}
              strokeWidth={1.4}
            />
          ))}
          <Box
            x={x}
            y={y - 8}
            w={1.1}
            d={1.1}
            h={18}
            top={dim('#E6C88F', '#9C8763')}
            left={dim('#E0BF84', '#85704F')}
            right={dim('#C9A266', '#776345')}
          />
          {/* woven sawali pattern */}
          {[0, 1, 2, 3].map((i) => (
            <Line
              key={i}
              x1={x - 15}
              y1={y - 12 - i * 4 - 1}
              x2={x}
              y2={y - 4 - i * 4 - 1}
              stroke={dim('#C9A266', '#6E5D42')}
              strokeWidth={0.8}
            />
          ))}
          <Rect x={x + 3} y={y - 26} width={7} height={9} fill={dim('#7A5326', '#3D2C1A')} rx={1} />
          {night ? <Rect x={x + 4} y={y - 25} width={5} height={7} fill="#F5C46B" opacity={0.9} rx={1} /> : null}
          <Rect x={x - 11} y={y - 24} width={6} height={7} fill={dim('#7A5326', '#3D2C1A')} rx={1} />
          {night ? <Rect x={x - 10} y={y - 23} width={4} height={5} fill="#F5C46B" opacity={0.75} rx={1} /> : null}
          <Roof
            x={x}
            y={y - 26}
            w={1.1}
            d={1.1}
            peak={28}
            top={dim('#C79B52', '#7A6038')}
            left={dim('#B58B45', '#6D552F')}
            right={dim('#9C7535', '#5F4A29')}
            thatch={dim('#7E5A22', '#3F3018')}
          />
        </G>
      );
    case 'mango':
      return (
        <G>
          {shadow}
          <Path
            d={`M${x - 3} ${y} C ${x - 2} ${y - 10}, ${x - 4} ${y - 16}, ${x - 2} ${y - 24} L ${x + 3} ${y - 24} C ${x + 3} ${y - 16}, ${x + 4} ${y - 8}, ${x + 4} ${y} Z`}
            fill={dim('#8A5A2B', '#5E4130')}
          />
          <Circle cx={x + 1} cy={y - 32} r={19} fill={dim('#3E9A4B', '#2B6340')} />
          <Circle cx={x - 12} cy={y - 26} r={12} fill={dim('#4FAF5B', '#2F6B45')} />
          <Circle cx={x + 13} cy={y - 27} r={12} fill={dim('#46A352', '#2B6340')} />
          <Circle cx={x - 2} cy={y - 42} r={12} fill={dim('#5DBB66', '#357550')} />
          <Circle cx={x - 6} cy={y - 46} r={5} fill={dim('#86D38A', '#3F8058')} opacity={0.8} />
          {[
            [-6, -30],
            [7, -38],
            [11, -22],
            [-13, -21],
            [2, -24],
          ].map(([dx, dy], i) => (
            <Ellipse key={i} cx={x + dx} cy={y + dy} rx={3} ry={4} fill={dim('#FFC23A', '#C9A04A')} />
          ))}
        </G>
      );
    case 'sarisari':
      return (
        <G>
          {shadow}
          <Box
            x={x}
            y={y}
            w={1.1}
            d={0.9}
            h={22}
            top={dim('#F2E2C4', '#8C8170')}
            left={dim('#E8D3AE', '#7D7262')}
            right={dim('#DDC497', '#706657')}
          />
          {/* striped awning */}
          <Box
            x={x}
            y={y - 22}
            w={1.25}
            d={1.05}
            h={4}
            top={dim('#D1592A', '#9A5A3A')}
            left={dim('#B84A20', '#844C31')}
            right={dim('#A33F19', '#76432B')}
          />
          {[0, 1, 2, 3].map((i) => (
            <Polygon
              key={i}
              points={`${x + 1 + i * 5},${y - 16 - i * 2.5} ${x + 4 + i * 5},${y - 17.5 - i * 2.5} ${x + 4 + i * 5},${y - 13.5 - i * 2.5} ${x + 1 + i * 5},${y - 12 - i * 2.5}`}
              fill={i % 2 ? '#FFFFFF' : dim('#E5483B', '#A6534A')}
            />
          ))}
          <Rect x={x + 1} y={y - 9} width={18} height={4} rx={1} fill={dim('#7A5326', '#3D2C1A')} />
          {/* soda crates */}
          <Rect x={x - 16} y={y - 6} width={6} height={5} rx={1} fill={dim('#E5483B', '#8C4A42')} />
          <Rect x={x - 9} y={y - 4} width={6} height={5} rx={1} fill={dim('#1E9BF0', '#3E6488')} />
          {night ? <Rect x={x + 2} y={y - 13} width={16} height={4} fill="#F5C46B" opacity={0.7} /> : null}
        </G>
      );
    case 'school':
      return (
        <G>
          {shadow}
          <Box
            x={x}
            y={y}
            w={1.6}
            d={1}
            h={26}
            top={dim('#F4EFE6', '#8E8A82')}
            left={dim('#E9E1D3', '#7F7A71')}
            right={dim('#DCD2C0', '#726D64')}
          />
          {[0, 1, 2].map((i) => (
            <Rect
              key={i}
              x={x + 4 + i * 9}
              y={y - 18 + i * 4.5 - 4}
              width={5}
              height={6}
              fill={glow}
              opacity={night ? 0.9 : 1}
            />
          ))}
          <Rect x={x - 14} y={y - 16} width={6} height={12} fill={dim('#7A5326', '#3D2C1A')} />
          <Roof
            x={x}
            y={y - 26}
            w={1.6}
            d={1}
            peak={16}
            top={dim('#C8400F', '#8C4A2E')}
            left={dim('#B13A0C', '#7D4129')}
            right={dim('#9A320A', '#6F3A24')}
          />
          <Line x1={x - 26} y1={y - 6} x2={x - 26} y2={y - 56} stroke={dim('#9A9A9A', '#666')} strokeWidth={2} />
          {/* Philippine flag */}
          <Rect x={x - 26} y={y - 56} width={15} height={4.5} fill={dim('#0038A8', '#3A4E7E')} />
          <Rect x={x - 26} y={y - 51.5} width={15} height={4.5} fill={dim('#CE1126', '#7E3A44')} />
          <Polygon points={`${x - 26},${y - 56} ${x - 19},${y - 51.75} ${x - 26},${y - 47}`} fill="#FFFFFF" />
          <Circle cx={x - 23.6} cy={y - 51.75} r={1.3} fill="#FCD116" />
        </G>
      );
    case 'garden':
      return (
        <G>
          {shadow}
          {[
            [-12, -4],
            [0, -10],
            [12, -4],
            [-4, 4],
            [8, 4],
          ].map(([dx, dy], i) => (
            <G key={i}>
              <Circle cx={x + dx} cy={y + dy - 6} r={8} fill={dim('#3E9A4B', '#2B6340')} />
              <Circle cx={x + dx - 2} cy={y + dy - 9} r={4} fill={dim('#58B565', '#33714A')} />
              <Circle cx={x + dx - 3} cy={y + dy - 9} r={2.2} fill="#FFFFFF" opacity={night ? 0.85 : 1} />
              <Circle cx={x + dx + 3} cy={y + dy - 5} r={2.2} fill="#FFFFFF" opacity={night ? 0.85 : 1} />
              <Circle cx={x + dx + 1} cy={y + dy - 11} r={1.6} fill="#FFFFFF" opacity={night ? 0.85 : 1} />
            </G>
          ))}
        </G>
      );
    case 'carabao':
      return (
        <G>
          {shadow}
          <Ellipse cx={x} cy={y - 12} rx={16} ry={10} fill={dim('#6E6A6A', '#4A4747')} />
          <Ellipse cx={x - 3} cy={y - 16} rx={9} ry={4} fill={dim('#858080', '#555151')} />
          <Circle cx={x + 15} cy={y - 16} r={7} fill={dim('#5E5A5A', '#403D3D')} />
          <Ellipse
            cx={x + 15}
            cy={y - 24}
            rx={10}
            ry={3}
            fill="none"
            stroke={dim('#DCD2C0', '#8E8A82')}
            strokeWidth={2.5}
          />
          <Circle cx={x + 17} cy={y - 17} r={1.2} fill="#1A1A1A" />
          {[-9, -3, 5, 11].map((dx) => (
            <Rect key={dx} x={x + dx} y={y - 4} width={3} height={7} fill={dim('#5E5A5A', '#403D3D')} />
          ))}
          <Path
            d={`M${x - 16} ${y - 12} q -5 3 -3 9`}
            stroke={dim('#5E5A5A', '#403D3D')}
            strokeWidth={1.6}
            fill="none"
          />
        </G>
      );
    case 'jeepney':
      return (
        <G>
          {shadow}
          <Box
            x={x}
            y={y - 4}
            w={1.4}
            d={0.6}
            h={14}
            top={dim('#F4EFE6', '#8E8A82')}
            left={dim('#1E9BF0', '#3E6488')}
            right={dim('#1786D1', '#355878')}
          />
          {[0, 1, 2].map((i) => (
            <Rect
              key={i}
              x={x - 18 + i * 8}
              y={y - 14 + i * 4}
              width={5}
              height={4}
              fill={night ? '#F5C46B' : '#D8F1FF'}
              opacity={0.9}
            />
          ))}
          <Box
            x={x}
            y={y - 18}
            w={1.4}
            d={0.6}
            h={3}
            top={dim('#FFB21E', '#B58B45')}
            left={dim('#E5483B', '#8C4A42')}
            right={dim('#C93B30', '#7A3F38')}
          />
          {/* silver horse ornament */}
          <Path d={`M${x + 6} ${y - 24} l 3 -5 l 2 3 l 2 -1 l -1 5 Z`} fill={dim('#D9D9D9', '#8E8E8E')} />
          {[
            [-12, 2],
            [8, 8],
          ].map(([dx, dy], i) => (
            <G key={i}>
              <Circle cx={x + dx} cy={y + dy - 2} r={4} fill="#222" />
              <Circle cx={x + dx} cy={y + dy - 2} r={1.6} fill="#999" />
            </G>
          ))}
        </G>
      );
    case 'library':
      return (
        <G>
          {shadow}
          <Box
            x={x}
            y={y}
            w={1.5}
            d={1.1}
            h={28}
            top={dim('#E8DCC8', '#857C6E')}
            left={dim('#DDCEB4', '#786F62')}
            right={dim('#CFBE9F', '#6B6357')}
          />
          {[0, 1, 2, 3].map((i) => (
            <Rect key={i} x={x + 3 + i * 7} y={y - 24 + i * 3.4} width={3} height={18} fill="#FFFFFF" opacity={0.8} />
          ))}
          {night
            ? [0, 1].map((i) => (
                <Rect
                  key={i}
                  x={x - 16 + i * 8}
                  y={y - 18 - i * 4}
                  width={5}
                  height={8}
                  fill="#F5C46B"
                  opacity={0.85}
                />
              ))
            : null}
          <Roof
            x={x}
            y={y - 28}
            w={1.5}
            d={1.1}
            peak={12}
            top={dim('#6E6AF0', '#4F4C99')}
            left={dim('#5D59D6', '#47448A')}
            right={dim('#4E4BBE', '#3F3C7B')}
          />
        </G>
      );
    case 'terraces':
      return (
        <G>
          {[0, 1, 2].map((i) => (
            <G key={i}>
              <Box
                x={x}
                y={y - i * 8}
                w={1.4 - i * 0.35}
                d={1.4 - i * 0.35}
                h={8}
                top={dim(['#9CCB5E', '#8BC34A', '#7CB342'][i], ['#4E6B35', '#47632F', '#405A2A'][i])}
                left={dim('#A68A5B', '#5E4D35')}
                right={dim('#937A4F', '#53442F')}
              />
              {/* rice rows */}
              <Line
                x1={x - 12 + i * 4}
                y1={y - 8 - i * 8}
                x2={x + 12 - i * 4}
                y2={y - 8 - i * 8}
                stroke={dim('#C9E28F', '#5D7A44')}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            </G>
          ))}
        </G>
      );
    case 'lighthouse':
      return (
        <G>
          {shadow}
          <Polygon
            points={`${x - 9},${y} ${x + 9},${y} ${x + 6},${y - 52} ${x - 6},${y - 52}`}
            fill={dim('#FFFFFF', '#C9C6D6')}
          />
          <Polygon points={`${x},${y} ${x + 9},${y} ${x + 6},${y - 52} ${x},${y - 52}`} fill="#000" opacity={0.08} />
          {[0, 1].map((i) => (
            <Polygon
              key={i}
              points={`${x - 8.4 + i * 1.6},${y - 12 - i * 20} ${x + 8.4 - i * 1.6},${y - 12 - i * 20} ${x + 7.8 - i * 1.6},${y - 22 - i * 20} ${x - 7.8 + i * 1.6},${y - 22 - i * 20}`}
              fill={dim('#E5483B', '#A6534A')}
            />
          ))}
          <Rect x={x - 9} y={y - 53} width={18} height={2.5} fill={dim('#333', '#222')} />
          <Rect x={x - 7} y={y - 62} width={14} height={10} rx={2} fill={night ? '#F5C46B' : '#FFE08A'} />
          <Polygon points={`${x - 9},${y - 62} ${x + 9},${y - 62} ${x},${y - 72}`} fill={dim('#333', '#222')} />
        </G>
      );
  }
}

function Palm({ x, y, night }: { x: number; y: number; night: boolean }) {
  const d = (a: string, b: string) => (night ? b : a);
  const top = { x: x + 6, y: y - 46 };
  return (
    <G>
      <Ellipse cx={x + 6} cy={y + 2} rx={14} ry={5} fill="#2B1B14" opacity={night ? 0.25 : 0.1} />
      <Path
        d={`M${x - 2} ${y} C ${x - 4} ${y - 18}, ${x} ${y - 34}, ${top.x} ${top.y} L ${top.x + 3} ${top.y + 1} C ${x + 4} ${y - 32}, ${x + 1} ${y - 18}, ${x + 3} ${y} Z`}
        fill={d('#A87A4A', '#5E4630')}
      />
      {[8, 18, 28, 38].map((t) => (
        <Line
          key={t}
          x1={x - 2 + t * 0.1}
          y1={y - t}
          x2={x + 3 + t * 0.12}
          y2={y - t - 1}
          stroke={d('#8A5A2B', '#4A3726')}
          strokeWidth={1}
        />
      ))}
      <Path d={`M${top.x} ${top.y} c -14 -6 -26 0 -30 12 c 10 -8 20 -9 30 -12 Z`} fill={d('#3E9A4B', '#2B6340')} />
      <Path d={`M${top.x} ${top.y} c 12 -9 26 -6 32 4 c -12 -5 -21 -3 -32 -4 Z`} fill={d('#46A352', '#2F6B45')} />
      <Path d={`M${top.x} ${top.y} c -2 -14 -12 -20 -22 -19 c 10 4 17 11 22 19 Z`} fill={d('#5DBB66', '#357550')} />
      <Path d={`M${top.x} ${top.y} c 6 -12 16 -16 24 -12 c -10 1 -17 6 -24 12 Z`} fill={d('#4FAF5B', '#2F6B45')} />
      <Path d={`M${top.x} ${top.y} c 10 2 16 12 14 20 c -4 -8 -9 -14 -14 -20 Z`} fill={d('#3A8F46', '#28603D')} />
      <Circle cx={top.x - 2} cy={top.y + 3} r={3} fill={d('#7A5326', '#3D2C1A')} />
      <Circle cx={top.x + 3} cy={top.y + 4} r={3} fill={d('#8A6338', '#4A3726')} />
    </G>
  );
}

// ─── Animation helpers ───────────────────────────────────────────────────────

/** 0 → 1 forever (yoyo by default). Off under Reduce Motion. */
export function useLoop(ms: number, delay = 0, yoyo = true, on = true) {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (!on || reduced) {
      v.set(0);
      return;
    }
    v.set(
      withDelay(
        delay,
        withRepeat(withTiming(1, { duration: ms, easing: yoyo ? ease.inOut : Easing.linear }), -1, yoyo),
      ),
    );
    return () => cancelAnimation(v);
  }, [ms, delay, yoyo, on, reduced, v]);
  return v;
}

const BW = 120;
const BH = 132;
const BB = 16;

/** A slice of the scene in its own view, so it can move on every platform. */
function Sprite({
  x,
  y,
  k,
  style,
  children,
}: {
  x: number;
  y: number;
  k: number;
  style?: ReturnType<typeof useAnimatedStyle>;
  children: ReactNode;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (x - BW / 2) * k,
          top: (y - BH + BB) * k,
          width: BW * k,
          height: BH * k,
          transformOrigin: `50% ${((BH - BB) / BH) * 100}%`,
        },
        style,
      ]}
    >
      <Svg width={BW * k} height={BH * k} viewBox={`${x - BW / 2} ${y - BH + BB} ${BW} ${BH}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

type Idle = { kind: 'sway' | 'bob' | 'breathe'; amp: number; ms: number };
const IDLE: Partial<Record<BuildingId | 'palm', Idle>> = {
  mango: { kind: 'sway', amp: 1.8, ms: 3400 },
  palm: { kind: 'sway', amp: 2.6, ms: 3000 },
  garden: { kind: 'breathe', amp: 0.035, ms: 2400 },
  carabao: { kind: 'bob', amp: 1.2, ms: 1100 },
  jeepney: { kind: 'bob', amp: 0.8, ms: 380 },
};

function useSpriteStyle(
  k: number,
  idleKey: BuildingId | 'palm',
  seed: number,
  drop: SharedValue<number>,
  jump: SharedValue<number>,
  squash: SharedValue<number>,
  op: SharedValue<number>,
) {
  const idle = IDLE[idleKey];
  const t = useLoop(idle?.ms ?? 1000, seed * 170, true, !!idle);
  const kind = idle?.kind;
  const amp = idle?.amp ?? 0;
  return useAnimatedStyle(() => {
    const i = t.get() * 2 - 1;
    const sq = squash.get();
    const br = kind === 'breathe' ? 1 + i * amp : 1;
    return {
      opacity: op.get(),
      transform: [
        { translateY: (drop.get() + jump.get() + (kind === 'bob' ? i * amp : 0)) * k },
        { rotate: `${kind === 'sway' ? i * amp : 0}deg` },
        { scaleX: (2 - sq) * br },
        { scaleY: sq * br },
      ],
    };
  });
}

function BuildingSprite({
  id,
  k,
  night,
  fresh,
  poke,
  seed,
}: {
  id: BuildingId;
  k: number;
  night: boolean;
  fresh: boolean;
  poke: number;
  seed: number;
}) {
  const b = BUILDINGS.find((q) => q.id === id)!;
  const { x, y } = stand(b.cell[0], b.cell[1]);
  const reduced = useReducedMotion();
  const drop = useSharedValue(fresh && !reduced ? -120 : 0);
  const jump = useSharedValue(0);
  const squash = useSharedValue(1);
  const op = useSharedValue(fresh ? 0 : 1);

  useEffect(() => {
    if (!fresh) return;
    op.set(withTiming(1, { duration: 260 }));
    drop.set(withDelay(60, withSpring(0, { damping: 10, stiffness: 150, mass: 1 })));
    squash.set(withDelay(380, withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, spring.bouncy))));
  }, [fresh, op, drop, squash]);

  useEffect(() => {
    if (!poke) return;
    jump.set(withSequence(withTiming(-14, { duration: 140, easing: ease.out }), withSpring(0, spring.bouncy)));
    squash.set(
      withSequence(
        withTiming(1.12, { duration: 140 }),
        withTiming(0.86, { duration: 110 }),
        withSpring(1, spring.bouncy),
      ),
    );
  }, [poke, jump, squash]);

  const style = useSpriteStyle(k, id, seed, drop, jump, squash, op);
  return (
    <Sprite x={x} y={y} k={k} style={style}>
      <Building id={id} x={x} y={y} night={night} />
    </Sprite>
  );
}

function PalmSprite({
  col,
  row,
  k,
  night,
  seed,
}: {
  col: number;
  row: number;
  k: number;
  night: boolean;
  seed: number;
}) {
  const { x, y } = stand(col, row);
  const zero = useSharedValue(0);
  const one = useSharedValue(1);
  const style = useSpriteStyle(k, 'palm', seed, zero, zero, one, one);
  return (
    <Sprite x={x} y={y} k={k} style={style}>
      <Palm x={x} y={y} night={night} />
    </Sprite>
  );
}

/** Pulsing build site with a floating pin on the next unlock's cell. */
function NextSite({ id, k, night }: { id: BuildingId; k: number; night: boolean }) {
  const b = BUILDINGS.find((q) => q.id === id)!;
  const { x, y } = iso(b.cell[0], b.cell[1]);
  const t = useLoop(1400);
  const ring = useAnimatedStyle(() => ({ opacity: 0.45 + t.get() * 0.55 }));
  const pin = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * t.get() * k }] }));
  const ink = night ? '#F5C46B' : '#C8400F';
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: (x - TW / 2) * k, top: y * k, width: TW * k, height: TH * k }, ring]}
      >
        <Svg width={TW * k} height={TH * k} viewBox={`${x - TW / 2} ${y} ${TW} ${TH}`}>
          <Polygon
            points={`${x},${y + 3} ${x + TW / 2 - 5},${y + TH / 2} ${x},${y + TH - 3} ${x - TW / 2 + 5},${y + TH / 2}`}
            fill={ink}
            fillOpacity={0.12}
            stroke={ink}
            strokeWidth={1.6}
            strokeDasharray="4 3"
          />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: (x - 9) * k, top: (y - 26) * k, width: 18 * k, height: 26 * k }, pin]}
      >
        <Svg width={18 * k} height={26 * k} viewBox="0 0 18 26">
          <Path d="M9 25 L4 15 A8 8 0 1 1 14 15 Z" fill={ink} />
          <Circle cx={9} cy={9} r={5} fill="#FFD15C" />
          <Path d="M9 6.2 v5.6 M6.2 9 h5.6" stroke="#8A4A00" strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </>
  );
}

function Ripple({ k, delay, night }: { k: number; delay: number; night: boolean }) {
  const t = useLoop(5200, delay, false);
  const D = 300;
  const style = useAnimatedStyle(() => ({
    opacity: (1 - t.get()) * 0.7,
    transform: [{ scaleY: 0.52 }, { scale: 0.92 + t.get() * 0.42 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ripple,
        {
          left: (CX - D / 2) * k,
          top: (CY - D / 2) * k,
          width: D * k,
          height: D * k,
          borderRadius: (D / 2) * k,
          borderColor: night ? 'rgba(170,190,240,0.5)' : 'rgba(255,255,255,0.9)',
          borderWidth: 2,
        },
        style,
      ]}
    />
  );
}

const GLINTS = Array.from({ length: 9 }, (_, i) => {
  const a = rnd(i, 1) * Math.PI * 2;
  const r = 0.78 + rnd(i, 2) * 0.16;
  return {
    x: OX + Math.cos(a) * VW * 0.44 * r,
    y: OY + 3 * TH + 8 + Math.sin(a) * VH * 0.31 * r,
    w: 6 + rnd(i, 3) * 8,
    ms: 1400 + rnd(i, 4) * 1400,
    delay: rnd(i, 5) * 1800,
  };
});

function Glint({ g, k, night }: { g: (typeof GLINTS)[number]; k: number; night: boolean }) {
  const t = useLoop(g.ms, g.delay);
  const style = useAnimatedStyle(() => ({ opacity: t.get() * 0.95, transform: [{ scaleX: 0.4 + t.get() * 0.6 }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.glint,
        {
          left: (g.x - g.w / 2) * k,
          top: g.y * k,
          width: g.w * k,
          height: Math.max(1.5, 2 * k),
          backgroundColor: night ? '#C9D6FF' : '#FFFFFF',
        },
        style,
      ]}
    />
  );
}

function Bangka({ k, night }: { k: number; night: boolean }) {
  const t = useLoop(2800);
  const drift = useLoop(9000, 400);
  const x = 64;
  const y = 236;
  const style = useAnimatedStyle(() => {
    const i = t.get() * 2 - 1;
    return {
      transform: [
        { translateX: (drift.get() * 2 - 1) * 6 * k },
        { translateY: i * 1.6 * k },
        { rotate: `${i * 3}deg` },
      ],
    };
  });
  const w = 56;
  const h = 44;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (x - w / 2) * k,
          top: (y - h) * k,
          width: w * k,
          height: h * k,
          transformOrigin: '50% 90%',
        },
        style,
      ]}
    >
      <Svg width={w * k} height={h * k} viewBox="0 0 120 94">
        <Path d="M60 6 L60 56" stroke="#6B4A33" strokeWidth={3} />
        <Path d="M61 8 C 84 18, 94 36, 92 54 L61 54 Z" fill={night ? '#C9C6D6' : '#FFF7EC'} />
        <Path d="M61 8 C 74 20, 80 34, 80 54 L61 54 Z" fill={night ? '#A6534A' : '#E5483B'} />
        <Path d="M58 12 C 44 24, 38 40, 40 54 L58 54 Z" fill={night ? '#B58B45' : '#FFB21E'} />
        <Path d="M12 58 Q 60 72 108 58 L 99 68 Q 60 79 21 68 Z" fill={night ? '#3E6488' : '#1E9BF0'} />
        <Path d="M6 76 H114" stroke="#6B4A33" strokeWidth={3} />
        <Path d="M20 64 L12 76 M100 64 L108 76" stroke="#6B4A33" strokeWidth={3} />
        <Ellipse cx={60} cy={84} rx={48} ry={5} fill="#FFFFFF" opacity={night ? 0.15 : 0.45} />
      </Svg>
    </Animated.View>
  );
}

function Smoke({ x, y, k, delay }: { x: number; y: number; k: number; delay: number }) {
  const t = useLoop(3000, delay, false);
  const s = 10;
  const style = useAnimatedStyle(() => ({
    opacity: Math.sin(t.get() * Math.PI) * 0.6,
    transform: [{ translateX: t.get() * 10 * k }, { translateY: -t.get() * 30 * k }, { scale: 0.5 + t.get() * 1.1 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.puff,
        { left: (x - s / 2) * k, top: (y - s / 2) * k, width: s * k, height: s * k, borderRadius: (s / 2) * k },
        style,
      ]}
    />
  );
}

function LampGlow({ k, night }: { k: number; night: boolean }) {
  const b = BUILDINGS.find((q) => q.id === 'lighthouse')!;
  const { x, y } = stand(b.cell[0], b.cell[1]);
  const lx = x;
  const ly = y - 57;
  const t = useLoop(1600);
  const sweep = useLoop(3600, 0, true, night);
  const glow = useAnimatedStyle(() => ({
    opacity: 0.35 + t.get() * 0.5,
    transform: [{ scale: 0.85 + t.get() * 0.3 }],
  }));
  const beam = useAnimatedStyle(() => ({ transform: [{ scaleX: sweep.get() * 2 - 1 }] }));
  const g = night ? 38 : 22;
  const bw = 120;
  const bh = 34;
  return (
    <>
      {night ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: lx * k,
              top: (ly - bh / 2) * k,
              width: bw * k,
              height: bh * k,
              transformOrigin: '0% 50%',
            },
            beam,
          ]}
        >
          <Svg width={bw * k} height={bh * k} viewBox={`0 0 ${bw} ${bh}`}>
            <Defs>
              <RadialGradient id="beam" cx="0" cy="0.5" rx="1" ry="0.9" fx="0" fy="0.5">
                <Stop offset="0" stopColor="#FFE9A8" stopOpacity="0.75" />
                <Stop offset="1" stopColor="#FFE9A8" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Polygon points={`0,${bh / 2 - 3} ${bw},0 ${bw},${bh} 0,${bh / 2 + 3}`} fill="url(#beam)" />
          </Svg>
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: (lx - g / 2) * k,
            top: (ly - g / 2) * k,
            width: g * k,
            height: g * k,
            borderRadius: (g / 2) * k,
            backgroundColor: night ? 'rgba(255,214,120,0.45)' : 'rgba(255,230,140,0.55)',
          },
          glow,
        ]}
      />
    </>
  );
}

const FIREFLIES = Array.from({ length: 10 }, (_, i) => ({
  x: 90 + rnd(i, 11) * 240,
  y: 70 + rnd(i, 12) * 140,
  ms: 1800 + rnd(i, 13) * 2200,
  dx: (rnd(i, 14) - 0.5) * 24,
  dy: (rnd(i, 15) - 0.5) * 18,
}));

function Firefly({ f, k }: { f: (typeof FIREFLIES)[number]; k: number }) {
  const t = useLoop(f.ms, f.ms / 3);
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + t.get() * 0.8,
    transform: [{ translateX: t.get() * f.dx * k }, { translateY: t.get() * f.dy * k }],
  }));
  const s = 4;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.firefly,
        { left: f.x * k, top: f.y * k, width: s * k, height: s * k, borderRadius: (s / 2) * k },
        style,
      ]}
    />
  );
}

function Cloud({
  k,
  y,
  scale,
  ms,
  delay,
  night,
}: {
  k: number;
  y: number;
  scale: number;
  ms: number;
  delay: number;
  night: boolean;
}) {
  const t = useLoop(ms, delay, false);
  const w = 70 * scale;
  const h = 26 * scale;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (-w + t.get() * (VW + w * 2)) * k }],
    opacity: Math.min(1, Math.sin(t.get() * Math.PI) * 3) * (night ? 0.35 : 0.95),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: y * k, width: w * k, height: h * k }, style]}
    >
      <Svg width={w * k} height={h * k} viewBox="0 0 70 26">
        <Path
          d="M10 24c-5 0-9-3-9-7s4-7 9-7c1-5 6-9 12-9 5 0 9 2 11 6 2-1 4-2 7-2 6 0 11 4 12 10h2c5 0 9 3 9 7s-4 2-9 2H10Z"
          fill={night ? '#5A6690' : '#FFFFFF'}
        />
      </Svg>
    </Animated.View>
  );
}

function Birds({ k }: { k: number }) {
  const t = useLoop(16000, 2000, false);
  const flap = useLoop(260);
  const fly = useAnimatedStyle(() => ({
    transform: [
      { translateX: (-40 + t.get() * (VW + 80)) * k },
      { translateY: Math.sin(t.get() * Math.PI * 2) * 6 * k },
    ],
  }));
  const wing = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 - flap.get() * 1.5 }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 22 * k, width: 40 * k, height: 18 * k }, fly]}
    >
      {[
        [0, 6, 1],
        [14, 0, 0.8],
        [22, 10, 0.7],
      ].map(([bx, by, s], i) => (
        <Animated.View
          key={i}
          style={[{ position: 'absolute', left: bx * k, top: by * k, width: 12 * s * k, height: 6 * s * k }, wing]}
        >
          <Svg width={12 * s * k} height={6 * s * k} viewBox="0 0 12 6">
            <Path
              d="M0.5 4 Q 3 0.5 6 4 Q 9 0.5 11.5 4"
              stroke="#5A3E30"
              strokeWidth={1.4}
              fill="none"
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

/** Celebration when a building goes up: dust ring + coin confetti. */
const BURST = Array.from({ length: 14 }, (_, i) => ({
  a: (i / 14) * Math.PI * 2 + rnd(i, 21) * 0.4,
  d: 30 + rnd(i, 22) * 34,
  c: ['#FFB21E', '#FFD15C', '#E5483B', '#1E9BF0', '#5CC98A', '#FFFFFF'][i % 6],
  s: 3 + rnd(i, 23) * 3,
}));

function Particle({ x, y, p, k }: { x: number; y: number; p: (typeof BURST)[number]; k: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(420, withTiming(1, { duration: 1100, easing: ease.out })));
  }, [t]);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v === 0 ? 0 : 1 - v,
      transform: [
        { translateX: Math.cos(p.a) * p.d * v * k },
        { translateY: (Math.sin(p.a) * p.d * 0.6 * v - 46 * v + 56 * v * v) * k },
        { rotate: `${v * 540}deg` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (x - p.s / 2) * k,
          top: (y - p.s / 2) * k,
          width: p.s * k,
          height: p.s * k * 1.4,
          borderRadius: 1,
          backgroundColor: p.c,
        },
        style,
      ]}
    />
  );
}

function Burst({ id, k }: { id: BuildingId; k: number }) {
  const b = BUILDINGS.find((q) => q.id === id)!;
  const { x, y } = stand(b.cell[0], b.cell[1]);
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(380, withTiming(1, { duration: 900, easing: ease.out })));
  }, [t]);
  const D = 100;
  const ring = useAnimatedStyle(() => ({
    opacity: t.get() === 0 ? 0 : (1 - t.get()) * 0.9,
    transform: [{ scaleY: 0.5 }, { scale: 0.1 + t.get() }],
  }));
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ripple,
          {
            left: (x - D / 2) * k,
            top: (y - D / 2) * k,
            width: D * k,
            height: D * k,
            borderRadius: (D / 2) * k,
            borderWidth: 4,
            borderColor: '#FFFFFF',
          },
          ring,
        ]}
      />
      {BURST.map((p, i) => (
        <Particle key={i} x={x} y={y - 24} p={p} k={k} />
      ))}
    </>
  );
}

/**
 * Paty strolls the path between the bahay and the pier, pauses, turns back.
 * At night Paty stands by the path, sleepy. Tap for a cheer and a hop.
 */
const WALK_A = (() => {
  const a = stand(3, 4);
  const b = stand(3, 5);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
})();
const WALK_B = stand(3, 6);
const PATY_S = 26;

function Stroller({ k, night, tappable }: { k: number; night: boolean; tappable: boolean }) {
  const t = useLoop(13000, 900, false, !night);
  const jump = useSharedValue(0);
  const [cheer, setCheer] = useState(0);
  useEffect(() => {
    if (!cheer) return;
    const id = setTimeout(() => setCheer(0), 1400);
    return () => clearTimeout(id);
  }, [cheer]);

  const walk = useAnimatedStyle(() => {
    const v = t.get();
    let p = 0;
    let dir = 1;
    if (v < 0.38) p = v / 0.38;
    else if (v < 0.5) p = 1;
    else if (v < 0.88) {
      p = 1 - (v - 0.5) / 0.38;
      dir = -1;
    } else dir = -1;
    return {
      transform: [
        { translateX: (WALK_B.x - WALK_A.x) * p * k },
        { translateY: (WALK_B.y - WALK_A.y) * p * k },
        { scaleX: dir },
      ],
    };
  });
  const bob = useAnimatedStyle(() => {
    const v = t.get();
    const moving = (v < 0.38 || (v >= 0.5 && v < 0.88)) && !night;
    const step = moving ? Math.abs(Math.sin(v * Math.PI * 2 * 26)) * 2.2 : 0;
    return { transform: [{ translateY: (-step + jump.get()) * k }] };
  });
  const S = PATY_S;
  const node = (
    <Animated.View style={bob}>
      <Paty expression={cheer ? 'cheering' : night ? 'sleepy' : 'happy'} size={S * k} interactive={false} />
    </Animated.View>
  );
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: (WALK_A.x - S / 2) * k,
          top: (WALK_A.y - S + 3) * k,
          width: S * k,
          height: S * k,
        },
        walk,
      ]}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: S * 0.22 * k,
          bottom: 0,
          width: S * 0.56 * k,
          height: 4 * k,
          borderRadius: 4 * k,
          backgroundColor: night ? 'rgba(0,0,0,0.3)' : 'rgba(43,27,20,0.16)',
        }}
      />
      {tappable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paty"
          onPress={() => {
            haptic.select();
            setCheer((n) => n + 1);
            jump.set(withSequence(withTiming(-12, { duration: 160, easing: ease.out }), withSpring(0, spring.bouncy)));
          }}
        >
          {node}
        </Pressable>
      ) : (
        node
      )}
    </Animated.View>
  );
}

/** A fish leaps out of the lagoon now and then, with a splash on each end. */
function Fish({
  x,
  y,
  k,
  night,
  ms,
  delay,
}: {
  x: number;
  y: number;
  k: number;
  night: boolean;
  ms: number;
  delay: number;
}) {
  const t = useLoop(ms, delay, false);
  const J = 0.2;
  const fish = useAnimatedStyle(() => {
    const v = t.get();
    const p = Math.min(1, v / J);
    return {
      opacity: v > 0.005 && v < J ? 1 : 0,
      transform: [
        { translateX: (-14 + 28 * p) * k },
        { translateY: -24 * Math.sin(Math.PI * p) * k },
        { rotate: `${-55 + 110 * p}deg` },
      ],
    };
  });
  const splash = (at: number, dx: number) => {
    'worklet';
    const v = t.get();
    const q = (v - at) / 0.16;
    const on = q >= 0 && q <= 1;
    return {
      opacity: on ? (1 - q) * 0.9 : 0,
      transform: [{ translateX: dx * k }, { scaleY: 0.4 }, { scale: on ? 0.3 + q : 0.3 }],
    };
  };
  const s1 = useAnimatedStyle(() => splash(0, -14));
  const s2 = useAnimatedStyle(() => splash(J, 14));
  const R = 16;
  const ring = {
    position: 'absolute' as const,
    left: (x - R / 2) * k,
    top: (y - R / 2) * k,
    width: R * k,
    height: R * k,
    borderRadius: (R / 2) * k,
    borderWidth: 1.5,
    borderColor: night ? 'rgba(190,205,255,0.6)' : 'rgba(255,255,255,0.95)',
  };
  const W = 14;
  const H = 8;
  return (
    <>
      <Animated.View pointerEvents="none" style={[ring, s1]} />
      <Animated.View pointerEvents="none" style={[ring, s2]} />
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', left: (x - W / 2) * k, top: (y - H / 2) * k, width: W * k, height: H * k },
          fish,
        ]}
      >
        <Svg width={W * k} height={H * k} viewBox="0 0 14 8">
          <Path d="M1 4 C 3 0.6, 8 0.6, 10.5 4 C 8 7.4, 3 7.4, 1 4 Z" fill={night ? '#9FB2E8' : '#FF9F1C'} />
          <Path d="M10 4 L 13.5 1.2 L 13 4 L 13.5 6.8 Z" fill={night ? '#7F90C8' : '#E5483B'} />
          <Circle cx={3.6} cy={3.4} r={0.8} fill="#2B1B14" />
        </Svg>
      </Animated.View>
    </>
  );
}

// ─── Static layers ───────────────────────────────────────────────────────────

function WaterLayer({ p }: { p: Pal }) {
  const cy = OY + 3 * TH + 8;
  return (
    <>
      <Defs>
        <RadialGradient id="lagoon" cx={CX} cy={CY - 6} rx={VW * 0.42} ry={VH * 0.32} gradientUnits="userSpaceOnUse">
          <Stop offset="0.35" stopColor={p.lagoonIn} />
          <Stop offset="1" stopColor={p.lagoonOut} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={OX} cy={cy} rx={VW * 0.49} ry={VH * 0.36} fill={p.deep} opacity={0.55} />
      <Ellipse cx={OX} cy={cy} rx={VW * 0.46} ry={VH * 0.33} fill="url(#lagoon)" />
      {/* reef patches */}
      {[
        [70, 120, 16, 5],
        [352, 168, 20, 6],
        [318, 236, 14, 4],
      ].map(([x, y, rx, ry], i) => (
        <Ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={p.night ? '#24406A' : '#A5E6E2'} opacity={0.8} />
      ))}
    </>
  );
}

function LandLayer({ p, tiles }: { p: Pal; tiles: { col: number; row: number }[] }) {
  const occupied = new Set<string>([
    ...BUILDINGS.map((b) => `${b.cell[0]},${b.cell[1]}`),
    ...PALMS.map(([c, r]) => `${c},${r}`),
    ...PATH.map(([c, r]) => `${c},${r}`),
  ]);
  const diamond = (x: number, y: number, s: number, dy: number) => {
    const cx = x;
    const cyy = y + TH / 2 + dy;
    return `${cx},${cyy - (TH / 2) * s} ${cx + (TW / 2) * s},${cyy} ${cx},${cyy + (TH / 2) * s} ${cx - (TW / 2) * s},${cyy}`;
  };
  return (
    <>
      {/* foam, then sand beach at the waterline */}
      {tiles.map(({ col, row }) => {
        const { x, y } = iso(col, row);
        return (
          <Polygon
            key={`f${col}-${row}`}
            points={diamond(x, y, 1.62, SIDE - 1)}
            fill={p.foam}
            opacity={p.night ? 0.18 : 0.55}
          />
        );
      })}
      {tiles.map(({ col, row }) => {
        const { x, y } = iso(col, row);
        return <Polygon key={`b${col}-${row}`} points={diamond(x, y, 1.38, SIDE - 3)} fill={p.sand} />;
      })}
      {/* cliffs */}
      {tiles.map(({ col, row }) => {
        const { x, y } = iso(col, row);
        const edgeS = !LAND(col, row + 1);
        const edgeE = !LAND(col + 1, row);
        return (
          <G key={`s${col}-${row}`}>
            {edgeS ? (
              <G>
                <Polygon
                  points={`${x - TW / 2},${y + TH / 2} ${x},${y + TH} ${x},${y + TH + SIDE} ${x - TW / 2},${y + TH / 2 + SIDE}`}
                  fill={p.side}
                />
                <Polygon
                  points={`${x - TW / 2},${y + TH / 2} ${x},${y + TH} ${x},${y + TH + 4} ${x - TW / 2},${y + TH / 2 + 4}`}
                  fill={p.grassLip}
                />
                <Line
                  x1={x - TW / 2}
                  y1={y + TH / 2 + 11}
                  x2={x}
                  y2={y + TH + 11}
                  stroke={p.strata}
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              </G>
            ) : null}
            {edgeE ? (
              <G>
                <Polygon
                  points={`${x},${y + TH} ${x + TW / 2},${y + TH / 2} ${x + TW / 2},${y + TH / 2 + SIDE} ${x},${y + TH + SIDE}`}
                  fill={p.sideDeep}
                />
                <Polygon
                  points={`${x},${y + TH} ${x + TW / 2},${y + TH / 2} ${x + TW / 2},${y + TH / 2 + 4} ${x},${y + TH + 4}`}
                  fill={p.grassLip}
                  opacity={0.85}
                />
                <Line
                  x1={x}
                  y1={y + TH + 11}
                  x2={x + TW / 2}
                  y2={y + TH / 2 + 11}
                  stroke={p.strata}
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              </G>
            ) : null}
          </G>
        );
      })}
      {/* grass */}
      {tiles.map(({ col, row }) => {
        const { x, y } = iso(col, row);
        return (
          <Polygon
            key={`t${col}-${row}`}
            points={`${x},${y} ${x + TW / 2},${y + TH / 2} ${x},${y + TH} ${x - TW / 2},${y + TH / 2}`}
            fill={(col + row) % 2 ? p.grassA : p.grassB}
          />
        );
      })}
      {/* stepping-stone path from the kubo to the pier */}
      {PATH.map(([col, row]) => {
        const { x, y } = iso(col, row);
        return [0.25, 0.55, 0.85].map((t, i) => (
          <Ellipse
            key={`p${col}-${row}-${i}`}
            cx={x - TW * 0.28 + t * TW * 0.3 + (i === 1 ? 4 : 0)}
            cy={y + TH * 0.25 + t * TH * 0.55}
            rx={5}
            ry={2.6}
            fill={p.stone}
          />
        ));
      })}
      {/* tufts and flowers on open grass */}
      {tiles.map(({ col, row }) => {
        if (occupied.has(`${col},${row}`)) return null;
        const r = rnd(col, row);
        if (r < 0.25) return null;
        const { x, y } = iso(col, row);
        const fx = x + (rnd(row, col) - 0.5) * 18;
        const fy = y + TH / 2 + (rnd(col + 9, row) - 0.5) * 8;
        return (
          <G key={`d${col}-${row}`}>
            <Path
              d={`M${fx - 3} ${fy} l 1 -4 M${fx} ${fy} l 0 -5 M${fx + 3} ${fy} l -1 -4`}
              stroke={p.tuft}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
            {r > 0.6 ? (
              <G>
                <Circle cx={fx + 8} cy={fy - 2} r={1.8} fill={p.night ? '#C9A04A' : '#FF8FA3'} />
                <Circle cx={fx - 8} cy={fy + 1} r={1.6} fill={p.night ? '#BFC7E8' : '#FFFFFF'} />
              </G>
            ) : null}
            {r > 0.85 ? <Ellipse cx={fx + 2} cy={fy + 4} rx={4} ry={2.4} fill={p.stone} /> : null}
          </G>
        );
      })}
    </>
  );
}

/** Wooden pier off the south shore, where the path ends. */
function Pier({ p }: { p: Pal }) {
  const a = iso(3, 6.95);
  const c = { x: a.x, y: a.y + TH / 2 + SIDE - 6 };
  const planks = [0, 1, 2, 3];
  return (
    <G>
      {[
        [-12, 4],
        [6, 13],
        [-22, 10],
        [-4, 19],
      ].map(([dx, dy], i) => (
        <Line
          key={i}
          x1={c.x + dx}
          y1={c.y + dy - 4}
          x2={c.x + dx}
          y2={c.y + dy + 8}
          stroke={p.woodDeep}
          strokeWidth={2.5}
        />
      ))}
      <Box x={c.x - 6} y={c.y + 6} w={0.42} d={1.25} h={3} top={p.wood} left={p.woodDeep} right={p.woodDeep} />
      {planks.map((i) => {
        const q = footprint(c.x - 6, c.y + 6, 0.42, 1.25, 3);
        const t = (i + 1) / 5;
        const l = { x: q.n.x + (q.w.x - q.n.x) * t, y: q.n.y + (q.w.y - q.n.y) * t };
        const r = { x: q.e.x + (q.s.x - q.e.x) * t, y: q.e.y + (q.s.y - q.e.y) * t };
        return <Line key={i} x1={l.x} y1={l.y} x2={r.x} y2={r.y} stroke={p.woodDeep} strokeWidth={0.8} />;
      })}
    </G>
  );
}

// ─── Scene ───────────────────────────────────────────────────────────────────

type Props = {
  built: BuildingId[];
  width: number;
  /** Pinch, pan and tap. */
  interactive?: boolean;
  onBuildingPress?: (id: BuildingId) => void;
  /** Building that just went up: it drops in with a dust ring and confetti. */
  fresh?: BuildingId | null;
  /** Next unlock: its cell shows a pulsing build site. */
  nextId?: BuildingId | null;
  /** Bounce a building (e.g. on tap). Change `n` to replay. */
  poke?: { id: BuildingId; n: number } | null;
  /** Ambient life: water, clouds, birds, smoke. Off for thumbnails. */
  alive?: boolean;
  overlay?: ReactNode;
};

/** "Your little isla": isometric island in a living lagoon that grows with coins. */
export function IslaScene({
  built,
  width,
  interactive,
  onBuildingPress,
  fresh,
  nextId,
  poke,
  alive = true,
  overlay,
}: Props) {
  const { isNight } = useTheme();
  const L = useL();
  const p = palette(isNight);
  const height = (width * VH) / VW;
  const k = width / VW;

  const tiles: { col: number; row: number }[] = [];
  for (let r = 0; r < N; r++) for (let c2 = 0; c2 < N; c2++) if (LAND(c2, r)) tiles.push({ col: c2, row: r });

  type Thing = { key: string; depth: number; node: ReactNode };
  const things: Thing[] = [];
  BUILDINGS.forEach((b, i) => {
    if (!built.includes(b.id)) return;
    things.push({
      key: b.id,
      depth: b.cell[0] + b.cell[1] + b.cell[0] * 0.01,
      node: (
        <BuildingSprite
          key={b.id}
          id={b.id}
          k={k}
          night={isNight}
          fresh={fresh === b.id}
          poke={poke?.id === b.id ? poke.n : 0}
          seed={i}
        />
      ),
    });
  });
  PALMS.forEach(([col, row], i) =>
    things.push({
      key: `palm${i}`,
      depth: col + row + col * 0.01,
      node: <PalmSprite key={`palm${i}`} col={col} row={row} k={k} night={isNight} seed={i + 3} />,
    }),
  );
  if (alive) {
    things.push({
      key: 'paty',
      depth: 8.6,
      node: <Stroller key="paty" k={k} night={isNight} tappable={!!interactive} />,
    });
  }
  things.sort((a, b) => a.depth - b.depth);

  const placed = BUILDINGS.filter((b) => built.includes(b.id));
  const bahay = built.includes('bahay') ? stand(3, 3) : null;

  const scene = (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`} style={StyleSheet.absoluteFill}>
        <WaterLayer p={p} />
      </Svg>
      {alive ? [0, 1733, 3466].map((d) => <Ripple key={d} k={k} delay={d} night={isNight} />) : null}
      {alive ? GLINTS.map((g, i) => <Glint key={i} g={g} k={k} night={isNight} />) : null}
      {alive ? (
        <>
          <Fish x={334} y={226} k={k} night={isNight} ms={5600} delay={1200} />
          <Fish x={112} y={246} k={k} night={isNight} ms={7400} delay={4200} />
        </>
      ) : null}
      <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`} style={StyleSheet.absoluteFill}>
        <LandLayer p={p} tiles={tiles} />
        <Pier p={p} />
      </Svg>
      <Bangka k={k} night={isNight} />
      {nextId && !built.includes(nextId) ? <NextSite id={nextId} k={k} night={isNight} /> : null}
      {things.map((t) => t.node)}
      {alive && bahay
        ? [0, 1000, 2000].map((d) => <Smoke key={d} x={bahay.x + 9} y={bahay.y - 50} k={k} delay={d} />)
        : null}
      {built.includes('lighthouse') ? <LampGlow k={k} night={isNight} /> : null}
      {alive && isNight ? FIREFLIES.map((f, i) => <Firefly key={i} f={f} k={k} />) : null}
      {alive ? (
        <>
          <Cloud k={k} y={6} scale={1} ms={42000} delay={0} night={isNight} />
          <Cloud k={k} y={30} scale={0.7} ms={56000} delay={18000} night={isNight} />
          {!isNight ? <Birds k={k} /> : null}
        </>
      ) : null}
      {fresh ? <Burst key={fresh} id={fresh} k={k} /> : null}
      {onBuildingPress
        ? placed.map((b) => {
            const { x, y } = iso(b.cell[0], b.cell[1]);
            return (
              <Pressable
                key={b.id}
                onPress={() => onBuildingPress(b.id)}
                accessibilityRole="button"
                accessibilityLabel={L(b.name)}
                style={[styles.hit, { left: (x - 28) * k, top: (y - 50) * k, width: 56 * k, height: 72 * k }]}
              />
            );
          })
        : null}
    </View>
  );

  if (!interactive) return scene;
  return (
    <Zoomable width={width} height={height} overlay={overlay}>
      <Rise>{scene}</Rise>
    </Zoomable>
  );
}

/** The island surfaces on first view: rises, settles with a small overshoot. */
function Rise({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    v.set(withDelay(80, withSpring(1, { damping: 14, stiffness: 90, mass: 1 })));
  }, [v]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.get() * 1.6),
    transform: [{ translateY: (1 - v.get()) * 36 }, { scale: 0.9 + v.get() * 0.1 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** One building on its own little tile, for lists and sheets. Static. */
export function BuildingThumb({ id, size = 56, locked }: { id: BuildingId; size?: number; locked?: boolean }) {
  const { isNight } = useTheme();
  const p = palette(isNight);
  const x = 60;
  const y = 92;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" style={locked ? { opacity: 0.4 } : undefined}>
      <Polygon points={`${x},${y - 18} ${x + 40},${y + 2} ${x},${y + 22} ${x - 40},${y + 2}`} fill={p.grassA} />
      <Polygon points={`${x - 40},${y + 2} ${x},${y + 22} ${x},${y + 30} ${x - 40},${y + 10}`} fill={p.side} />
      <Polygon points={`${x},${y + 22} ${x + 40},${y + 2} ${x + 40},${y + 10} ${x},${y + 30}`} fill={p.sideDeep} />
      <G transform={id === 'lighthouse' ? 'translate(12 22) scale(0.8)' : undefined}>
        <Building id={id} x={x} y={y + 4} night={isNight} />
      </G>
    </Svg>
  );
}

function Zoomable({
  width,
  height,
  children,
  overlay,
}: {
  width: number;
  height: number;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const base = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  const clampPan = (v: number, limit: number) => {
    'worklet';
    return Math.max(-limit, Math.min(limit, v));
  };

  const pan = usePanGesture({
    minDistance: 6,
    onBegin: () => {
      'worklet';
      sx.set(tx.get());
      sy.set(ty.get());
    },
    onUpdate: (e) => {
      'worklet';
      const s = scale.get();
      tx.set(clampPan(sx.get() + e.translationX, (width * (s - 0.6)) / 2));
      ty.set(clampPan(sy.get() + e.translationY, (height * (s - 0.6)) / 2));
    },
    onDeactivate: () => {
      'worklet';
      if (scale.get() <= 1.01) {
        tx.set(withSpring(0, spring.smooth));
        ty.set(withSpring(0, spring.smooth));
      }
    },
  });
  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      base.set(scale.get());
    },
    onUpdate: (e) => {
      'worklet';
      scale.set(Math.max(0.85, Math.min(2.6, base.get() * e.scale)));
    },
    onDeactivate: () => {
      'worklet';
      if (scale.get() < 1) scale.set(withSpring(1, spring.smooth));
    },
  });
  const gesture = useSimultaneousGestures(pan, pinch);

  const s = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.get() },
      { translateY: ty.get() },
      { scale: reduced ? Math.max(1, scale.get()) : scale.get() },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.clip, { width, height }]}>
        <Animated.View style={s}>{children}</Animated.View>
        {overlay}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  hit: { position: 'absolute' },
  ripple: { position: 'absolute' },
  glint: { position: 'absolute', borderRadius: 2 },
  puff: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.9)' },
  firefly: {
    position: 'absolute',
    backgroundColor: '#FFE38A',
    shadowColor: '#FFE38A',
    shadowOpacity: 1,
    shadowRadius: 4,
  },
});

export { LAND, PALMS, palette, stand, Building, Palm, WaterLayer, LandLayer, Pier };
