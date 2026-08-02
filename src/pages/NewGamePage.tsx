import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ensureRulesDigest,
  formatChatTiming,
  generateOpening,
  generatePrologue,
  getLastChatTiming,
} from '../lib/api';
import { parseAnyTurn, toTurn, mergeContinuityNotes } from '../lib/parseTurn';
import { useStore } from '../store';
import type { SaveGame, SetupMode } from '../types';

export function NewGamePage() {
  const { packs, persistSave } = useStore();
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [name, setName] = useState('');
  const nav = useNavigate();

  const pack = useMemo(
    () => packs.find((p) => p.id === packId),
    [packs, packId],
  );

  function start() {
    if (!pack) return;
    const save: SaveGame = {
      id: crypto.randomUUID(),
      name: name.trim() || `${pack.title} · 新存档`,
      packId: pack.id,
      packTitle: pack.title,
      packRules: pack.rawRules,
      rulesDigest: pack.rulesDigest,
      fillTemplate: pack.fillTemplate || '',
      setupMode: pack.setupMode || 'form',
      characterNotes: '',
      phase: 'setup',
      turns: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persistSave(save);
    nav('/setup');
  }

  if (packs.length === 0) {
    return (
      <div className="page">
        <header className="topbar">
          <Link to="/" className="icon-btn" style={{ textDecoration: 'none' }}>
            大厅
          </Link>
          <h1>新建对局</h1>
          <span style={{ width: '2.4rem' }} />
        </header>
        <div className="empty">
          <p>请先在设定页导入模拟器规则。</p>
          <Link to="/settings" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            去设定
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" style={{ textDecoration: 'none' }}>
          大厅
        </Link>
        <h1>新建对局</h1>
        <span style={{ width: '2.4rem' }} />
      </header>
      <div className="panel">
        <div className="field">
          <label>选择模拟器</label>
          <select value={packId} onChange={(e) => setPackId(e.target.value)}>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.setupMode === 'guided' ? '（AI 引导开局）' : ''}
              </option>
            ))}
          </select>
        </div>
        {pack?.setupMode === 'guided' ? (
          <p className="muted">此模拟器由 AI 按规则引导开局，无需预先填完整人设。</p>
        ) : null}
        <div className="field">
          <label>存档名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={pack ? `${pack.title} · 新存档` : ''}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={start} disabled={!pack}>
          {pack?.setupMode === 'guided' ? '进入开局' : '填写角色设定'}
        </button>
      </div>
    </div>
  );
}

