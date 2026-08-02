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
  /** 本回合写入的连贯增量（可选） */
  continuityDelta?: string;
  createdAt: number;
}

/** @deprecated kept for old saves; new flow uses fillTemplate + characterNotes */
export interface QuestionnaireField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}

/** form = fill before start; guided = AI runs onboarding then asks */
export type SetupMode = 'form' | 'guided';

export interface SimulatorPack {
  id: string;
  title: string;
  rawRules: string;
  /**
   * 开局时由 AI 精炼的规则卡（约 800～1500 字）。缓存后各存档共用。
   * 对局请求只带此卡，不再每轮塞原文。
   */
  rulesDigest?: string;
  /** One copyable block of blank titles for the player to fill in a single textarea */
  fillTemplate: string;
  setupMode: SetupMode;
  importedAt: number;
}

export type GamePhase = 'setup' | 'prologue' | 'playing';

export interface SaveGame {
  id: string;
  name: string;
  packId: string;
  packTitle: string;
  packRules: string;
  /** 本存档使用的规则精简卡（开局时从 pack 缓存或现场精炼） */
  rulesDigest?: string;
  fillTemplate: string;
  setupMode: SetupMode;
  characterNotes: string;
  /**
   * 滚动连贯笔记：关系变化、新认知、未竟冲突等（由模型每回合 continuityDelta 累积）
   * 用于减轻长线复读与设定漂移
   */
  continuityNotes?: string;
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

/** 推进节奏 */
export type PacePref = 'plot' | 'balanced' | 'texture';

/** 描写侧重（可多选） */
export type FocusPref =
  | 'atmosphere'
  | 'psychology'
  | 'plotBeat'
  | 'dialogue'
  | 'sensory'
  | 'relationship';

export interface PlayerPrefs {
  pace: PacePref;
  focus: FocusPref[];
}

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  pace: 'balanced',
  focus: [],
};

export const PACE_OPTIONS: { id: PacePref; label: string; hint: string }[] = [
  { id: 'plot', label: '多事件', hint: '少空转，优先剧情节点与选择后果' },
  { id: 'balanced', label: '均衡', hint: '推进与描写大致平衡' },
  { id: 'texture', label: '多铺陈', hint: '可多氛围细节，仍禁止复读同一桥段' },
];

export const FOCUS_OPTIONS: { id: FocusPref; label: string }[] = [
  { id: 'atmosphere', label: '环境氛围' },
  { id: 'psychology', label: '细腻心理' },
  { id: 'plotBeat', label: '剧情节拍' },
  { id: 'dialogue', label: '对话驱动' },
  { id: 'sensory', label: '感官细节' },
  { id: 'relationship', label: '人物关系张力' },
];

export const STORAGE_KEYS = {
  api: 'simreader.api',
  packs: 'simreader.packs',
  saves: 'simreader.saves',
  activeSaveId: 'simreader.activeSaveId',
  prefs: 'simreader.prefs',
} as const;
