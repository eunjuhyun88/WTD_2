export type ChartPatternKind = 'head_and_shoulders' | 'falling_wedge';
export type ChartPatternDirection = 'BULLISH' | 'BEARISH';
export type ChartPatternStatus = 'FORMING' | 'CONFIRMED';

export interface ChartPatternLine {
  id: string;
  label: string;
  color: string;
  style: 'solid' | 'dashed';
  from: { time: number; price: number };
  to: { time: number; price: number };
}

export interface ChartPatternDetection {
  id: string;
  kind: ChartPatternKind;
  name: string;
  shortName: string;
  direction: ChartPatternDirection;
  status: ChartPatternStatus;
  confidence: number;
  startTime: number;
  endTime: number;
  markerTime: number;
  markerPrice: number;
  guideLines: ChartPatternLine[];
}

export interface ChartPatternOptions {
  maxPatterns?: number;
  pivotLookaround?: number;
}