export function SetupPage() {
  const { activeSave, persistSave, api, packs, updatePack } = useStore();
  const nav = useNavigate();
  const [notes, setNotes] = useState(activeSave?.characterNotes ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [copied, setCopied] = useState(false);

  if (!activeSave) {
    return (
      <div className="page">
        <div className="empty">
          没有进行中的存档。<Link to="/">返回首页</Link>
        </div>
      </div>
    );
  }

  const mode: SetupMode = activeSave.setupMode || 'form';
  const template = activeSave.fillTemplate?.trim() || '';
  const isGuided = mode === 'guided';

  async function copyTemplate() {
    if (!template) return;
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('复制失败，请长按上方文字手动复制');
    }
  }

  async function startGame(forceGuided: boolean) {
    if (!activeSave) return;
    setError('');
    const text = notes.trim();
    const useGuided = forceGuided || isGuided;

    if (!useGuided && !text) {
      setError('请先填写设定（可点上方提纲复制后再填）');
      return;
    }
    if (!api.apiKey.trim()) {
      setError('请先在设定页填写 API Key');
      return;
    }

    const pack = packs.find((p) => p.id === activeSave.packId);
    let draft: SaveGame = {
      ...activeSave,
      setupMode: useGuided ? 'guided' : 'form',
      characterNotes: text,
      updatedAt: Date.now(),
    };
    persistSave(draft);
    setLoading(true);
    try {
      setLoadingLabel('准备中…');
      const { digest } = await ensureRulesDigest(
        api,
        draft,
        pack?.rulesDigest,
      );
      draft = { ...draft, rulesDigest: digest, updatedAt: Date.now() };
      persistSave(draft);
      if (pack && pack.rulesDigest !== digest) {
        updatePack({ ...pack, rulesDigest: digest });
      }

      setLoadingLabel(useGuided ? '开局中…' : '生成前置剧情…');
      const raw = useGuided
        ? await generateOpening(api, draft)
        : await generatePrologue(api, draft);
      const parsed = parseAnyTurn(raw);
      const turn = toTurn(parsed, 0);
      persistSave({
        ...draft,
        phase: useGuided ? 'playing' : 'prologue',
        prologue: raw,
        turns: [turn],
        continuityNotes: mergeContinuityNotes(
          draft.continuityNotes,
          parsed.continuityDelta,
          0,
          false,
        ),
        updatedAt: Date.now(),
      });
      const timing = getLastChatTiming();
      if (timing) {
        console.info('[simreader] 开局完成', formatChatTiming(timing));
      }
      nav('/play');
    } catch (e) {
      const timing = getLastChatTiming();
      if (timing) {
        console.info('[simreader] 开局失败前最后一次', formatChatTiming(timing));
      }
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" style={{ textDecoration: 'none' }}>
          大厅
        </Link>
        <h1>{isGuided ? '开局' : '角色设定'}</h1>
        <span style={{ width: '2.4rem' }} />
      </header>
      <div className="panel">
        <p className="muted">{activeSave.packTitle}</p>

        {isGuided ? (
          <>
            <p className="muted" style={{ marginBottom: '0.65rem' }}>
              本模拟器由 AI 按规则引导开局（欢迎 / 语言 /「开始游戏」/ 设定面板等），无需预先填完整人设。
              用底部选项或自定义输入推进即可。
            </p>
            {template ? (
              <details className="card collapsible" style={{ marginBottom: '0.75rem' }}>
                <summary>开局后可能问到的字段（参考，可复制）</summary>
                <button
                  type="button"
                  className="fill-template"
                  onClick={() => void copyTemplate()}
                  title="点击复制"
                  style={{ marginTop: '0.5rem' }}
                >
                  <div className="fill-template-hint">
                    {copied ? '已复制' : '点击复制提纲'}
                  </div>
                  <pre>{template}</pre>
                </button>
              </details>
            ) : null}
            <div className="field">
              <label>可选备注</label>
              <textarea
                className="fill-area"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="有想提前告诉 AI 的可写这里，一般留空即可…"
                style={{ minHeight: '6rem' }}
              />
            </div>
            {error ? <p className="error">{error}</p> : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={() => void startGame(true)}
            >
              {loading ? loadingLabel || '开局中…' : '开始游戏'}
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: '0.65rem' }}>
              上方是填写提纲（整段）。点一下复制，贴到下方大框里写。
              若有【请选择】A/B/C/D，也在「我的选择：」后面写上即可。
            </p>
            {template ? (
              <button
                type="button"
                className="fill-template"
                onClick={() => void copyTemplate()}
                title="点击复制"
              >
                <div className="fill-template-hint">
                  {copied ? '已复制' : '点击复制提纲'}
                </div>
                <pre>{template}</pre>
              </button>
            ) : (
              <p className="muted">未识别到提纲，可直接在下方自由填写。</p>
            )}
            <div className="field" style={{ marginTop: '1rem' }}>
              <label>你的设定（一整段）</label>
              <textarea
                className="fill-area"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="点上方复制提纲，粘贴到这里，在冒号后接着写…"
              />
            </div>
            {error ? <p className="error">{error}</p> : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={() => void startGame(false)}
            >
              {loading ? loadingLabel || '生成前置剧情…' : '生成前置剧情'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: '0.5rem', width: '100%' }}
              disabled={loading}
              onClick={() => void startGame(true)}
            >
              跳过，让 AI 开局提问
            </button>
          </>
        )}
      </div>
    </div>
  );
}
