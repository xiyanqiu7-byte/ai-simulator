import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ApiSettings, PlayerPrefs, SaveGame, SimulatorPack } from './types';
import {
  deleteSave,
  getActiveSaveId,
  loadApiSettings,
  loadPacks,
  loadPlayerPrefs,
  loadSaves,
  saveApiSettings,
  savePacks,
  savePlayerPrefs,
  setActiveSaveId,
  upsertSave,
} from './lib/storage';

interface Store {
  api: ApiSettings;
  prefs: PlayerPrefs;
  packs: SimulatorPack[];
  saves: SaveGame[];
  activeSave: SaveGame | null;
  setApi: (api: ApiSettings) => void;
  setPrefs: (prefs: PlayerPrefs) => void;
  setTheme: (theme: 'day' | 'night') => void;
  addPack: (pack: SimulatorPack) => void;
  updatePack: (pack: SimulatorPack) => void;
  removePack: (id: string) => void;
  refresh: () => void;
  selectSave: (id: string | null) => void;
  persistSave: (save: SaveGame) => void;
  removeSave: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [api, setApiState] = useState(loadApiSettings);
  const [prefs, setPrefsState] = useState(loadPlayerPrefs);
  const [packs, setPacks] = useState(loadPacks);
  const [saves, setSaves] = useState(loadSaves);
  const [activeId, setActiveId] = useState<string | null>(getActiveSaveId);

  const refresh = useCallback(() => {
    setApiState(loadApiSettings());
    setPrefsState(loadPlayerPrefs());
    setPacks(loadPacks());
    setSaves(loadSaves());
    setActiveId(getActiveSaveId());
  }, []);

  const setApi = useCallback((next: ApiSettings) => {
    saveApiSettings(next);
    setApiState(next);
  }, []);

  const setPrefs = useCallback((next: PlayerPrefs) => {
    savePlayerPrefs(next);
    setPrefsState(next);
  }, []);

  const setTheme = useCallback((theme: 'day' | 'night') => {
    setPrefsState((prev) => {
      const next = { ...prev, theme };
      savePlayerPrefs(next);
      return next;
    });
  }, []);

  const addPack = useCallback((pack: SimulatorPack) => {
    setPacks((prev) => {
      const next = [pack, ...prev.filter((p) => p.id !== pack.id)];
      savePacks(next);
      return next;
    });
  }, []);

  const updatePack = useCallback((pack: SimulatorPack) => {
    setPacks((prev) => {
      const next = prev.map((p) => (p.id === pack.id ? pack : p));
      savePacks(next);
      return next;
    });
  }, []);

  const removePack = useCallback((id: string) => {
    setPacks((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePacks(next);
      return next;
    });
  }, []);

  const selectSave = useCallback((id: string | null) => {
    setActiveSaveId(id);
    setActiveId(id);
  }, []);

  const persistSave = useCallback((save: SaveGame) => {
    upsertSave(save);
    setSaves(loadSaves());
    setActiveId(save.id);
  }, []);

  const removeSave = useCallback((id: string) => {
    deleteSave(id);
    setSaves(loadSaves());
    setActiveId(getActiveSaveId());
  }, []);

  const activeSave = useMemo(
    () => saves.find((s) => s.id === activeId) ?? null,
    [saves, activeId],
  );

  const value = useMemo(
    () => ({
      api,
      prefs,
      packs,
      saves,
      activeSave,
      setApi,
      setPrefs,
      setTheme,
      addPack,
      updatePack,
      removePack,
      refresh,
      selectSave,
      persistSave,
      removeSave,
    }),
    [
      api,
      prefs,
      packs,
      saves,
      activeSave,
      setApi,
      setPrefs,
      setTheme,
      addPack,
      updatePack,
      removePack,
      refresh,
      selectSave,
      persistSave,
      removeSave,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}
