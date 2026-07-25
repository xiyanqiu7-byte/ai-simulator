import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActionBar } from '../components/ActionBar';
import { Stage } from '../components/Stage';
import { TurnSheet } from '../components/TurnSheet';
import { generateTurn, regenerateOptions } from '../lib/api';
import { parseModelTurn, toTurn } from '../lib/parseTurn';
import { useStore } from '../store';
import type { SaveGame, Turn, TurnOption } from '../types';

export function PlayPage() {
  const { activeSave, persistSave, api } = useStore();
  const nav = useNavigate();
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const userCollapsedRef = useRef(false);

  useEffect(() => {
    if (!activeSave) nav('/');
  }, [activeSave, nav]);

  const turns = activeSave?.turns ?? [];
  const latestIndex = turns.length ? turns[turns.length - 1].index : 0;
  const viewingHistory =
    viewIndex !== null && viewIndex !== latestIndex;
  const atLatest = !viewingHistory;

  const currentTurn: Turn | undefined = useMemo(() => {
    if (!turns.length) return undefined;
    const idx = viewIndex ?? latestIndex;
    return turns.find((t) => t.index === idx) ?? turns[turns.length - 1];
  }, [turns, viewIndex, latestIndex]);

  useEffect(() => {
    if (activeSave?.turns.length) {
      setViewIndex(activeSave.turns[activeSave.turns.length - 1].index);
    }
  }, [activeSave?.id]);

  useEffect(() => {
    userCollapsedRef.current = false;
    setActionsExpanded(false);
    const el = stageRef.current;
    if (el) el.scrollTop = 0;
  }, [currentTurn?.id]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const check = () => {
      const overflow = el.scrollHeight - el.clientHeight;
      const gap = overflow - el.scrollTop;
      // 内容几乎一屏装下时，不算「滑到底」，保持收起（需点提示条）
      const canScroll = overflow > 48;
      const atBottom = gap < 40;
      const hasScrolled = el.scrollTop > 24;

      if (!canScroll) {
        // 不根据滚动自动展开；保留用户手动点开的状态
        return;
      }
      if (!atBottom || !hasScrolled) {
        if (!atBottom) userCollapsedRef.current = false;
        setActionsExpanded(false);
        return;
      }
      if (userCollapsedRef.current) {
        setActionsExpanded(false);
        return;
      }
      setActionsExpanded(true);
    };

    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(() => {
      // 布局变化后重新判断，但短文仍不自动展开
      check();
    });
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, [currentTurn?.id, loading, atLatest]);

  if (!activeSave) return null;

  const isPrologue = activeSave.phase === 'prologue';
  const canAct =
    atLatest &&
    !loading &&
    (activeSave.phase === 'playing' || activeSave.phase === 'prologue');

  function toggleActions() {
    setActionsExpanded((prev) => {
      if (prev) {
        userCollapsedRef.current = true;
        return false;
      }
      userCollapsedRef.current = false;
      const el = stageRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
      return true;
    });
  }

  async function runGeneration(save: SaveGame, instruction: string) {
    setLoading(true);
    setError('');
    try {
      const raw = await generateTurn(api, save, instruction);
      const nextIndex =
        save.turns.length === 0
          ? 1
          : save.turns[save.turns.length - 1].index + 1;
      const turn = toTurn(parseModelTurn(raw), nextIndex);
      const next: SaveGame = {
        ...save,
        phase: 'playing',
        turns: [...save.turns, turn],
        updatedAt: Date.now(),
      };
      persistSave(next);
      setViewIndex(turn.index);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }

  function applyChoiceToLatest(
    save: SaveGame,
    label: string,
    key?: string,
    custom?: string,
  ): SaveGame {
    const turnsCopy = [...save.turns];
    const last = turnsCopy[turnsCopy.length - 1];
    if (!last) return save;
    turnsCopy[turnsCopy.length - 1] = {
      ...last,
      playerChoice: { key, custom, label },
    };
    return { ...save, turns: turnsCopy, updatedAt: Date.now() };
  }

  async function onChoose(opt: TurnOption) {
    if (!canAct || !activeSave) return;
    if (isPrologue) {
      const withChoice = applyChoiceToLatest(
        { ...activeSave, phase: 'playing' },
        `${opt.key}. ${opt.text}`,
        opt.key,
      );
      persistSave(withChoice);
      await runGeneration(
        withChoice,
        `玩家确认前置剧情，选择了：${opt.key}. ${opt.text}\n请进入正式游戏第 1 回合（自由行动阶段）。`,
      );
      return;
    }
    const withChoice = applyChoiceToLatest(
      activeSave,
      `${opt.key}. ${opt.text}`,
      opt.key,
    );
    persistSave(withChoice);
    await runGeneration(
      withChoice,
      `玩家选择了选项 ${opt.key}：${opt.text}\n请据此推进下一回合。`,
    );
  }

  async function onCustom(text: string) {
    if (!canAct || !activeSave) return;
    if (isPrologue) {
      const withChoice = applyChoiceToLatest(
        { ...activeSave, phase: 'playing' },
        `自定义：${text}`,
        undefined,
        text,
      );
      persistSave(withChoice);
      await runGeneration(
        withChoice,
        `玩家确认前置剧情，自定义行动：${text}\n请进入正式游戏第 1 回合。`,
      );
      return;
    }
    const withChoice = applyChoiceToLatest(
      activeSave,
      `自定义：${text}`,
      undefined,
      text,
    );
    persistSave(withChoice);
    await runGeneration(
      withChoice,
      `玩家自定义行动：${text}\n请据此推进下一回合。`,
    );
  }

  async function onConfirmPrologue() {
    if (!activeSave) return;
    const withChoice = applyChoiceToLatest(
      { ...activeSave, phase: 'playing' },
      '确认前置剧情，进入游戏',
    );
    persistSave(withChoice);
    await runGeneration(
      withChoice,
      '玩家已确认前置剧情。请进入正式游戏第 1 回合（自由行动），提供选项。',
    );
  }

  async function onRegen() {
    if (!activeSave || !currentTurn || loading) return;
    setLoading(true);
    setError('');
    try {
      const raw = await regenerateOptions(api, activeSave, currentTurn);
      const parsed = parseModelTurn(raw);
      const turnsCopy = [...activeSave.turns];
      const i = turnsCopy.findIndex((t) => t.id === currentTurn.id);
      if (i >= 0) {
        turnsCopy[i] = {
          ...turnsCopy[i],
          options: parsed.options.length
            ? parsed.options
            : turnsCopy[i].options,
          blocks: parsed.blocks.length ? parsed.blocks : turnsCopy[i].blocks,
        };
        persistSave({
          ...activeSave,
          turns: turnsCopy,
          updatedAt: Date.now(),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '重新生成失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="icon-btn" style={{ textDecoration: 'none' }}>
            大厅
          </Link>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSheetOpen(true)}
          >
            回合
          </button>
        </div>
        <h1>
          {activeSave.name}
          {currentTurn ? ` · ${currentTurn.index}` : ''}
        </h1>
        <Link to="/settings" className="icon-btn" style={{ textDecoration: 'none' }}>
          设定
        </Link>
      </header>

      <Stage ref={stageRef} turn={currentTurn} loading={loading}>
        {error ? <p className="error">{error}</p> : null}
        {viewingHistory ? (
          <p className="muted">
            正在回看历史回合。
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => setViewIndex(latestIndex)}
            >
              回到最新
            </button>
          </p>
        ) : null}
        {isPrologue && atLatest && !loading ? (
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onConfirmPrologue}
            >
              确认并进入游戏
            </button>
          </div>
        ) : null}
      </Stage>

      {atLatest ? (
        <ActionBar
          options={currentTurn?.options ?? []}
          disabled={!canAct || loading}
          onChoose={onChoose}
          onCustom={onCustom}
          showRegen
          onRegenOptions={onRegen}
          expanded={actionsExpanded}
          onToggle={toggleActions}
        />
      ) : (
        <div className="action-bar">
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => setViewIndex(latestIndex)}
          >
            回到最新回合继续
          </button>
        </div>
      )}

      <TurnSheet
        open={sheetOpen}
        turns={turns}
        activeIndex={currentTurn?.index ?? 0}
        onClose={() => setSheetOpen(false)}
        onSelect={(i) => setViewIndex(i)}
      />
    </div>
  );
}
