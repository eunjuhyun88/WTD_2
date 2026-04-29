export interface ProofPillar {
  label: string;
  value: string;
}

export interface ExamplePrompt {
  label: string;
  prompt: string;
}

export interface LearningStep {
  id: string;
  title: string;
  copy: string;
}

export interface SurfaceCard {
  label: string;
  title: string;
  copy: string;
  path: string;
  cta: string;
  actionLabel: string;
}

export interface ProofRow {
  stage: string;
  title: string;
  detail: string;
}

export const HOME_PROOF_PILLARS: ProofPillar[] = [
  { label: 'MEMORY', value: 'Store the judgment' },
  { label: 'WATCH', value: 'Catch the scene again' },
  { label: 'GATE', value: 'Ship only with proof' }
];

export const HOME_EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { label: 'btc reclaim', prompt: 'btc 4h reclaim after selloff' },
  { label: 'eth unwind', prompt: 'eth daily unwind after crowded longs' },
  { label: 'sol retest', prompt: 'sol breakout retest after flush' }
];

export const HOME_LEARNING_STEPS: LearningStep[] = [
  {
    id: '01',
    title: 'Save',
    copy: 'Capture the setup you are looking at in one line.'
  },
  {
    id: '02',
    title: 'Watch',
    copy: 'Terminal keeps watching for similar moments after that.'
  },
  {
    id: '03',
    title: 'Judge',
    copy: 'Good calls and bad calls remain as records instead of disappearing.'
  },
  {
    id: '04',
    title: 'Ship',
    copy: 'Lab only moves a stronger version back into the default path.'
  }
];

export const HOME_SURFACES: SurfaceCard[] = [
  {
    label: '01 · PATTERNS',
    title: 'Find the pattern',
    copy: 'Live accumulation candidates, phase transitions, and hit rates across the full universe.',
    path: '/patterns',
    cta: 'surface_patterns',
    actionLabel: 'View Pattern Engine'
  },
  {
    label: '02 · TERMINAL',
    title: 'Capture it first',
    copy: 'Search the live scene and save the setup you want to keep.',
    path: '/cogochi',
    cta: 'surface_terminal',
    actionLabel: 'Open Terminal'
  },
  {
    label: '03 · LAB',
    title: 'Review the proof',
    copy: 'Inspect the run results and see whether the version actually improved.',
    path: '/lab',
    cta: 'surface_lab',
    actionLabel: 'Open Lab'
  }
];

export const HOME_PROOF_ROWS: ProofRow[] = [
  {
    stage: '01',
    title: 'BTC reclaim saved',
    detail: 'A one-line setup is stored in Terminal.'
  },
  {
    stage: '02',
    title: 'Similar scene caught overnight',
    detail: 'Only close-enough moments are surfaced back into the workspace.'
  },
  {
    stage: '03',
    title: 'Good calls split from bad calls',
    detail: 'Judgment does not disappear. It accumulates as record.'
  },
  {
    stage: '04',
    title: 'Only validated versions ship',
    detail: 'A new version becomes default only when the evidence improves.'
  }
];
