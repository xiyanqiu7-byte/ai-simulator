import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { generatePrologue } from '../lib/api';
import { parseModelTurn, toTurn } from '../lib/parseTurn';
import { useStore } from '../store';
import type { SaveGame } from '../types';

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
      fillTemplate: pack.fillTemplate || '',
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
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>存档名称</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={pack ? `${pack.title} · 新存档` : ''}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={start} disabled={!pack}>
          填写角色设定
        </button>
      </div>
    </div>
  );
}

export function SetupPage() {
  const { activeSave, persistSave, api } = useStore();
  const nav = useNavigate();
  const [notes, setNotes] = useState(activeSave?.characterNotes ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  const template =
    activeSave.fillTemplate?.trim() ||
    `姓名：\n年龄：\n身份：\n特殊设定 / 要求：\n`;

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('复制失败，请长按上方文字手动复制');
    }
  }

  async function submit() {
    if (!activeSave) return;
    setError('');
    const text = notes.trim();
    if (!text) {
      setError('请先填写设定（可点上方提纲复制后再填）');
      return;
    }
    if (!api.apiKey.trim()) {
      setError('请先在设定页填写 API Key');
      return;
    }

    const draft: SaveGame = {
      ...activeSave,
      characterNotes: text,
      updatedAt: Date.now(),
    };
    persistSave(draft);
    setLoading(true);
    try {
      const raw = await generatePrologue(api, draft);
      const turn = toTurn(parseModelTurn(raw), 0);
      persistSave({
        ...draft,
        phase: 'prologue',
        prologue: raw,
        turns: [turn],
        updatedAt: Date.now(),
      });
      nav('/play');
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" style={{ textDecoration: 'none' }}>
          大厅
        </Link>
        <h1>角色设定</h1>
        <span style={{ width: '2.4rem' }} />
      </header>
      <div className="panel">
        <p className="muted">{activeSave.packTitle}</p>
        <p className="muted" style={{ marginBottom: '0.65rem' }}>
          上方是填写提纲（整段）。点一下复制，贴到下方大框里写。
          若有【请选择】A/B/C/D（如风格、浓度），也在「我的选择：」后面写上即可。
        </p>

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
          onClick={() => void submit()}
        >
          {loading ? '生成前置剧情…' : '生成前置剧情'}
        </button>
      </div>
    </div>
  );
}
