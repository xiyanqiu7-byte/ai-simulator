import { forwardRef, type ReactNode } from 'react';
import type { ContentBlock, Turn } from '../types';

function BlockView({ block }: { block: ContentBlock }) {
  if (block.type === 'dialogue') {
    return (
      <div className="block block-dialogue">
        <div className="speaker">{block.speaker}</div>
        <div>{block.text}</div>
      </div>
    );
  }
  if (block.type === 'system') {
    return <div className="block block-system">{block.text}</div>;
  }
  if (block.type === 'plaintext') {
    return (
      <div className="block block-plaintext">
        {block.title ? <div className="pt-title">{block.title}</div> : null}
        <pre>{block.text}</pre>
      </div>
    );
  }
  if (block.type === 'meta') {
    return (
      <div className="block block-meta">
        {block.label}：{block.text}
      </div>
    );
  }
  return <div className="block block-narrative">{block.text}</div>;
}

export const Stage = forwardRef<
  HTMLDivElement,
  {
    turn?: Turn | null;
    children?: ReactNode;
  }
>(function Stage({ turn, children }, ref) {
  return (
    <div className="stage" ref={ref}>
      {turn ? (
        <>
          <header className="turn-head">
            {turn.phase ? <span className="phase">{turn.phase}</span> : null}
            <h2>{turn.title || `第 ${turn.index} 回合`}</h2>
            {turn.timeLabel ? (
              <div className="time">{turn.timeLabel}</div>
            ) : null}
          </header>
          {turn.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
          {turn.playerChoice ? (
            <div className="block block-system">
              你的选择：{turn.playerChoice.label}
            </div>
          ) : null}
        </>
      ) : null}
      {children}
      {/* spacer so last lines aren't hidden under collapsed peek */}
      <div className="stage-end-spacer" aria-hidden />
    </div>
  );
});
