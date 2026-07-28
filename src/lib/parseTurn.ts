import type { ContentBlock, Turn, TurnOption } from '../types';

export interface ParsedTurnPayload {
  title: string;
  timeLabel?: string;
  phase?: string;
  blocks: ContentBlock[];
  options: TurnOption[];
  summary: string;
  continuityDelta?: string;
}

/** 模型返回了疑似 JSON 但无法解析成可读章节时抛出（勿把 raw JSON 当正文） */
export class TurnParseError extends Error {
  raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'TurnParseError';
    this.raw = raw;
  }
}

function stripFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim();
  return text.trim();
}

function looksLikeJsonBlob(text: string): boolean {
  const t = text.trim();
  if (!t.includes('{')) return false;
  if (/^\s*\{/.test(t)) return true;
  return (
    /"blocks"\s*:/.test(t) ||
    /"options"\s*:/.test(t) ||
    /"title"\s*:/.test(t)
  );
}

/** 在字符串字面量外做括号匹配，取出最外层对象 */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // 截断：补全缺失的 }
  if (depth > 0) return text.slice(start) + '}'.repeat(depth);
  return null;
}

function repairJsonText(s: string): string {
  let t = s.replace(/^\uFEFF/, '').trim();
  // 尾逗号
  t = t.replace(/,\s*([}\]])/g, '$1');
  // 智能引号
  t = t.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  return t;
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  const candidates = [
    text,
    repairJsonText(text),
    extractBalancedObject(text),
    extractBalancedObject(repairJsonText(text)),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    try {
      const v = JSON.parse(repairJsonText(c));
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function unescapeJsonFragment(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** 从半残 JSON 里捞 text / options 字段 */
function salvageBrokenJson(text: string): ParsedTurnPayload | null {
  const blocks: ContentBlock[] = [];
  const blockRe =
    /\{\s*"type"\s*:\s*"(narrative|dialogue|system|plaintext|meta)"\s*,([\s\S]*?)(?=\}\s*,\s*\{|\}\s*\])/g;
  let bm: RegExpExecArray | null;
  const slice = text;
  while ((bm = blockRe.exec(slice))) {
    const type = bm[1];
    const body = bm[2];
    const textM = body.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (!textM) continue;
    const content = unescapeJsonFragment(textM[1]).trim();
    if (!content) continue;
    if (type === 'dialogue') {
      const sp = body.match(/"speaker"\s*:\s*"((?:\\.|[^"\\])*)"/);
      blocks.push({
        type: 'dialogue',
        speaker: sp ? unescapeJsonFragment(sp[1]) : '角色',
        text: content,
      });
    } else if (type === 'plaintext') {
      const ti = body.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
      blocks.push({
        type: 'plaintext',
        title: ti ? unescapeJsonFragment(ti[1]) : undefined,
        text: content,
      });
    } else if (type === 'system') {
      blocks.push({ type: 'system', text: content });
    } else if (type === 'meta') {
      const lb = body.match(/"label"\s*:\s*"((?:\\.|[^"\\])*)"/);
      blocks.push({
        type: 'meta',
        label: lb ? unescapeJsonFragment(lb[1]) : '信息',
        text: content,
      });
    } else {
      blocks.push({ type: 'narrative', text: content });
    }
  }

  // 宽松：任意 "text":"..."
  if (!blocks.length) {
    const loose = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let lm: RegExpExecArray | null;
    while ((lm = loose.exec(text))) {
      const content = unescapeJsonFragment(lm[1]).trim();
      if (content.length >= 8) {
        blocks.push({ type: 'narrative', text: content });
      }
    }
  }

  const options: TurnOption[] = [];
  const optRe =
    /\{\s*"key"\s*:\s*"([A-Da-d])"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  let om: RegExpExecArray | null;
  while ((om = optRe.exec(text))) {
    options.push({
      key: om[1].toUpperCase(),
      text: unescapeJsonFragment(om[2]).trim(),
    });
  }

  if (!blocks.length && !options.length) return null;

  const titleM = text.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const phaseM = text.match(/"phase"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const timeM = text.match(/"timeLabel"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const sumM = text.match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)"/);
  const deltaM = text.match(/"continuityDelta"\s*:\s*"((?:\\.|[^"\\])*)"/);

  return {
    title: titleM ? unescapeJsonFragment(titleM[1]) : '本回合',
    timeLabel: timeM ? unescapeJsonFragment(timeM[1]) : undefined,
    phase: phaseM ? unescapeJsonFragment(phaseM[1]) : undefined,
    blocks: blocks.length
      ? blocks
      : [{ type: 'system', text: '（本章正文解析不完整，请重试生成）' }],
    options,
    summary: sumM
      ? unescapeJsonFragment(sumM[1])
      : blocks
          .map((b) => b.text)
          .join(' ')
          .slice(0, 120),
    continuityDelta: deltaM ? unescapeJsonFragment(deltaM[1]) : undefined,
  };
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

function payloadFromObject(json: Record<string, unknown>): ParsedTurnPayload | null {
  const blocks = normalizeBlocks(json.blocks);
  const options = normalizeOptions(json.options);
  if (!blocks.length && !options.length) return null;
  const delta = json.continuityDelta ? String(json.continuityDelta).trim() : '';
  return {
    title: String(json.title || '本回合'),
    timeLabel: json.timeLabel ? String(json.timeLabel) : undefined,
    phase: json.phase ? String(json.phase) : undefined,
    blocks: blocks.length
      ? blocks
      : [{ type: 'system', text: '（本章无正文块，请重试）' }],
    options,
    summary: String(
      json.summary ||
        blocks
          .map((b) => b.text)
          .join(' ')
          .slice(0, 120),
    ),
    continuityDelta: delta || undefined,
  };
}

/** Fallback: 真正的纯文本回复（非 JSON） */
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

  const obj = tryParseJsonObject(cleaned);
  if (obj) {
    const payload = payloadFromObject(obj);
    if (payload) return payload;
  }

  const salvaged = salvageBrokenJson(cleaned);
  if (salvaged && (salvaged.blocks.some((b) => b.type !== 'system') || salvaged.options.length)) {
    return salvaged;
  }

  // 疑似 JSON 却救不回来：禁止把 raw 当小说展示
  if (looksLikeJsonBlob(cleaned)) {
    throw new TurnParseError(
      '模型未按约定格式返回，章节无法解析。请点「重试上次生成」，无需重写行动。',
      raw,
    );
  }

  return parseFreeText(raw);
}

export function toTurn(payload: ParsedTurnPayload, index: number): Turn {
  return {
    id: crypto.randomUUID(),
    index,
    title: payload.title,
    timeLabel: payload.timeLabel,
    phase: payload.phase,
    blocks: payload.blocks,
    options: payload.options,
    summary: payload.summary,
    continuityDelta: payload.continuityDelta,
    createdAt: Date.now(),
  };
}

/** 合并连贯笔记；refresh=true 时整段替换为 delta */
export function mergeContinuityNotes(
  prev: string | undefined,
  delta: string | undefined,
  turnIndex: number,
  refresh = false,
): string {
  const d = (delta || '').trim();
  if (!d) return prev || '';
  if (refresh) {
    return `【局势总览 · 第${turnIndex}回刷新】\n${d}`.slice(0, 2800);
  }
  const entry = `· 第${turnIndex}回：${d}`;
  let next = prev?.trim() ? `${prev.trim()}\n${entry}` : entry;
  if (next.length > 2800) {
    next = next.slice(next.length - 2800);
    const cut = next.indexOf('\n');
    if (cut > 0 && cut < 80) next = next.slice(cut + 1);
  }
  return next;
}
