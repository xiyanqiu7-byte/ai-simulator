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
  customValue,
  onCustomChange,
}: {
  options: TurnOption[];
  disabled?: boolean;
  onChoose: (opt: TurnOption) => void | Promise<void>;
  /** 成功返回 true（清空输入）；失败返回 false（保留输入） */
  onCustom: (text: string) => boolean | Promise<boolean>;
  onRegenOptions?: () => void;
  showRegen?: boolean;
  expanded: boolean;
  onToggle: () => void;
  customValue: string;
  onCustomChange: (value: string) => void;
}) {
  const [sending, setSending] = useState(false);

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
            {customValue.trim() ? ' · 有草稿' : ''}
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
              disabled={disabled || sending}
              onClick={() => void onChoose(opt)}
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
            disabled={disabled || sending}
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
          const t = customValue.trim();
          if (!t || disabled || sending) return;
          void (async () => {
            setSending(true);
            try {
              const ok = await onCustom(t);
              if (ok) onCustomChange('');
            } finally {
              setSending(false);
            }
          })();
        }}
      >
        <input
          value={customValue}
          onChange={(e) => onCustomChange(e.target.value)}
          placeholder="自定义行动…"
          disabled={disabled || sending}
          enterKeyHint="send"
          onFocus={() => {
            if (!expanded) onToggle();
          }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={disabled || sending || !customValue.trim()}
        >
          发送
        </button>
      </form>
    </div>
  );
}
