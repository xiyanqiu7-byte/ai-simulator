import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ApiSettings, SaveGame, SimulatorPack } from './types';
import {
  deleteSave,
  getActiveSaveId,
  loadApiSettings,
  loadPacks,
  loadSaves,
  saveApiSettings,
  savePacks,
  setActiveSaveId,
  upsertSave,
} from './lib/storage';

interface Store {
  api: ApiSettings;
  packs: SimulatorPack[];
  saves: SaveGame[];
  activeSave: SaveGame | null;
  setApi: (api: ApiSettings) => void;
  addPack: (pack: SimulatorPack) => void;
  removePack: (id: string) => void;
  refresh: () => void;
  selectSave: (id: string | null) => void;
  persistSave: (save: SaveGame) => void;
  removeSave: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [api, setApiState] = useState(loadApiSettings);
  const [packs, setPacks] = useState(loadPacks);
  const [saves, setSaves] = useState(loadSaves);
  const [activeId, setActiveId] = useState<string | null>(getActiveSaveId);

  const refresh = useCallback(() => {
    setApiState(loadApiSettings());
    setPacks(loadPacks());
    setSaves(loadSaves());
    setActiveId(getActiveSaveId());
  }, []);

  const setApi = useCallback((next: ApiSettings) => {
    saveApiSettings(next);
    setApiState(next);
  }, []);

  const addPack = useCallback((pack: SimulatorPack) => {
    setPacks((prev) => {
      const next = [pack, ...prev.filter((p) => p.id !== pack.id)];
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
      packs,
      saves,
      activeSave,
      setApi,
      addPack,
      removePack,
      refresh,
      selectSave,
      persistSave,
      removeSave,
    }),
    [
      api,
      packs,
      saves,
      activeSave,
      setApi,
      addPack,
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
