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
  { label: 'PERSONAL', value: 'One adapter per trader' },
  { label: 'PROOF', value: 'Validation before deploy' },
  { label: 'SAFETY', value: 'Rollback if the score slips' }
];

export const HOME_EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { label: 'BTC reclaim', prompt: 'BTC reclaim after sweep with rising CVD' },
  { label: 'ETH unwind', prompt: 'ETH funding unwind after crowded longs' },
  { label: 'SOL breakout', prompt: 'SOL breakout with momentum and clean pullback' }
];

export const HOME_LEARNING_STEPS: LearningStep[] = [
  {
    id: '01',
    title: 'Capture',
    copy: 'Save one setup in language you would actually use again, not a note you forget tomorrow.'
  },
  {
    id: '02',
    title: 'Watch',
    copy: 'Terminal keeps it alive and surfaces the moments that look close enough to deserve your attention.'
  },
  {
    id: '03',
    title: 'Judge',
    copy: 'Your yes and no calls become training signal instead of disappearing into chat history.'
  },
  {
    id: '04',
    title: 'Deploy',
    copy: 'Lab ships the stronger adapter and rolls back the weaker one when the evidence says so.'
  }
];

export const HOME_SURFACES: SurfaceCard[] = [
  {
    label: 'Terminal',
    title: 'Search the market and save the setup',
    copy: 'This is the fast workspace. Type what you are looking for, inspect the chart, and pin the pattern without leaving the flow.',
    path: '/terminal',
    cta: 'surface_terminal',
    actionLabel: 'Open Terminal'
  },
  {
    label: 'Lab',
    title: 'See whether the pattern earned another run',
    copy: 'Runs, comparisons, and validation live here. Lab is where evidence decides whether the model actually improved.',
    path: '/lab',
    cta: 'surface_lab',
    actionLabel: 'Open Lab'
  },
  {
    label: 'Dashboard',
    title: 'Come back to what changed',
    copy: 'Saved challenges, watched setups, and recent runs return as one inbox instead of scattered old routes.',
    path: '/dashboard',
    cta: 'surface_dashboard',
    actionLabel: 'Return to Dashboard'
  }
];

export const HOME_PROOF_ROWS: ProofRow[] = [
  {
    stage: 'PATTERN',
    title: 'BTC reclaim saved',
    detail: 'Funding stretched. CVD still rising. Wait for reclaim confirmation.'
  },
  {
    stage: 'SCAN HIT',
    title: 'Three close matches surfaced overnight',
    detail: 'The system found moments that resemble your saved judgment closely enough to review.'
  },
  {
    stage: 'VERDICT',
    title: 'Two good calls, one bad call',
    detail: 'Those yes and no decisions become reusable signal tied to one trader record.'
  },
  {
    stage: 'DEPLOY',
    title: 'Adapter v4 shipped',
    detail: 'Validation improved, so the stronger version becomes the new default and weaker ones stay out.'
  }
];
