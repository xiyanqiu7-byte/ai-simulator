export type BlockType = 'narrative' | 'dialogue' | 'system' | 'plaintext' | 'meta';

export interface ContentBlock {
  type: BlockType;
  text: string;
  speaker?: string;
  title?: string;
  label?: string;
}

export interface TurnOption {
  key: string;
  text: string;
}

export interface Turn {
  id: string;
  index: number;
  title: string;
  timeLabel?: string;
  phase?: string;
  blocks: ContentBlock[];
  options: TurnOption[];
  playerChoice?: {
    key?: string;
    custom?: string;
    label: string;
  };
  summary: string;
  createdAt: number;
}

/** @deprecated kept for old saves; new flow uses fillTemplate + characterNotes */
export interface QuestionnaireField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface SimulatorPack {
  id: string;
  title: string;
  rawRules: string;
  /** One copyable block of blank titles for the player to fill in a single textarea */
  fillTemplate: string;
  importedAt: number;
}

export type GamePhase = 'setup' | 'prologue' | 'playing';

export interface SaveGame {
  id: string;
  name: string;
  packId: string;
  packTitle: string;
  packRules: string;
  fillTemplate: string;
  characterNotes: string;
  phase: GamePhase;
  prologue?: string;
  turns: Turn[];
  updatedAt: number;
  createdAt: number;
  /** legacy */
  fields?: QuestionnaireField[];
  answers?: Record<string, string>;
}

export interface ApiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export const DEFAULT_API: ApiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.85,
};

export const STORAGE_KEYS = {
  api: 'simreader.api',
  packs: 'simreader.packs',
  saves: 'simreader.saves',
  activeSaveId: 'simreader.activeSaveId',
} as const;
