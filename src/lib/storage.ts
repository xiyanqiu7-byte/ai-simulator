import type { ApiSettings, SaveGame, SimulatorPack } from '../types';
import { DEFAULT_API, STORAGE_KEYS } from '../types';
import { extractFillTemplate } from './pack';

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

export function loadPacks(): SimulatorPack[] {
  const packs = readJson<SimulatorPack[]>(STORAGE_KEYS.packs, []);
  let dirty = false;
  const migrated = packs.map((p) => {
    const nextTemplate = extractFillTemplate(p.rawRules || '');
    if (p.fillTemplate === nextTemplate) return p;
    dirty = true;
    return { ...p, fillTemplate: nextTemplate };
  });
  if (dirty) savePacks(migrated);
  return migrated;
}

export function savePacks(packs: SimulatorPack[]) {
  writeJson(STORAGE_KEYS.packs, packs);
}

export function loadSaves(): SaveGame[] {
  return readJson(STORAGE_KEYS.saves, []);
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

export function applyFullBackup(
  backup: FullBackup,
  mode: 'merge' | 'replace',
): { saves: number; packs: number } {
  if (mode === 'replace') {
    savePacks(backup.packs || []);
    saveSaves(backup.saves || []);
    setActiveSaveId(backup.activeSaveId ?? backup.saves?.[0]?.id ?? null);
  } else {
    const packs = loadPacks();
    const packMap = new Map(packs.map((p) => [p.id, p]));
    for (const p of backup.packs || []) packMap.set(p.id, p);
    savePacks([...packMap.values()]);

    const saves = loadSaves();
    const saveMap = new Map(saves.map((s) => [s.id, s]));
    for (const s of backup.saves || []) {
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
    saves: (backup.saves || []).length,
    packs: (backup.packs || []).length,
  };
}
