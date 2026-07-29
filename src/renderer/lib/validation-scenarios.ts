export const VALIDATION_SCENARIO_IDS = [
  'dashboard',
  'ecommerce',
  'kanban',
  'analytics',
  'settings',
  'landing',
  'blog',
  'docs',
  'pricing',
  'login',
  'profile',
  'chat',
] as const

export type ValidationScenarioId = (typeof VALIDATION_SCENARIO_IDS)[number]
