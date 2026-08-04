import { forwardRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ContentBlock, Turn } from '../types';

/** 合并模型误插入的半截换行（如引号未闭合、逗号后硬折行） */
function repairBrokenLineBreaks(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  const isMdFence = (t: string) =>
    /^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|---+$|\*\*\*$)/.test(t);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!out.length) {
      out.push(line);
      continue;
    }
    if (!trimmed) {
      out.push(line);
      continue;
    }

    const prev = out[out.length - 1];
    const prevT = prev.trimEnd();
    if (!prevT) {
      out.push(line);
      continue;
    }

    const openCorner =
      (prevT.match(/「/g)?.length ?? 0) > (prevT.match(/」/g)?.length ?? 0);
    const openQuote =
      (prevT.match(/“/g)?.length ?? 0) > (prevT.match(/”/g)?.length ?? 0);
    const openParen =
      (prevT.match(/（/g)?.length ?? 0) > (prevT.match(/）/g)?.length ?? 0);
    const endsWeak = /[，、：:|]$/.test(prevT);
    const nextIsStructure =
      isMdFence(trimmed) || /^(📍|📌)/.test(trimmed);

    // 例：推送内容在「同」后被硬折行 → 拼回同一行
    if (
      !nextIsStructure &&
      (openCorner || openQuote || openParen || endsWeak)
    ) {
      const needSpace =
        /[A-Za-z0-9]$/.test(prevT) && /^[A-Za-z0-9]/.test(trimmed);
      out[out.length - 1] = prevT + (needSpace ? ' ' : '') + trimmed;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function MarkdownBody({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const fixed = repairBrokenLineBreaks(text);
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {fixed}
      </ReactMarkdown>
    </div>
  );
}

function BlockView({ block }: { block: ContentBlock }) {
  if (block.type === 'dialogue') {
    return (
      <div className="block block-dialogue">
        <div className="speaker">{block.speaker}</div>
        <MarkdownBody text={block.text} className="md-inline" />
      </div>
    );
  }
  if (block.type === 'system') {
    return (
      <MarkdownBody text={block.text} className="block block-system md-body" />
    );
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
  return <MarkdownBody text={block.text} className="block block-narrative md-body" />;
}

function ChapterHead({
  turn,
  packTitle,
}: {
  turn: Turn;
  packTitle?: string;
}) {
  const isStreaming = turn.id.startsWith('stream-');
  const round = `第${turn.index}回合`;
  const name = (packTitle || '').trim();
  const heading =
    isStreaming || !name ? round : `${name} · ${round}`;

  return (
    <header className="chapter-head">
      <h2>{heading}</h2>
    </header>
  );
}

export const Stage = forwardRef<
  HTMLDivElement,
  {
    turn?: Turn | null;
    packTitle?: string;
    children?: ReactNode;
  }
>(function Stage({ turn, packTitle, children }, ref) {
  return (
    <div className="stage" ref={ref}>
      {turn ? (
        <>
          <ChapterHead turn={turn} packTitle={packTitle} />
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
      <div className="stage-end-spacer" aria-hidden />
    </div>
  );
});
