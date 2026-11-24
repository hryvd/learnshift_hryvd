import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import type { CountItemId, QuestionVisual as VisualSpec, VisualSceneId } from '@/data/localQuestions';

const INK = '#17352F';
const ACCENT = '#146B50';
const WARM = '#C86D2D';
const GOLD = '#E9AE35';
const SOFT = '#DCE9DE';
const SKY = '#4C8BD6';
const CORAL = '#D95B5B';

/**
 * Crisp offline SVG illustrations for lower-grade break questions (counting,
 * shapes, clocks, fractions, bar charts, area grids, and object identification).
 */
export function QuestionVisual({ visual }: { visual: VisualSpec }) {
  return (
    <View style={styles.card} accessible accessibilityRole="image" accessibilityLabel="Question illustration">
      <Svg viewBox="0 0 260 112" width="100%" height={112}>
        {renderVisual(visual)}
      </Svg>
    </View>
  );
}

function renderVisual(v: VisualSpec) {
  switch (v.kind) {
    case 'count':
      return renderCount(v.item, v.count, v.addCount, v.crossOut, v.groupSize, v.askNext);
    case 'shape':
      return renderShape(v.shape, v.sideLabel);
    case 'clock':
      return renderClock(v.hour, v.minute);
    case 'fraction':
      return renderFraction(v.parts, v.filled, v.style, v.compareParts, v.compareFilled);
    case 'bars':
      return renderBars(v.items);
    case 'grid':
      return renderGrid(v.rows, v.cols, v.rowLabel, v.colLabel);
    case 'scene':
      return renderScene(v.id, v.hideEast);
  }
}

function drawCountIcon(item: CountItemId, cx: number, cy: number, crossed: boolean) {
  return (
    <G opacity={crossed ? 0.45 : 1}>
      {item === 'star' ? (
        <Polygon
          points={`${cx},${cy - 9} ${cx + 2.8},${cy - 3} ${cx + 9},${cy - 2.5} ${cx + 4.3},${cy + 1.8} ${cx + 5.6},${cy + 8.5} ${cx},${cy + 5} ${cx - 5.6},${cy + 8.5} ${cx - 4.3},${cy + 1.8} ${cx - 9},${cy - 2.5} ${cx - 2.8},${cy - 3}`}
          fill={GOLD}
          stroke={WARM}
          strokeWidth={1.3}
        />
      ) : null}
      {item === 'pencil' ? (
        <G>
          <Rect x={cx - 3.5} y={cy - 10} width={7} height={15} rx={1.5} fill={GOLD} stroke={INK} strokeWidth={1.1} />
          <Polygon points={`${cx - 3.5},${cy + 5} ${cx + 3.5},${cy + 5} ${cx},${cy + 11}`} fill="#F4D3AF" stroke={INK} strokeWidth={1.1} />
          <Rect x={cx - 3.5} y={cy - 12} width={7} height={3.5} rx={1} fill={CORAL} />
        </G>
      ) : null}
      {item === 'banana' ? (
        <Path
          d={`M${cx - 8},${cy + 4} Q${cx},${cy + 11} ${cx + 9},${cy - 5} Q${cx + 4},${cy - 9} ${cx - 5},${cy - 1} Z`}
          fill="#F5CE3E"
          stroke={WARM}
          strokeWidth={1.4}
        />
      ) : null}
      {item === 'cookie' ? (
        <G>
          <Circle cx={cx} cy={cy} r={9} fill="#D99B5E" stroke="#9C6530" strokeWidth={1.3} />
          <Circle cx={cx - 3} cy={cy - 2} r={1.4} fill="#5C381C" />
          <Circle cx={cx + 3} cy={cy + 2} r={1.4} fill="#5C381C" />
          <Circle cx={cx + 2} cy={cy - 3.5} r={1.2} fill="#5C381C" />
        </G>
      ) : null}
      {item === 'apple' ? (
        <G>
          <Circle cx={cx} cy={cy + 1} r={8.5} fill={CORAL} stroke="#A33B3B" strokeWidth={1.2} />
          <Path d={`M${cx},${cy - 7} Q${cx + 5},${cy - 12} ${cx + 7},${cy - 7}`} fill={ACCENT} />
        </G>
      ) : null}
      {item === 'marble' ? (
        <G>
          <Circle cx={cx} cy={cy} r={7.5} fill={SKY} stroke="#2B61A6" strokeWidth={1.2} />
          <Circle cx={cx - 2.3} cy={cy - 2.3} r={2} fill="#FFFFFF" opacity={0.75} />
        </G>
      ) : null}
      {item === 'block' ? (
        <Rect x={cx - 5.5} y={cy - 5.5} width={11} height={11} rx={2.5} fill={ACCENT} stroke={INK} strokeWidth={1} />
      ) : null}
      {crossed ? (
        <Line x1={cx - 9} y1={cy - 9} x2={cx + 9} y2={cy + 9} stroke={CORAL} strokeWidth={2.5} strokeLinecap="round" />
      ) : null}
    </G>
  );
}

