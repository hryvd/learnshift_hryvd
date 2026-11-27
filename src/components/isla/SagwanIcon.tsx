import Svg, { Ellipse, Line } from 'react-native-svg';

/** Crisp wooden Sagwan paddle glyph matching Phosphor stroke weight. */
export function SagwanIcon({ size = 18, color = '#2B2D31' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={4.5} y1={19.5} x2={15.5} y2={8.5} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Ellipse cx={17.5} cy={6.5} rx={3.1} ry={4.8} transform="rotate(45 17.5 6.5)" fill={color} />
    </Svg>
  );
}
