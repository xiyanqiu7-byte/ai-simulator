import type {
  ApiSettings,
  FocusPref,
  PacePref,
  PlayerPrefs,
  SaveGame,
  SimulatorPack,
} from '../types';
import {
  DEFAULT_API,
  DEFAULT_PLAYER_PREFS,
  STORAGE_KEYS,
} from '../types';
import { analyzePackRules, inferPackTitle } from './pack';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadApiSettings(): ApiSettings {
  return { ...DEFAULT_API, ...readJson(STORAGE_KEYS.api, {}) };
}

export function saveApiSettings(settings: ApiSettings) {
  writeJson(STORAGE_KEYS.api, settings);
}

function normalizePrefs(raw: Partial<PlayerPrefs> | null | undefined): PlayerPrefs {
  const pace = raw?.pace;
  const validPace: PacePref[] = ['plot', 'balanced', 'texture'];
  const validFocus: FocusPref[] = [
    'atmosphere',
    'psychology',
    'plotBeat',
    'dialogue',
    'sensory',
    'relationship',
  ];
  return {
    pace: pace && validPace.includes(pace) ? pace : DEFAULT_PLAYER_PREFS.pace,
    focus: Array.isArray(raw?.focus)
      ? raw!.focus.filter((f): f is FocusPref =>
          validFocus.includes(f as FocusPref),
        )
      : [],
  };
}

export function loadPlayerPrefs(): PlayerPrefs {
  return normalizePrefs(readJson<Partial<PlayerPrefs>>(STORAGE_KEYS.prefs, {}));
}

export function savePlayerPrefs(prefs: PlayerPrefs) {
  writeJson(STORAGE_KEYS.prefs, normalizePrefs(prefs));
}

export function loadPacks(): SimulatorPack[] {
  const packs = readJson<SimulatorPack[]>(STORAGE_KEYS.packs, []);
  let dirty = false;
  const migrated = packs.map((p) => {
    const analysis = analyzePackRules(p.rawRules || '');
    const needTitle =
      !p.title?.trim() ||
      p.title === '未命名模拟器' ||
      p.title === '未命名模擬器';
    const title = needTitle ? inferPackTitle(p.rawRules || '') : p.title;
    if (
      p.fillTemplate === analysis.fillTemplate &&
      p.setupMode === analysis.setupMode &&
      p.title === title
    ) {
      return p;
    }
    dirty = true;
    return {
      ...p,
      title,
      fillTemplate: analysis.fillTemplate,
      setupMode: analysis.setupMode,
    };
  });
  if (dirty) savePacks(migrated);
  return migrated;
}

export function savePacks(packs: SimulatorPack[]) {
  writeJson(STORAGE_KEYS.packs, packs);
}

function normalizeSave(s: SaveGame): SaveGame {
  if (s.setupMode) return s;
  const analysis = analyzePackRules(s.packRules || '');
  return {
    ...s,
    setupMode: analysis.setupMode,
    fillTemplate: s.fillTemplate || analysis.fillTemplate,
  };
}

export function loadSaves(): SaveGame[] {
  const saves = readJson<SaveGame[]>(STORAGE_KEYS.saves, []);
  let dirty = false;
  const migrated = saves.map((s) => {
    if (s.setupMode) return s;
    dirty = true;
    return normalizeSave(s);
  });
  if (dirty) saveSaves(migrated);
  return migrated;
}

export function saveSaves(saves: SaveGame[]) {
  writeJson(STORAGE_KEYS.saves, saves);
}

export function getActiveSaveId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.activeSaveId);
}

export function setActiveSaveId(id: string | null) {
  if (id) localStorage.setItem(STORAGE_KEYS.activeSaveId, id);
  else localStorage.removeItem(STORAGE_KEYS.activeSaveId);
}

export function upsertSave(save: SaveGame) {
  const saves = loadSaves();
  const i = saves.findIndex((s) => s.id === save.id);
  if (i >= 0) saves[i] = save;
  else saves.unshift(save);
  saveSaves(saves);
  setActiveSaveId(save.id);
}

export function deleteSave(id: string) {
  const saves = loadSaves().filter((s) => s.id !== id);
  saveSaves(saves);
  if (getActiveSaveId() === id) {
    setActiveSaveId(saves[0]?.id ?? null);
  }
}

export function exportSaveJson(save: SaveGame) {
  downloadJson(`${save.name || 'save'}-${save.id.slice(0, 6)}.json`, save);
}

export interface FullBackup {
  version: 1;
  exportedAt: number;
  packs: SimulatorPack[];
  saves: SaveGame[];
  activeSaveId: string | null;
  /** API key included only if user opts in */
  api?: ApiSettings;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildFullBackup(includeApi: boolean): FullBackup {
  const backup: FullBackup = {
    version: 1,
    exportedAt: Date.now(),
    packs: loadPacks(),
    saves: loadSaves(),
    activeSaveId: getActiveSaveId(),
  };
  if (includeApi) backup.api = loadApiSettings();
  return backup;
}

export function exportFullBackup(includeApi: boolean) {
  const backup = buildFullBackup(includeApi);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`simreader-backup-${stamp}.json`, backup);
  return backup;
}

export function parseBackup(raw: string): FullBackup {
  const data = JSON.parse(raw) as FullBackup | SaveGame;
  if (data && typeof data === 'object' && 'version' in data && 'saves' in data) {
    return data as FullBackup;
  }
  // Single save file → wrap
  if (data && typeof data === 'object' && 'turns' in data && 'id' in data) {
    const save = data as SaveGame;
    return {
      version: 1,
      exportedAt: Date.now(),
      packs: loadPacks(),
      saves: [save],
      activeSaveId: save.id,
    };
  }
  throw new Error('无法识别的备份文件');
}

function normalizePack(p: SimulatorPack): SimulatorPack {
  const analysis = analyzePackRules(p.rawRules || '');
  const needTitle =
    !p.title?.trim() ||
    p.title === '未命名模拟器' ||
    p.title === '未命名模擬器';
  return {
    ...p,
    title: needTitle ? inferPackTitle(p.rawRules || '') : p.title,
    fillTemplate: analysis.fillTemplate,
    setupMode: analysis.setupMode,
  };
}

export function applyFullBackup(
  backup: FullBackup,
  mode: 'merge' | 'replace',
): { saves: number; packs: number } {
  const packsIn = (backup.packs || []).map(normalizePack);
  const savesIn = (backup.saves || []).map(normalizeSave);

  if (mode === 'replace') {
    savePacks(packsIn);
    saveSaves(savesIn);
    setActiveSaveId(backup.activeSaveId ?? savesIn[0]?.id ?? null);
  } else {
    const packs = loadPacks();
    const packMap = new Map(packs.map((p) => [p.id, p]));
    for (const p of packsIn) packMap.set(p.id, p);
    savePacks([...packMap.values()]);

    const saves = loadSaves();
    const saveMap = new Map(saves.map((s) => [s.id, s]));
    for (const s of savesIn) {
      const prev = saveMap.get(s.id);
      if (!prev || (s.updatedAt || 0) >= (prev.updatedAt || 0)) {
        saveMap.set(s.id, s);
      }
    }
    const merged = [...saveMap.values()].sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
    saveSaves(merged);
    if (backup.activeSaveId) setActiveSaveId(backup.activeSaveId);
  }

  if (backup.api?.apiKey) {
    saveApiSettings({ ...DEFAULT_API, ...backup.api });
  }

  return {
    saves: savesIn.length,
    packs: packsIn.length,
  };
}
