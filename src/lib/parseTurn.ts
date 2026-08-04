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

/** 从正文里捞 A/B/C/D（即使后面还有羁绊状态等） */
export function extractInlineOptions(text: string): TurnOption[] {
  const src = (text || '').replace(/\r\n/g, '\n');
  const options: TurnOption[] = [];
  const seen = new Set<string>();

  // 行首：A. / A、 / A： / **A.** / 选项A：
  const lineRe =
    /^(?:#{1,6}\s*)?(?:\*\*|__)?(?:选项\s*)?([A-Da-d])(?:\*\*|__)?\s*[\.．、:：\)）]\s*(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(src))) {
    const key = m[1].toUpperCase();
    let body = m[2].trim();
    // 去掉行尾加粗残留
    body = body.replace(/\*\*\s*$/, '').replace(/__\s*$/, '').trim();
    if (!body || seen.has(key)) continue;
    // 跳过太像标题/状态的行
    if (/^【/.test(body) && body.length < 8) continue;
    seen.add(key);
    options.push({ key, text: body });
  }

  if (options.length >= 2) return options;

  // 宽松：同一段里的 A. xxx B. xxx
  const looseRe =
    /(?:^|[\n\r])\s*(?:选项\s*)?([A-Da-d])[\.．、:：\)）]\s*([^\n]+)/g;
  seen.clear();
  options.length = 0;
  while ((m = looseRe.exec(src))) {
    const key = m[1].toUpperCase();
    const body = m[2].trim();
    if (!body || seen.has(key)) continue;
    seen.add(key);
    options.push({ key, text: body });
  }
  return options;
}

