import type { Turn } from '../types';

export function TurnSheet({
  open,
  turns,
  activeIndex,
  onClose,
  onSelect,
}: {
  open: boolean;
  turns: Turn[];
  activeIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="sheet"
        role="dialog"
        aria-label="回合目录"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h3>回合目录</h3>
        <div className="sheet-list">
          {turns.length === 0 ? (
            <p className="empty">还没有回合</p>
          ) : (
            [...turns].reverse().map((t) => (
              <button
                key={t.id}
                type="button"
                className={`sheet-item${t.index === activeIndex ? ' active' : ''}`}
                onClick={() => {
                  onSelect(t.index);
                  onClose();
                }}
              >
                <div className="t">
                  第 {t.index} 回合 · {t.title}
                </div>
                <div className="s">
                  {t.timeLabel || t.phase || t.summary.slice(0, 40)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
