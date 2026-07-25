import { useState } from 'react';
import type { TurnOption } from '../types';

export function ActionBar({
  options,
  disabled,
  onChoose,
  onCustom,
  onRegenOptions,
  showRegen,
  expanded,
  onToggle,
}: {
  options: TurnOption[];
  disabled?: boolean;
  onChoose: (opt: TurnOption) => void;
  onCustom: (text: string) => void;
  onRegenOptions?: () => void;
  showRegen?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [custom, setCustom] = useState('');

  if (!expanded) {
    return (
      <div className="action-bar action-bar-collapsed">
        <button
          type="button"
          className="action-peek"
          onClick={onToggle}
          aria-label="展开选项"
        >
          <span className="action-peek-bar" />
          <span className="action-peek-label">
            选项
            {options.length > 0 ? ` · ${options.length}` : ''}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="action-bar action-bar-expanded">
      <button
        type="button"
        className="action-collapse"
        onClick={onToggle}
        aria-label="收起选项"
      >
        <span className="action-peek-bar" />
      </button>

      {options.length > 0 ? (
        <div className="options-grid">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="option-btn"
              disabled={disabled}
              onClick={() => onChoose(opt)}
            >
              <span className="key">{opt.key}</span>
              {opt.text}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: '0 0 0.5rem' }}>
          暂无选项 — 可自定义行动
          {showRegen && onRegenOptions ? '，或重新生成选项' : ''}
        </p>
      )}

      {showRegen && onRegenOptions ? (
        <div className="row-actions" style={{ marginBottom: '0.55rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={onRegenOptions}
          >
            重新生成选项
          </button>
        </div>
      ) : null}

      <form
        className="custom-row"
        onSubmit={(e) => {
          e.preventDefault();
          const t = custom.trim();
          if (!t || disabled) return;
          onCustom(t);
          setCustom('');
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="自定义行动…"
          disabled={disabled}
          enterKeyHint="send"
          onFocus={() => {
            if (!expanded) onToggle();
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={disabled || !custom.trim()}
        >
          发送
        </button>
      </form>
    </div>
  );
}
