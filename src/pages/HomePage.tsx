import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export function HomePage() {
  const { saves, packs, selectSave, removeSave } = useStore();
  const nav = useNavigate();

  return (
    <div className="page">
      <header className="topbar">
        <span style={{ width: '2.4rem' }} />
        <h1>模拟器阅读器</h1>
        <Link to="/settings" className="icon-btn" style={{ textDecoration: 'none' }}>
          设定
        </Link>
      </header>

      <div className="home-hero">
        <h2>暗夜剧场</h2>
        <p className="muted">导入模拟器 · 回合阅读 · 选项推进</p>
        <div className="row-actions" style={{ justifyContent: 'center' }}>
          <Link to="/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            新建对局
          </Link>
          <Link to="/settings" className="btn" style={{ textDecoration: 'none' }}>
            导入 / API
          </Link>
        </div>
        {packs.length === 0 ? (
          <p className="muted" style={{ marginTop: '1rem' }}>
            还没有模拟器，先去设定页粘贴规则文本。
          </p>
        ) : (
          <p className="muted" style={{ marginTop: '1rem' }}>
            已导入 {packs.length} 个模拟器
          </p>
        )}
      </div>

      <div className="panel">
        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.95rem' }}>存档</h3>
        {saves.length === 0 ? (
          <div className="empty">暂无存档</div>
        ) : (
          saves.map((s) => (
            <div key={s.id} className="card">
              <button
                type="button"
                className="save-item"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'inherit',
                }}
                onClick={() => {
                  selectSave(s.id);
                  nav(s.phase === 'setup' ? '/setup' : '/play');
                }}
              >
                <strong>{s.name}</strong>
                <span className="muted">
                  {s.packTitle} ·{' '}
                  {s.phase === 'playing'
                    ? `第 ${s.turns.length} 回合`
                    : s.phase === 'prologue'
                      ? '待确认前置'
                      : '填写设定中'}
                </span>
              </button>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    if (confirm(`删除存档「${s.name}」？`)) removeSave(s.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
