import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPackFromMarkdown } from '../lib/pack';
import {
  applyFullBackup,
  buildFullBackup,
  exportFullBackup,
  exportSaveJson,
  parseBackup,
} from '../lib/storage';
import { useStore } from '../store';
import type { ApiSettings } from '../types';

export function SettingsPage() {
  const {
    api,
    setApi,
    packs,
    addPack,
    removePack,
    activeSave,
    persistSave,
    saves,
    refresh,
  } = useStore();
  const [draft, setDraft] = useState<ApiSettings>(api);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState(activeSave?.characterNotes ?? '');
  const [syncPaste, setSyncPaste] = useState('');
  const [includeApi, setIncludeApi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const tapCount = useRef(0);

  function saveApi() {
    setApi(draft);
    setMsg('API 设定已保存到本机');
  }

  function importMd() {
    const text = importText.trim();
    if (!text) {
      setMsg('请粘贴模拟器规则文本');
      return;
    }
    const pack = createPackFromMarkdown(text);
    addPack(pack);
    setImportText('');
    setMsg(`已导入：${pack.title}`);
  }

  async function onFile(file: File) {
    const text = await file.text();
    const pack = createPackFromMarkdown(text);
    addPack(pack);
    setMsg(`已导入：${pack.title}`);
  }

  function saveNotes() {
    if (!activeSave) return;
    persistSave({
      ...activeSave,
      characterNotes: notes,
      updatedAt: Date.now(),
    });
    setMsg('角色写入已更新');
  }

  async function copyBackup() {
    const backup = buildFullBackup(includeApi);
    const text = JSON.stringify(backup);
    try {
      await navigator.clipboard.writeText(text);
      setMsg('已复制全部进度到剪贴板，可粘贴到另一台设备导入');
    } catch {
      setSyncPaste(text);
      setMsg('无法直接复制，已填入下方文本框，请手动全选复制');
    }
  }

  function doImportBackup(raw: string, mode: 'merge' | 'replace') {
    try {
      const backup = parseBackup(raw);
      if (mode === 'replace') {
        if (!confirm('将用备份覆盖本机全部存档与模拟器，确定？')) return;
      }
      const r = applyFullBackup(backup, mode);
      refresh();
      setSyncPaste('');
      setMsg(
        `已${mode === 'merge' ? '合并' : '覆盖'}导入：${r.saves} 个存档，${r.packs} 个模拟器`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导入失败');
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="icon-btn" style={{ textDecoration: 'none' }}>
          大厅
        </Link>
        <h1>设定</h1>
        {activeSave ? (
          <Link to="/play" className="icon-btn" style={{ textDecoration: 'none' }}>
            对局
          </Link>
        ) : (
          <span style={{ width: '2.4rem' }} />
        )}
      </header>

      <div className="panel">
        {msg ? <p className="muted">{msg}</p> : null}

        <div className="card">
          <h3>游玩指南</h3>
          <p className="muted">
            正式地址：
            <a
              href="https://ai-simulator-sooty.vercel.app/"
              target="_blank"
              rel="noreferrer"
            >
              https://ai-simulator-sooty.vercel.app/
            </a>
          </p>
          <ol className="guide-list">
            <li>手机、电脑随时打开上面的链接就能玩，不必两边同时在线。</li>
            <li>手机浏览器可把页面「添加到主屏幕」，更像独立 App。</li>
            <li>发给朋友也可以玩；每人在自己的设备上填自己的 API 即可。</li>
          </ol>
        </div>

        <div className="card">
          <h3>API</h3>
          <p className="muted">
            游玩需要使用你自己的 API（兼容 OpenAI 格式的接口均可）。
          </p>
          <div className="field">
            <label>Base URL</label>
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="field">
            <label>API Key</label>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>模型</label>
            <input
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </div>
          <div className="field">
            <label>温度 ({draft.temperature})</label>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              value={draft.temperature}
              onChange={(e) =>
                setDraft({ ...draft, temperature: Number(e.target.value) })
              }
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={saveApi}>
            保存 API
          </button>
          <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            备注：存档与 API 都保存在本机浏览器。换手机/电脑接着玩时，请用页面最下方的「进度同步」。
          </p>
        </div>

        <div className="card">
          <h3>导入模拟器</h3>
          <div className="field">
            <label>粘贴完整规则 Markdown</label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="把「港娱孩子模拟器」等整份玩法贴进来…"
            />
          </div>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={importMd}>
              导入文本
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => fileRef.current?.click()}
            >
              从文件导入
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const res = await fetch('/sample-hk-child.md');
                const text = await res.text();
                const pack = createPackFromMarkdown(text);
                addPack(pack);
                setMsg(`已导入示例：${pack.title}`);
              }}
            >
              导入示例
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,text/plain,text/markdown"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {packs.map((p) => (
            <div
              key={p.id}
              style={{
                marginTop: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              <strong>{p.title}</strong>
              <div className="muted">
                提纲约 {p.fillTemplate.split('\n').filter(Boolean).length} 行
              </div>
              <button
                type="button"
                className="btn btn-danger"
                style={{ marginTop: '0.4rem' }}
                onClick={() => {
                  if (confirm(`移除「${p.title}」？`)) removePack(p.id);
                }}
              >
                移除
              </button>
            </div>
          ))}
        </div>

        {activeSave ? (
          <details className="card collapsible">
            <summary>角色写入（当前存档）</summary>
            <p className="muted">默认折叠。可在此补充/修正人设，下一回合会带上。</p>
            <div className="field">
              <label>写入内容</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button type="button" className="btn" onClick={saveNotes}>
              保存写入
            </button>
          </details>
        ) : null}

        <details className="card collapsible">
          <summary>高级 · 核心规则</summary>
          {activeSave ? (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.75rem',
                maxHeight: '40vh',
                overflow: 'auto',
                color: 'var(--text-muted)',
              }}
            >
              {activeSave.packRules}
            </pre>
          ) : (
            <p className="muted">打开某个存档后，可在此查看该模拟器原文规则。</p>
          )}
        </details>

        <div className="card">
          <h3>进度同步</h3>
          <p className="muted">
            换设备时：在这边导出/复制 → 用微信等传到另一台 → 粘贴后合并导入。不必两边同时打开。
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={includeApi}
              onChange={(e) => setIncludeApi(e.target.checked)}
            />
            导出时包含 API Key（仅在自己的设备间勾选）
          </label>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                exportFullBackup(includeApi);
                setMsg('已下载全量备份 JSON');
              }}
            >
              导出全部进度
            </button>
            <button type="button" className="btn" onClick={() => void copyBackup()}>
              复制进度到剪贴板
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => backupRef.current?.click()}
            >
              从文件导入
            </button>
            <input
              ref={backupRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then((t) => doImportBackup(t, 'merge'));
                e.target.value = '';
              }}
            />
          </div>
          <div className="field" style={{ marginTop: '0.75rem' }}>
            <label>粘贴进度 JSON</label>
            <textarea
              value={syncPaste}
              onChange={(e) => setSyncPaste(e.target.value)}
              placeholder="在此粘贴备份文本…"
              className="fill-area"
              style={{ minHeight: '6rem' }}
            />
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!syncPaste.trim()}
              onClick={() => doImportBackup(syncPaste, 'merge')}
            >
              合并导入
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!syncPaste.trim()}
              onClick={() => doImportBackup(syncPaste, 'replace')}
            >
              覆盖导入
            </button>
          </div>
          {saves.length > 0 ? (
            <details style={{ marginTop: '0.75rem' }}>
              <summary className="muted">单独导出某个存档</summary>
              {saves.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn"
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '0.4rem',
                  }}
                  onClick={() => exportSaveJson(s)}
                >
                  导出：{s.name}
                </button>
              ))}
            </details>
          ) : null}
        </div>

        <p
          className="muted"
          style={{ textAlign: 'center', marginTop: '1.5rem' }}
          onClick={() => {
            tapCount.current += 1;
            if (tapCount.current >= 5) {
              tapCount.current = 0;
              setMsg('版本 0.1.0 · 本地 PWA');
            }
          }}
        >
          v0.1.0
        </p>
      </div>
    </div>
  );
}