function renderCount(
  item: CountItemId,
  count: number,
  addCount?: number,
  crossOut?: number,
  groupSize?: number,
  askNext?: boolean,
) {
  if (groupSize && count >= 10 && item === 'block') {
    const tens = Math.floor(count / groupSize);
    const ones = count % groupSize;
    return (
      <G>
        {Array.from({ length: tens }, (_, g) => (
          <G key={`ten-${g}`}>
            <Rect x={52 + g * 24} y={18} width={18} height={76} rx={5} fill="#E4EFE7" stroke={ACCENT} strokeWidth={1.5} />
            {Array.from({ length: 10 }, (__, k) => (
              <Rect key={k} x={56 + g * 24} y={22 + k * 7} width={10} height={5} rx={1} fill={ACCENT} />
            ))}
          </G>
        ))}
        <G>
          {Array.from({ length: ones }, (_, k) => {
            const col = k % 2;
            const row = Math.floor(k / 2);
            return (
              <Rect
                key={`one-${k}`}
                x={124 + col * 18}
                y={24 + row * 18}
                width={13}
                height={13}
                rx={3}
                fill={GOLD}
                stroke={WARM}
                strokeWidth={1.2}
              />
            );
          })}
        </G>
      </G>
    );
  }

  if (groupSize && groupSize > 1 && count <= 12) {
    const groups = Math.ceil(count / groupSize);
    const gw = Math.min(72, 224 / groups);
    const startX = (260 - groups * gw - (groups - 1) * 8) / 2;
    return (
      <G>
        {Array.from({ length: groups }, (_, g) => {
          const gx = startX + g * (gw + 8);
          const inGroup = Math.min(groupSize, count - g * groupSize);
          return (
            <G key={g}>
              <Rect x={gx} y={20} width={gw} height={72} rx={14} fill="#FFFFFF" stroke="#BBD1C3" strokeWidth={1.8} />
              {Array.from({ length: inGroup }, (__, j) => {
                const cols = inGroup <= 2 ? inGroup : 2;
                const col = j % cols;
                const row = Math.floor(j / cols);
                const px = gx + (cols === 1 ? gw / 2 : gw * (col === 0 ? 0.34 : 0.68));
                const py = inGroup <= 2 ? 56 : 42 + row * 26;
                return <G key={j}>{drawCountIcon(item, px, py, false)}</G>;
              })}
            </G>
          );
        })}
      </G>
    );
  }

  if (addCount && addCount > 0) {
    const leftCount = count;
    const totalW = (leftCount + addCount) * 24 + 26;
    const x0 = Math.max(16, (260 - totalW) / 2 + 12);
    return (
      <G>
        {Array.from({ length: leftCount }, (_, i) => (
          <G key={`l-${i}`}>{drawCountIcon(item, x0 + i * 24, 56, false)}</G>
        ))}
        <SvgText x={x0 + leftCount * 24 + 2} y={62} fill={ACCENT} fontSize={22} fontWeight="700" textAnchor="middle">
          +
        </SvgText>
        {Array.from({ length: addCount }, (_, i) => (
          <G key={`r-${i}`}>{drawCountIcon(item, x0 + leftCount * 24 + 24 + i * 24, 56, false)}</G>
        ))}
      </G>
    );
  }

  const cols = count <= 5 ? count : Math.min(5, Math.ceil(count / 2));
  const rows = Math.ceil(count / cols);
  const gapX = 28;
  const gapY = 30;
  const startX = (260 - (cols - 1) * gapX) / 2 - (askNext ? 18 : 0);
  const startY = rows === 1 ? 56 : 38;
  return (
    <G>
      {Array.from({ length: count }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const crossed = !!crossOut && i >= count - crossOut;
        return <G key={i}>{drawCountIcon(item, startX + col * gapX, startY + row * gapY, crossed)}</G>;
      })}
      {askNext ? (
        <G>
          <Rect x={208} y={38} width={32} height={34} rx={10} fill="#FFFFFF" stroke={ACCENT} strokeWidth={2} />
          <SvgText x={224} y={61} fill={ACCENT} fontSize={18} fontWeight="700" textAnchor="middle">
            ?
          </SvgText>
        </G>
      ) : null}
    </G>
  );
}

