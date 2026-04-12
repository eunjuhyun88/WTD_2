export const MAIN_CAST_CARDS = {
  duckeeAqua: '/main-cast/cards/duckee-aqua-card.png',
  ducky: '/main-cast/cards/ducky-card.png',
  redot: '/main-cast/cards/redot-card.png',
  nutty: '/main-cast/cards/nutty-card.png',
  catchimonGhost: '/main-cast/cards/catchimon-ghost-card.png',
  dinoDoux: '/main-cast/cards/dino-doux-card.png',
  duckeeGreen: '/main-cast/cards/duckee-green-card.png',
  dinoVita: '/main-cast/cards/dino-vita-card.png',
} as const;

export const MAIN_CAST_SHEETS = {
  duckeeAqua: '/main-cast/cute/duckee-aqua-sprite.png',
  ducky: '/main-cast/cute/ducky-sprite.png',
  redot: '/main-cast/cute/redot-sprite.png',
  nutty: '/main-cast/cute/nutty-sprite.png',
  catchimonGhost: '/main-cast/cute/catchimon-ghost-sprite.png',
  dinoDoux: '/main-cast/cute/dino-doux-sprite.png',
  duckeeGreen: '/main-cast/cute/duckee-green-sprite.png',
  dinoVita: '/main-cast/cute/dino-vita-sprite.png',
} as const;

export const MAIN_CAST_CREW = [
  { id: 'duckee-aqua', name: 'Duckee Aqua', card: MAIN_CAST_CARDS.duckeeAqua, sheet: MAIN_CAST_SHEETS.duckeeAqua },
  { id: 'ducky', name: 'Ducky', card: MAIN_CAST_CARDS.ducky, sheet: MAIN_CAST_SHEETS.ducky },
  { id: 'redot', name: 'Redot', card: MAIN_CAST_CARDS.redot, sheet: MAIN_CAST_SHEETS.redot },
  { id: 'nutty', name: 'Nutty', card: MAIN_CAST_CARDS.nutty, sheet: MAIN_CAST_SHEETS.nutty },
  { id: 'catchimon-ghost', name: 'Catchimon Ghost', card: MAIN_CAST_CARDS.catchimonGhost, sheet: MAIN_CAST_SHEETS.catchimonGhost },
  { id: 'dino-doux', name: 'Dino Doux', card: MAIN_CAST_CARDS.dinoDoux, sheet: MAIN_CAST_SHEETS.dinoDoux },
] as const;

export const MAIN_CAST_DEFAULT_AVATAR = MAIN_CAST_CARDS.duckeeAqua;

export const MAIN_CAST_AVATAR_OPTIONS = [
  MAIN_CAST_CARDS.duckeeAqua,
  MAIN_CAST_CARDS.ducky,
  MAIN_CAST_CARDS.redot,
  MAIN_CAST_CARDS.nutty,
  MAIN_CAST_CARDS.catchimonGhost,
  MAIN_CAST_CARDS.dinoDoux,
] as const;

export const MAIN_CAST_HOME_VISUALS = {
  terminal: MAIN_CAST_CARDS.redot,
  arena: MAIN_CAST_CARDS.dinoDoux,
  signals: MAIN_CAST_CARDS.catchimonGhost,
  passport: MAIN_CAST_CARDS.duckeeAqua,
  oracle: MAIN_CAST_CARDS.nutty,
  connect: MAIN_CAST_CARDS.ducky,
  scan: MAIN_CAST_CARDS.redot,
  decide: MAIN_CAST_CARDS.dinoVita,
  earn: MAIN_CAST_CARDS.duckeeGreen,
} as const;

export const MAIN_CAST_SUMMARY = {
  title: 'POCKET CAST',
  detail: 'Duckee, Ducky, Redot, Nutty, Catchimon, and Dino now rotate as the growable cast. Arena runs feel like care sessions, bond logs, and level-ups instead of following one mascot.',
} as const;