/** 去掉正文中的选项清单行，保留其后的羁绊状态等 */
function stripInlineOptionLines(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const filtered = lines.filter(
    (line) =>
      !/^\s*(?:#{1,6}\s*)?(?:\*\*|__)?(?:选项\s*)?[A-Da-d](?:\*\*|__)?\s*[\.．、:：\)）]/.test(
        line,
      ),
  );
  // 压缩选项块留下的多余空行
  return filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Fallback: 真正的纯文本回复（非 JSON） */
function parseFreeText(text: string): ParsedTurnPayload {
  const options = extractInlineOptions(text);
  let body = text;
  if (options.length) {
    body = stripInlineOptionLines(text);
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
    blocks: blocks.length ? blocks : [{ type: 'narrative', text: body.trim() || text.trim() }],
    options,
    summary: body.replace(/\s+/g, ' ').slice(0, 120),
  };
}

export const META_MARKER = '<<<META>>>';

/** 将双段协议的正文标记解析为 blocks（流式预览与最终入库共用） */
export function parseProseBlocks(prose: string): ContentBlock[] {
  const text = (prose || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return [];

  const re = /<<<([NDSP])(?::([^>\n]*))?>>>/g;
  const marks: { index: number; end: number; kind: string; arg: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    marks.push({
      index: m.index,
      end: m.index + m[0].length,
      kind: m[1],
      arg: (m[2] || '').trim(),
    });
  }

  if (!marks.length) {
    return [{ type: 'narrative', text: text.trim() }];
  }

  const blocks: ContentBlock[] = [];
  // 标记前的前言当作 narrative
  if (marks[0].index > 0) {
    const head = text.slice(0, marks[0].index).trim();
    if (head) blocks.push({ type: 'narrative', text: head });
  }

  for (let i = 0; i < marks.length; i++) {
    const cur = marks[i];
    const nextStart = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(cur.end, nextStart).replace(/^\n/, '').trimEnd();
    const content = body.trim();
    if (!content && cur.kind !== 'P') continue;

    if (cur.kind === 'D') {
      blocks.push({
        type: 'dialogue',
        speaker: cur.arg || '角色',
        text: content,
      });
    } else if (cur.kind === 'P') {
      blocks.push({
        type: 'plaintext',
        title: cur.arg || undefined,
        text: content,
      });
    } else if (cur.kind === 'S') {
      blocks.push({ type: 'system', text: content });
    } else {
      blocks.push({ type: 'narrative', text: content });
    }
  }

  return blocks.length ? blocks : [{ type: 'narrative', text: text.trim() }];
}

/**
 * 双段协议：正文(+块标记) + <<<META>>> + JSON
 * META 提供 title/options/summary 等；blocks 优先来自正文段。
 * 若 META 缺失或 options 为空，从正文 A/B/C/D 回填。
 */
export function parseStreamedTurn(raw: string): ParsedTurnPayload {
  const cleaned = raw.replace(/^\uFEFF/, '');
  const idx = cleaned.lastIndexOf(META_MARKER);

  if (idx < 0) {
    if (looksLikeJsonBlob(cleaned.trim())) {
      return ensureOptions(parseModelTurn(cleaned), cleaned);
    }
    const free = parseFreeText(cleaned);
    if (free.options.length || free.blocks.some((b) => b.text.trim())) {
      return free;
    }
    throw new TurnParseError(
      '无法解析本章正文与选项。请点「重试上次生成」。',
      raw,
    );
  }

  const prose = cleaned.slice(0, idx).trim();
  const metaRaw = stripFences(cleaned.slice(idx + META_MARKER.length).trim());
  const obj = tryParseJsonObject(metaRaw);

  let title = '本回合';
  let timeLabel: string | undefined;
  let phase: string | undefined;
  let summary = '';
  let continuityDelta: string | undefined;
  let options: TurnOption[] = [];
  let blocksFromMeta: ContentBlock[] = [];

  if (obj) {
    title = String(obj.title || '本回合');
    timeLabel = obj.timeLabel ? String(obj.timeLabel) : undefined;
    phase = obj.phase ? String(obj.phase) : undefined;
    summary = String(obj.summary || '');
    continuityDelta = obj.continuityDelta
      ? String(obj.continuityDelta).trim() || undefined
      : undefined;
    options = normalizeOptions(obj.options);
    blocksFromMeta = normalizeBlocks(obj.blocks);
  } else {
    const salvaged = salvageBrokenJson(metaRaw);
    if (salvaged) {
      title = salvaged.title;
      timeLabel = salvaged.timeLabel;
      phase = salvaged.phase;
      summary = salvaged.summary;
      continuityDelta = salvaged.continuityDelta;
      options = salvaged.options;
      blocksFromMeta = salvaged.blocks;
    }
  }

  // META 没给出选项时，从正文捞
  if (!options.length) {
    options = extractInlineOptions(prose);
  }
  if (!options.length) {
    options = extractInlineOptions(cleaned);
  }

  let proseForBlocks = prose;
  if (options.length && extractInlineOptions(prose).length) {
    proseForBlocks = stripInlineOptionLines(prose);
  }

  const blocksFromProse = parseProseBlocks(proseForBlocks);
  const fallbackBlock: ContentBlock = {
    type: 'system',
    text: '（本章无正文，请重试）',
  };
  const blocks: ContentBlock[] = blocksFromProse.length
    ? blocksFromProse
    : blocksFromMeta.length
      ? blocksFromMeta
      : [fallbackBlock];

  if (!options.length) {
    throw new TurnParseError(
      '未找到选项（META 与正文均无 A/B/C）。请点「重试上次生成」。',
      raw,
    );
  }

  return {
    title,
    timeLabel,
    phase,
    blocks,
    options,
    summary:
      summary ||
      blocks
        .map((b) => b.text)
        .join(' ')
        .slice(0, 120),
    continuityDelta,
  };
}

function ensureOptions(
  payload: ParsedTurnPayload,
  rawFallback: string,
): ParsedTurnPayload {
  if (payload.options.length) return payload;
  const fromText = extractInlineOptions(
    payload.blocks.map((b) => b.text).join('\n') + '\n' + rawFallback,
  );
  if (!fromText.length) return payload;
  return { ...payload, options: fromText };
}

/** 自动识别双段协议或旧 JSON */
export function parseAnyTurn(raw: string): ParsedTurnPayload {
  if (raw.includes(META_MARKER) || /<<<[NDSP](?::[^>]*)?>>>/.test(raw)) {
    return parseStreamedTurn(raw);
  }
  return ensureOptions(parseModelTurn(raw), raw);
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