function renderShape(
  shape: 'triangle' | 'square' | 'rectangle' | 'circle' | 'right_angle',
  sideLabel?: string,
) {
  return (
    <G>
      {shape === 'triangle' ? (
        <Polygon points="130,18 82,92 178,92" fill="#FBE5B6" stroke={WARM} strokeWidth={3} strokeLinejoin="round" />
      ) : null}
      {shape === 'square' ? (
        <G>
          <Rect x={96} y={20} width={68} height={68} rx={6} fill="#DCEFE2" stroke={ACCENT} strokeWidth={3} />
          {sideLabel ? (
            <SvgText x={130} y={104} fill={INK} fontSize={13} fontWeight="700" textAnchor="middle">
              {sideLabel}
            </SvgText>
          ) : null}
        </G>
      ) : null}
      {shape === 'rectangle' ? (
        <Rect x={72} y={28} width={116} height={56} rx={6} fill="#DCE8F8" stroke={SKY} strokeWidth={3} />
      ) : null}
      {shape === 'circle' ? <Circle cx={130} cy={56} r={36} fill="#FADCDC" stroke={CORAL} strokeWidth={3} /> : null}
      {shape === 'right_angle' ? (
        <G>
          <Line x1={96} y1={22} x2={96} y2={88} stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Line x1={96} y1={88} x2={176} y2={88} stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Rect x={96} y={70} width={18} height={18} fill="none" stroke={ACCENT} strokeWidth={2.5} />
          <Path d="M96,46 A42,42 0 0,1 138,88" fill="none" stroke={WARM} strokeWidth={2.2} strokeDasharray="3 3" />
        </G>
      ) : null}
    </G>
  );
}

function renderClock(hour: number, minute: number) {
  const cx = 130;
  const cy = 56;
  const r = 42;
  const hAngle = (((hour % 12) + minute / 60) * 30 - 90) * (Math.PI / 180);
  const mAngle = (minute * 6 - 90) * (Math.PI / 180);
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill="#FFFFFF" stroke={INK} strokeWidth={3} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 - 90) * (Math.PI / 180);
        return (
          <Line
            key={i}
            x1={cx + (r - 6) * Math.cos(a)}
            y1={cy + (r - 6) * Math.sin(a)}
            x2={cx + (r - 2) * Math.cos(a)}
            y2={cy + (r - 2) * Math.sin(a)}
            stroke={i % 3 === 0 ? INK : '#99A8A1'}
            strokeWidth={i % 3 === 0 ? 2 : 1.2}
          />
        );
      })}
      <SvgText x={cx} y={cy - 24} fill={INK} fontSize={10} fontWeight="700" textAnchor="middle">
        12
      </SvgText>
      <SvgText x={cx + 28} y={cy + 4} fill={INK} fontSize={10} fontWeight="700" textAnchor="middle">
        3
      </SvgText>
      <SvgText x={cx} y={cy + 32} fill={INK} fontSize={10} fontWeight="700" textAnchor="middle">
        6
      </SvgText>
      <SvgText x={cx - 28} y={cy + 4} fill={INK} fontSize={10} fontWeight="700" textAnchor="middle">
        9
      </SvgText>
      <Line
        x1={cx}
        y1={cy}
        x2={cx + 21 * Math.cos(hAngle)}
        y2={cy + 21 * Math.sin(hAngle)}
        stroke={INK}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <Line
        x1={cx}
        y1={cy}
        x2={cx + 31 * Math.cos(mAngle)}
        y2={cy + 31 * Math.sin(mAngle)}
        stroke={ACCENT}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <Circle cx={cx} cy={cy} r={3.5} fill={WARM} />
    </G>
  );
}

