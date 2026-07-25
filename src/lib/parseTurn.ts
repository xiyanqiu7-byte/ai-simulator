import type { ContentBlock, Turn, TurnOption } from '../types';

export interface ParsedTurnPayload {
  title: string;
  timeLabel?: string;
  phase?: string;
  blocks: ContentBlock[];
  options: TurnOption[];
  summary: string;
}

function stripFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  return text.trim();
}

function normalizeBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ContentBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const type = String(o.type || 'narrative');
    const text = String(o.text || '').trim();
    if (!text) continue;
    if (type === 'dialogue') {
      out.push({
        type: 'dialogue',
        speaker: String(o.speaker || '角色'),
        text,
      });
    } else if (type === 'plaintext') {
      out.push({
        type: 'plaintext',
        title: o.title ? String(o.title) : undefined,
        text,
      });
    } else if (type === 'system') {
      out.push({ type: 'system', text });
    } else if (type === 'meta') {
      out.push({
        type: 'meta',
        label: String(o.label || '信息'),
        text,
      });
    } else {
      out.push({ type: 'narrative', text });
    }
  }
  return out;
}

function normalizeOptions(raw: unknown): TurnOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const key = String(o.key || String.fromCharCode(65 + i)).toUpperCase();
      const text = String(o.text || '').trim();
      if (!text) return null;
      return { key, text };
    })
    .filter(Boolean) as TurnOption[];
}

/** Fallback: treat entire reply as narrative and try to scrape A/B/C/D. */
function parseFreeText(text: string): ParsedTurnPayload {
  const options: TurnOption[] = [];
  const optionRe =
    /(?:^|\n)\s*(?:选项\s*)?([A-Da-d])[\.．、:：\)）]\s*(.+?)(?=\n\s*(?:选项\s*)?[A-Da-d][\.．、:：\)）]|\n*$)/gs;
  let m: RegExpExecArray | null;
  const copy = text;
  while ((m = optionRe.exec(copy))) {
    options.push({ key: m[1].toUpperCase(), text: m[2].trim() });
  }

  let body = text;
  if (options.length) {
    body = text.replace(
      /(?:^|\n)\s*(?:选项\s*)?[A-Da-d][\.．、:：\)）][\s\S]*$/,
      '',
    );
  }

  // Extract plaintext code blocks as phone UI
  const blocks: ContentBlock[] = [];
  const parts = body.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    const fence = part.match(/^```(?:plaintext|text)?\s*([\s\S]*?)```$/i);
    if (fence) {
      blocks.push({ type: 'plaintext', text: fence[1].trim() });
    } else if (part.trim()) {
      blocks.push({ type: 'narrative', text: part.trim() });
    }
  }

  return {
    title: '本回合',
    blocks: blocks.length ? blocks : [{ type: 'narrative', text: body.trim() }],
    options,
    summary: body.replace(/\s+/g, ' ').slice(0, 120),
  };
}

export function parseModelTurn(raw: string): ParsedTurnPayload {
  const cleaned = stripFences(raw);
  try {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const json = JSON.parse(cleaned.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const blocks = normalizeBlocks(json.blocks);
      const options = normalizeOptions(json.options);
      if (blocks.length || options.length) {
        return {
          title: String(json.title || '本回合'),
          timeLabel: json.timeLabel ? String(json.timeLabel) : undefined,
          phase: json.phase ? String(json.phase) : undefined,
          blocks: blocks.length
            ? blocks
            : [{ type: 'narrative', text: String(json.content || raw) }],
          options,
          summary: String(
            json.summary ||
              blocks
                .map((b) => b.text)
                .join(' ')
                .slice(0, 120),
          ),
        };
      }
    }
  } catch {
    // fall through
  }
  return parseFreeText(raw);
}

export function toTurn(
  payload: ParsedTurnPayload,
  index: number,
): Turn {
  return {
    id: crypto.randomUUID(),
    index,
    title: payload.title,
    timeLabel: payload.timeLabel,
    phase: payload.phase,
    blocks: payload.blocks,
    options: payload.options,
    summary: payload.summary,
    createdAt: Date.now(),
  };
}