function renderFraction(
  parts: number,
  filled: number,
  style: 'pie' | 'bar' = 'pie',
  compareParts?: number,
  compareFilled?: number,
) {
  if (style === 'bar' || compareParts) {
    const rows = compareParts
      ? [
          { p: parts, f: filled, y: 24, color: ACCENT },
          { p: compareParts, f: compareFilled ?? 1, y: 64, color: WARM },
        ]
      : [{ p: parts, f: filled, y: 40, color: ACCENT }];
    return (
      <G>
        {rows.map((r, idx) => {
          const bw = 180;
          const sw = bw / r.p;
          return (
            <G key={idx}>
              {Array.from({ length: r.p }, (__, i) => (
                <Rect
                  key={i}
                  x={40 + i * sw}
                  y={r.y}
                  width={sw - 3}
                  height={28}
                  rx={5}
                  fill={i < r.f ? r.color : '#FFFFFF'}
                  stroke="#B8C9BE"
                  strokeWidth={1.5}
                />
              ))}
            </G>
          );
        })}
      </G>
    );
  }
  const cx = 130;
  const cy = 56;
  const r = 40;
  return (
    <G>
      {Array.from({ length: parts }, (_, i) => {
        const a0 = (i / parts) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / parts) * Math.PI * 2 - Math.PI / 2;
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const large = a1 - a0 > Math.PI ? 1 : 0;
        return (
          <Path
            key={i}
            d={`M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`}
            fill={i < filled ? ACCENT : '#FFFFFF'}
            stroke={INK}
            strokeWidth={2}
          />
        );
      })}
    </G>
  );
}

function renderBars(items: { label: string; value: number }[]) {
  const maxVal = Math.max(1, ...items.map((x) => x.value));
  const bw = 38;
  const gap = 24;
  const startX = (260 - items.length * bw - (items.length - 1) * gap) / 2;
  const baseY = 86;
  return (
    <G>
      <Line x1={26} y1={baseY} x2={234} y2={baseY} stroke={INK} strokeWidth={2} />
      {items.map((it, i) => {
        const h = Math.max(10, (it.value / maxVal) * 56);
        const x = startX + i * (bw + gap);
        return (
          <G key={it.label}>
            <Rect x={x} y={baseY - h} width={bw} height={h} rx={6} fill={i === 1 ? WARM : ACCENT} />
            <SvgText x={x + bw / 2} y={baseY - h - 5} fill={INK} fontSize={11} fontWeight="700" textAnchor="middle">
              {String(it.value)}
            </SvgText>
            <SvgText x={x + bw / 2} y={baseY + 16} fill={INK} fontSize={11} fontWeight="700" textAnchor="middle">
              {it.label}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

function renderGrid(rows: number, cols: number, rowLabel?: string, colLabel?: string) {
  const cell = Math.min(Math.floor(156 / cols), Math.floor(72 / rows));
  const w = cols * cell;
  const h = rows * cell;
  const x0 = (260 - w) / 2;
  const y0 = (112 - h) / 2 - 4;
  return (
    <G>
      <Rect x={x0} y={y0} width={w} height={h} fill="#DCEFE2" stroke={ACCENT} strokeWidth={2} />
      {Array.from({ length: cols - 1 }, (_, i) => (
        <Line key={`v-${i}`} x1={x0 + (i + 1) * cell} y1={y0} x2={x0 + (i + 1) * cell} y2={y0 + h} stroke={ACCENT} strokeWidth={1.2} />
      ))}
      {Array.from({ length: rows - 1 }, (_, i) => (
        <Line key={`h-${i}`} x1={x0} y1={y0 + (i + 1) * cell} x2={x0 + w} y2={y0 + (i + 1) * cell} stroke={ACCENT} strokeWidth={1.2} />
      ))}
      {colLabel ? (
        <SvgText x={130} y={y0 + h + 16} fill={INK} fontSize={12} fontWeight="700" textAnchor="middle">
          {colLabel}
        </SvgText>
      ) : null}
      {rowLabel ? (
        <SvgText x={x0 - 8} y={y0 + h / 2 + 4} fill={INK} fontSize={12} fontWeight="700" textAnchor="end">
          {rowLabel}
        </SvgText>
      ) : null}
    </G>
  );
}

function renderScene(id: VisualSceneId, hideEast?: boolean) {
  switch (id) {
    case 'eye':
      return (
        <G>
          <Path d="M72,56 Q130,20 188,56 Q130,92 72,56 Z" fill="#FFFFFF" stroke={INK} strokeWidth={3} />
          <Circle cx={130} cy={56} r={18} fill={SKY} />
          <Circle cx={130} cy={56} r={8} fill={INK} />
          <Circle cx={125} cy={51} r={3.5} fill="#FFFFFF" />
        </G>
      );
    case 'ear':
      return (
        <G>
          <Path
            d="M114,34 C132,16 164,28 160,54 C157,74 146,90 128,88 C118,86 116,74 124,70 C134,64 140,56 138,46 C135,38 122,40 116,48"
            fill="#F4C59C"
            stroke={INK}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Path d="M88,44 Q78,56 88,68" fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" />
          <Path d="M76,36 Q62,56 76,76" fill="none" stroke={ACCENT} strokeWidth={2.2} strokeLinecap="round" />
        </G>
      );
    case 'butterfly':
      return (
        <G>
          <Path d="M126,52 C92,20 74,40 94,58 C78,74 96,92 126,64 Z" fill="#F29E4C" stroke={INK} strokeWidth={2} />
          <Path d="M134,52 C168,20 186,40 166,58 C182,74 164,92 134,64 Z" fill="#F29E4C" stroke={INK} strokeWidth={2} />
          <Circle cx={103} cy={46} r={5} fill="#FFF2B2" />
          <Circle cx={157} cy={46} r={5} fill="#FFF2B2" />
          <Rect x={127} y={36} width={6} height={42} rx={3} fill={INK} />
          <Path d="M129,36 Q120,22 114,24" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
          <Path d="M131,36 Q140,22 146,24" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </G>
      );
    case 'dog':
      return (
        <G>
          <Circle cx={130} cy={58} r={26} fill="#D59A62" stroke={INK} strokeWidth={2.4} />
          <Path d="M104,42 C92,46 92,72 104,70 Z" fill="#9D6838" stroke={INK} strokeWidth={2} />
          <Path d="M156,42 C168,46 168,72 156,70 Z" fill="#9D6838" stroke={INK} strokeWidth={2} />
          <Circle cx={120} cy={53} r={3.5} fill={INK} />
          <Circle cx={140} cy={53} r={3.5} fill={INK} />
          <Polygon points="124,63 136,63 130,70" fill={INK} />
          <Path d="M122,72 Q130,80 138,72" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </G>
      );
    case 'cat':
      return (
        <G>
          <Polygon points="106,44 102,22 122,36" fill="#F3BA69" stroke={INK} strokeWidth={2.2} />
          <Polygon points="154,44 158,22 138,36" fill="#F3BA69" stroke={INK} strokeWidth={2.2} />
          <Circle cx={130} cy={60} r={25} fill="#F3BA69" stroke={INK} strokeWidth={2.2} />
          <Circle cx={120} cy={56} r={3.2} fill={INK} />
          <Circle cx={140} cy={56} r={3.2} fill={INK} />
          <Polygon points="126,63 134,63 130,68" fill={CORAL} />
          <Line x1={94} y1={60} x2={112} y2={62} stroke={INK} strokeWidth={1.6} />
          <Line x1={94} y1={68} x2={112} y2={67} stroke={INK} strokeWidth={1.6} />
          <Line x1={148} y1={62} x2={166} y2={60} stroke={INK} strokeWidth={1.6} />
          <Line x1={148} y1={67} x2={166} y2={68} stroke={INK} strokeWidth={1.6} />
        </G>
      );
    case 'fish':
      return (
        <G>
          <Polygon points="164,56 188,38 188,74" fill="#F28C5E" stroke={INK} strokeWidth={2} />
          <Path d="M84,56 C102,30 150,30 166,56 C150,82 102,82 84,56 Z" fill="#5CB6E5" stroke={INK} strokeWidth={2.2} />
          <Circle cx={104} cy={52} r={3.5} fill="#FFFFFF" />
          <Circle cx={104} cy={52} r={1.8} fill={INK} />
          <Path d="M126,46 Q134,56 126,66" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
        </G>
      );
    case 'chicken':
      return (
        <G>
          <Path d="M104,76 C92,50 112,38 128,48 C134,34 152,32 154,48 C166,54 166,78 144,82 L114,82 Z" fill="#FFF1C9" stroke={INK} strokeWidth={2.2} />
          <Path d="M136,34 C138,24 146,24 148,34 C154,28 158,34 154,40 Z" fill={CORAL} />
          <Polygon points="156,46 168,50 156,54" fill={GOLD} stroke={INK} strokeWidth={1.5} />
          <Circle cx={146} cy={44} r={2.5} fill={INK} />
          <Path d="M116,58 Q134,52 140,66 Q124,72 116,58 Z" fill="#F3D89A" />
          <Line x1={124} y1={82} x2={124} y2={95} stroke={WARM} strokeWidth={2.5} />
          <Line x1={138} y1={82} x2={138} y2={95} stroke={WARM} strokeWidth={2.5} />
        </G>
      );
    case 'plant':
      return (
        <G>
          <Rect x={74} y={66} width={112} height={26} rx={8} fill="#8D6344" />
          <Path d="M130,66 L130,30" stroke={ACCENT} strokeWidth={4} strokeLinecap="round" />
          <Path d="M130,48 C108,42 104,24 128,32 Z" fill="#46A56B" />
          <Path d="M130,44 C152,38 156,20 132,28 Z" fill="#46A56B" />
          <Path d="M130,66 Q116,78 106,86 M130,66 Q130,80 128,88 M130,66 Q144,78 154,86" fill="none" stroke="#EED6B5" strokeWidth={2.2} strokeLinecap="round" />
        </G>
      );
    case 'flower':
      return (
        <G>
          <Line x1={130} y1={52} x2={130} y2={96} stroke={ACCENT} strokeWidth={4} strokeLinecap="round" />
          <Path d="M130,76 C112,72 110,60 128,66 Z" fill={ACCENT} />
          <Circle cx={130} cy={26} r={11} fill="#F2798F" />
          <Circle cx={146} cy={38} r={11} fill="#F2798F" />
          <Circle cx={140} cy={56} r={11} fill="#F2798F" />
          <Circle cx={120} cy={56} r={11} fill="#F2798F" />
          <Circle cx={114} cy={38} r={11} fill="#F2798F" />
          <Circle cx={130} cy={42} r={10} fill={GOLD} stroke={WARM} strokeWidth={2} />
        </G>
      );
    case 'sun':
      return (
        <G>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45 * Math.PI) / 180;
            return (
              <Line
                key={i}
                x1={130 + 28 * Math.cos(a)}
                y1={56 + 28 * Math.sin(a)}
                x2={130 + 40 * Math.cos(a)}
                y2={56 + 40 * Math.sin(a)}
                stroke={WARM}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            );
          })}
          <Circle cx={130} cy={56} r={22} fill={GOLD} stroke={WARM} strokeWidth={2.5} />
        </G>
      );
    case 'rain_cloud':
      return (
        <G>
          <Circle cx={106} cy={48} r={18} fill="#9FB5CC" />
          <Circle cx={130} cy={38} r={22} fill="#8CA5C0" />
          <Circle cx={154} cy={48} r={17} fill="#9FB5CC" />
          <Rect x={96} y={48} width={68} height={18} rx={9} fill="#8CA5C0" />
          <Line x1={104} y1={74} x2={99} y2={88} stroke={SKY} strokeWidth={3} strokeLinecap="round" />
          <Line x1={122} y1={74} x2={117} y2={90} stroke={SKY} strokeWidth={3} strokeLinecap="round" />
          <Line x1={140} y1={74} x2={135} y2={88} stroke={SKY} strokeWidth={3} strokeLinecap="round" />
          <Line x1={156} y1={74} x2={151} y2={88} stroke={SKY} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case 'ball':
      return (
        <G>
          <Circle cx={130} cy={56} r={30} fill={CORAL} stroke={INK} strokeWidth={2.5} />
          <Path d="M108,36 Q130,56 108,76" fill="none" stroke="#FFFFFF" strokeWidth={2.5} />
          <Path d="M152,36 Q130,56 152,76" fill="none" stroke="#FFFFFF" strokeWidth={2.5} />
        </G>
      );
    case 'ball_under_table':
      return (
        <G>
          <Rect x={76} y={32} width={108} height={12} rx={4} fill="#8D6344" stroke={INK} strokeWidth={2} />
          <Rect x={86} y={44} width={10} height={46} rx={2} fill="#6F4C32" />
          <Rect x={164} y={44} width={10} height={46} rx={2} fill="#6F4C32" />
          <Circle cx={130} cy={76} r={13} fill={CORAL} stroke={INK} strokeWidth={2} />
        </G>
      );
    case 'books':
      return (
        <G>
          <Rect x={82} y={66} width={96} height={18} rx={4} fill={SKY} stroke={INK} strokeWidth={1.8} />
          <Rect x={88} y={46} width={88} height={18} rx={4} fill={ACCENT} stroke={INK} strokeWidth={1.8} />
          <Rect x={92} y={26} width={82} height={18} rx={4} fill={WARM} stroke={INK} strokeWidth={1.8} />
        </G>
      );
    case 'ruler':
      return (
        <G>
          <Rect x={48} y={36} width={164} height={38} rx={6} fill="#F9D56E" stroke={INK} strokeWidth={2.2} />
          {Array.from({ length: 9 }, (_, i) => (
            <Line
              key={i}
              x1={66 + i * 16}
              y1={36}
              x2={66 + i * 16}
              y2={i % 2 === 0 ? 54 : 47}
              stroke={INK}
              strokeWidth={2}
            />
          ))}
        </G>
      );
    case 'thermometer':
      return (
        <G>
          <Rect x={122} y={14} width={16} height={62} rx={8} fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
          <Circle cx={130} cy={82} r={14} fill={CORAL} stroke={INK} strokeWidth={2.2} />
          <Rect x={127} y={34} width={6} height={44} rx={3} fill={CORAL} />
          <Line x1={144} y1={28} x2={152} y2={28} stroke={INK} strokeWidth={2} />
          <Line x1={144} y1={44} x2={152} y2={44} stroke={INK} strokeWidth={2} />
          <Line x1={144} y1={60} x2={152} y2={60} stroke={INK} strokeWidth={2} />
        </G>
      );
    case 'magnet':
      return (
        <G>
          <Path d="M104,34 L104,64 A26,26 0 0,0 156,64 L156,34" fill="none" stroke={CORAL} strokeWidth={14} strokeLinecap="butt" />
          <Rect x={97} y={24} width={14} height={14} fill="#CBD5E1" stroke={INK} strokeWidth={1.5} />
          <Rect x={149} y={24} width={14} height={14} fill="#CBD5E1" stroke={INK} strokeWidth={1.5} />
        </G>
      );
    case 'compass':
      return (
        <G>
          <Circle cx={130} cy={56} r={38} fill="#FFFFFF" stroke={INK} strokeWidth={2.2} />
          <Line x1={130} y1={32} x2={130} y2={80} stroke={ACCENT} strokeWidth={2.5} />
          <Line x1={106} y1={56} x2={154} y2={56} stroke={ACCENT} strokeWidth={2.5} />
          <SvgText x={130} y={28} fill={INK} fontSize={12} fontWeight="700" textAnchor="middle">
            N
          </SvgText>
          <SvgText x={130} y={92} fill={INK} fontSize={12} fontWeight="700" textAnchor="middle">
            S
          </SvgText>
          <SvgText x={98} y={60} fill={INK} fontSize={12} fontWeight="700" textAnchor="middle">
            W
          </SvgText>
          <SvgText x={162} y={60} fill={hideEast ? WARM : INK} fontSize={13} fontWeight="700" textAnchor="middle">
            {hideEast ? '?' : 'E'}
          </SvgText>
        </G>
      );
    case 'wash_hands':
      return (
        <G>
          <Path d="M96,34 L126,34 L126,44 L116,44" fill="none" stroke={SKY} strokeWidth={6} strokeLinecap="round" />
          <Line x1={116} y1={48} x2={116} y2={70} stroke={SKY} strokeWidth={3} strokeDasharray="4 4" />
          <Circle cx={116} cy={78} r={11} fill="#F4C59C" stroke={INK} strokeWidth={2} />
          <Circle cx={136} cy={78} r={11} fill="#F4C59C" stroke={INK} strokeWidth={2} />
          <Circle cx={126} cy={66} r={5} fill="#FFFFFF" stroke={SKY} strokeWidth={1.5} />
          <Circle cx={138} cy={63} r={4} fill="#FFFFFF" stroke={SKY} strokeWidth={1.5} />
        </G>
      );
    case 'school':
      return (
        <G>
          <Polygon points="84,48 130,18 176,48" fill={CORAL} stroke={INK} strokeWidth={2} />
          <Rect x={92} y={48} width={76} height={44} rx={4} fill="#FFF2CE" stroke={INK} strokeWidth={2} />
          <Rect x={122} y={66} width={16} height={26} rx={2} fill="#8D6344" />
          <Circle cx={130} cy={38} r={5} fill="#FFFFFF" stroke={INK} strokeWidth={1.5} />
          <Line x1={154} y1={14} x2={154} y2={30} stroke={INK} strokeWidth={2} />
          <Rect x={154} y={14} width={14} height={9} fill={SKY} />
        </G>
      );
    case 'firefighter':
      return (
        <G>
          <Circle cx={114} cy={60} r={18} fill="#F4C59C" stroke={INK} strokeWidth={2} />
          <Path d="M92,48 C96,28 132,28 136,48 Z" fill={CORAL} stroke={INK} strokeWidth={2} />
          <Rect x={106} y={32} width={16} height={10} rx={3} fill={GOLD} />
          <Line x1={134} y1={68} x2={164} y2={58} stroke={SKY} strokeWidth={4} strokeLinecap="round" />
          <Path d="M168,50 C176,34 188,46 184,64 C178,74 166,70 168,50 Z" fill={WARM} />
        </G>
      );
    case 'rice_field':
      return (
        <G>
          <Rect x={48} y={68} width={164} height={24} rx={6} fill="#8CC46E" />
          <Path d="M84,72 Q88,42 98,32" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
          <Path d="M114,72 Q118,40 128,30" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
          <Path d="M144,72 Q148,42 158,32" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
          <Path d="M174,72 Q178,44 186,36" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={68} cy={30} r={10} fill={GOLD} />
        </G>
      );
    case 'red_bag':
      return (
        <G>
          <Path d="M114,34 A16,14 0 0,1 146,34" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <Rect x={100} y={34} width={60} height={54} rx={12} fill={CORAL} stroke={INK} strokeWidth={2.2} />
          <Rect x={112} y={54} width={36} height={22} rx={6} fill="#B83B3B" />
        </G>
      );
    case 'banana':
      return (
        <G>
          <Path
            d="M84,66 C106,90 156,80 174,30 C166,26 158,28 156,36 C142,64 114,72 90,56 Z"
            fill="#F5CE3E"
            stroke={WARM}
            strokeWidth={2.5}
          />
        </G>
      );
  }
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    height: 112,
    borderRadius: 16,
    backgroundColor: SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
