import type { ApiSettings, PlayerPrefs, SaveGame, Turn } from '../types';
import { FOCUS_OPTIONS, PACE_OPTIONS } from '../types';
import { loadPlayerPrefs } from './storage';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 最近一次 chat 耗时（控制台 + UI 排查用） */
export interface ChatTiming {
  label: string;
  model: string;
  promptChars: number;
  responseChars: number;
  durationMs: number;
  attempts: number;
  jsonMode: boolean;
  mode: 'stream' | 'json';
  ttftMs?: number;
}

let lastChatTiming: ChatTiming | null = null;

export function getLastChatTiming(): ChatTiming | null {
  return lastChatTiming;
}

export function formatChatTiming(t: ChatTiming): string {
  const sec = (t.durationMs / 1000).toFixed(1);
  const ttft =
    t.ttftMs != null ? ` · 首字${(t.ttftMs / 1000).toFixed(1)}s` : '';
  return `${t.label} ${sec}s${ttft} · 入${t.promptChars}字 · 出${t.responseChars}字 · ${t.mode} · ${t.model}`;
}

const STREAM_KEY = 'simreader.stream';

/** 会话内可关掉流式：控制台 sessionStorage.setItem('simreader.stream','0') */
export function streamEnabled(): boolean {
  try {
    return sessionStorage.getItem(STREAM_KEY) !== '0';
  } catch {
    return true;
  }
}

export function disableStream() {
  try {
    sessionStorage.setItem(STREAM_KEY, '0');
  } catch {
    /* ignore */
  }
}

export function enableStream() {
  try {
    sessionStorage.removeItem(STREAM_KEY);
  } catch {
    /* ignore */
  }
}

const PRIORITY_RULES = `
【优先级】模拟器规则中的核心玩法与「每回合展示格式」> 阅读器输出壳 > 其它提示。
若阅读器示例与原文冲突，以原文为准。
篇幅与版式跟模拟器规则；规则未规定篇幅时，自然书写即可，勿为凑字灌水。
`.trim();

const DIGEST_MAX = 1800;
const DIGEST_TARGET = '900～1600';

function buildPrefsBlock(prefs: PlayerPrefs): string | null {
  const hasCustomPace = prefs.pace !== 'balanced';
  const hasFocus = prefs.focus.length > 0;
  if (!hasCustomPace && !hasFocus) return null;

  const pace =
    PACE_OPTIONS.find((p) => p.id === prefs.pace) ?? PACE_OPTIONS[1];
  const focusLabels = prefs.focus
    .map((id) => FOCUS_OPTIONS.find((f) => f.id === id)?.label)
    .filter(Boolean) as string[];

  const focusLine = focusLabels.length
    ? `描写侧重（笔墨倾斜）：${focusLabels.join('、')}。`
    : '';

  return `
【玩家阅读偏好·最低优先级】
低于模拟器原文的玩法与每回合展示格式；冲突时忽略本段。
推进偏好：${pace.label}——${pace.hint}
${focusLine}
`.trim();
}

/** 降级路径：整章 JSON（薄壳） */
const OUTPUT_SCHEMA_JSON = `
你必须只输出一个 JSON 对象（不要 Markdown 说明，不要代码围栏外的闲聊），结构如下：
{
  "title": "本回合短标题",
  "blocks": [
    { "type": "narrative", "text": "正文，可用 Markdown（标题/分割线/引用/加粗等）；按模拟器规则写展示与叙事" },
    { "type": "dialogue", "speaker": "角色名", "text": "口语对话" },
    { "type": "plaintext", "title": "手机主页", "text": "伪界面纯文本，可含换行" }
  ],
  "options": [
    { "key": "A", "text": "选项（须符合规则；自由行动阶段按规则提供【手机】等入口）" },
    { "key": "B", "text": "..." },
    { "key": "C", "text": "..." },
    { "key": "D", "text": "..." }
  ],
  "summary": "本回新事件 3～6 短句；须点名仍关键的道具/物品/场景陈设",
  "continuityDelta": "关系/地点/未竟冲突/随身或在场道具与场景物件的更新，可空字符串"
}

规则：
- 只输出一个 JSON；字符串内引号转义为 \\"，换行用 \\n。
- 玩法与展示格式以模拟器规则为准；正文可用 Markdown。
- options 至少 3 个；勿剧透隐藏数值。
- 必须承接历史中已确立的道具、场景与冲突，禁止无故改写或消失。
`.trim();

/** 主路径：自由正文流式 + 章末 META */
const OUTPUT_SCHEMA_STREAM = `
你必须按「双段协议」输出（便于边生成边阅读），不要输出整章纯 JSON。

【第一段·正文】立刻开始写可读正文。
- 鼓励 Markdown 排版（与常见对话框一致）：可用 ## 小标题、--- 分割线、> 引用、**加粗**、列表等；灵活即可，不必每段都套模板。
- 若规则要求每回合展示日期/天气/地点/推送：写在正文靠前位置（可用加粗或短行），再接叙事。
- 块标记可选：手机伪界面建议 <<<P:标题>>>；对话可用 <<<D:角色名>>>；一般叙事不必打 <<<N>>>。
- 禁止在第一段输出大段 JSON。
- 【记忆】必须承接「连贯笔记」与摘要里已出现的道具、场景陈设、人物位置；禁止下一章无故换背景或弄丢道具。

【第二段·META】正文结束后另起一行，输出且仅输出一次：
<<<META>>>
{"title":"短标题","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"summary":"本回新事件；点名关键道具/场景","continuityDelta":"关系/地点/冲突/道具与场景物件更新"}

META 规则：
- <<<META>>> 之后只有一个 JSON。
- options 至少 3 个；须符合模拟器规则。
- summary / continuityDelta 要记下道具与场景，供下回合防失忆。
`.trim();

/** 无 API 或精炼失败时的本地兜底精简卡 */
export function localRulesDigest(raw: string, max = DIGEST_MAX): string {
  const text = (raw || '').trim();
  if (!text) return '【规则精简卡】（原文为空）';

  const lines = text.split(/\r?\n/);
  const priority = lines.filter((l) =>
    /禁止|不可|不得|必须|视角|人称|格式|手机|选项|硬性|玩法|阶段|开局|数值|隐藏|展示|日期|天气|行动点|推送|星期|WhatsApp|Instagram|Telegram/.test(
      l,
    ),
  );
  const head = text.slice(0, 900);
  const body = [head, ...priority].join('\n').slice(0, max);
  return `【规则精简卡·本地兜底】\n${body}${text.length > max ? '\n…（已截断）' : ''}`;
}

function stripDigestFences(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '');
  }
  return s.trim();
}

/** 开局时一次性精炼规则卡；成功后应缓存到 pack / save */
export async function distillRules(
  settings: ApiSettings,
  rawRules: string,
): Promise<string> {
  const source = rawRules.trim();
  if (!source) return localRulesDigest('');

  // 过短原文直接当精简卡，省一次请求
  if (source.length <= DIGEST_MAX) {
    return `【规则精简卡】\n${source}`;
  }

  const system = `你是模拟器规则压缩器。把冗长玩法原文压成「规则精简卡」，供后续每回合生成剧情使用。
只输出精简卡正文，不要 JSON，不要代码围栏，不要前言后语。
目标长度约 ${DIGEST_TARGET} 汉字（上限约 ${DIGEST_MAX} 字）。

【必须原样保留要点——删示例文可以，删这些不行】
1. 时间单位与行动点（如「周」、每周几点行动等）
2. 每回合必显内容：日期格式、天气/时段、手机推送摘要，以及原文给出的展示版式/顺序
3. 【手机】入口、手机主页与各 App 流程
4. 玩家可选行动类型（主动行动 / 用手机 / 等待等）
5. 人称/视角、禁止项、隐藏数值、开局流程、胜负相关硬设定

删掉：重复示范长文、无关闲聊、可推断的修辞堆砌。
冲突时优先保留「每回合展示格式」「禁止 / 必须」。`;

  const user = `请压缩下列模拟器原文：\n\n${source.slice(0, 28000)}`;

  const distillSettings: ApiSettings = {
    ...settings,
    temperature: Math.min(settings.temperature, 0.35),
  };

  const raw = await chat(
    distillSettings,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { jsonMode: false, label: '精炼规则' },
  );
  let digest = stripDigestFences(raw);
  if (digest.length < 80) {
    throw new ApiError('规则精炼结果过短，请重试');
  }
  if (digest.length > DIGEST_MAX + 400) {
    digest = digest.slice(0, DIGEST_MAX + 400) + '\n…（精简卡已截断）';
  }
  if (!digest.includes('规则精简')) {
    digest = `【规则精简卡】\n${digest}`;
  }
  return digest;
}

/**
 * 确保存档有精简卡：优先 save → pack 缓存 → AI 精炼 → 本地兜底。
 * 返回 { digest, fromCache, usedLocalFallback }
 */
export async function ensureRulesDigest(
  settings: ApiSettings,
  save: SaveGame,
  packDigest?: string,
): Promise<{ digest: string; fromCache: boolean; usedLocalFallback: boolean }> {
  const existing = save.rulesDigest?.trim() || packDigest?.trim();
  if (existing) {
    return { digest: existing, fromCache: true, usedLocalFallback: false };
  }
  try {
    const digest = await distillRules(settings, save.packRules);
    return { digest, fromCache: false, usedLocalFallback: false };
  } catch {
    return {
      digest: localRulesDigest(save.packRules),
      fromCache: false,
      usedLocalFallback: true,
    };
  }
}

/** 强制重新精炼（忽略缓存），失败则抛错 */
export async function redistillRulesDigest(
  settings: ApiSettings,
  rawRules: string,
): Promise<string> {
  return distillRules(settings, rawRules);
}

function effectiveRulesCard(save: SaveGame): string {
  const card = save.rulesDigest?.trim();
  if (card) return card;
  return localRulesDigest(save.packRules);
}

function buildSystemPrompt(
  save: SaveGame,
  format: 'stream' | 'json' = 'stream',
): string {
  const prefs = loadPlayerPrefs();
  const prefsBlock = buildPrefsBlock(prefs);
  return [
    PRIORITY_RULES,
    effectiveRulesCard(save),
    prefsBlock,
    format === 'stream' ? OUTPUT_SCHEMA_STREAM : OUTPUT_SCHEMA_JSON,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** 更早摘要 + 连贯笔记 + 上一章全文（补上「同对话框」缺的连续上下文） */
function formatTurnBody(t: SaveGame['turns'][number]): string {
  return t.blocks
    .map((b) => {
      if (b.type === 'dialogue') return `${b.speaker}：${b.text}`;
      if (b.type === 'plaintext') {
        return b.title ? `【${b.title}】\n${b.text}` : b.text;
      }
      return b.text;
    })
    .join('\n\n');
}

function buildHistory(save: SaveGame): string {
  const turns = save.turns;
  const continuity = save.continuityNotes?.trim()
    ? `【连贯笔记·关系/场景/道具】\n${save.continuityNotes.trim()}\n\n`
    : '';

  if (!turns.length) {
    return `${continuity}【已发生事件摘要】\n（尚无回合）`;
  }

  const older = turns.slice(0, -1);
  const last = turns[turns.length - 1];
  const olderText = older.length
    ? older
        .map((t) => {
          const choice = t.playerChoice
            ? ` → 玩家：${t.playerChoice.label}`
            : '';
          return `第${t.index}回《${t.title}》：${t.summary || '（无摘要）'}${choice}`;
        })
        .join('\n')
    : '（无更早摘要）';

  const lastChoice = last.playerChoice
    ? `\n玩家选择：${last.playerChoice.label}`
    : '';
  let lastBody = formatTurnBody(last);
  const LAST_BODY_MAX = 8000;
  if (lastBody.length > LAST_BODY_MAX) {
    lastBody =
      lastBody.slice(0, LAST_BODY_MAX) +
      '\n…（上一章过长已截断尾部，请仍承接前文道具与场景）';
  }

  return `${continuity}【更早事件摘要】\n${olderText}\n\n【上一章全文·须承接道具/场景/对话，禁止无故改背景】\n【第${last.index}回 · ${last.title}】\n${lastBody}${lastChoice}`;
}

function rulesReinforceBlock(save: SaveGame, nextIndex: number): string {
  // 第 5、10、15… 回防跑偏：重申精简卡
  if (nextIndex < 5 || nextIndex % 5 !== 0) return '';
  const card = effectiveRulesCard(save);
  return `\n\n【防跑偏·第${nextIndex}回】若已偏离规则中的每回合展示格式、手机入口或核心玩法，请拉回。下列精简卡供对照：\n${card}\n`;
}

const JSON_MODE_KEY = 'simreader.jsonMode';

function jsonModeEnabled(): boolean {
  try {
    return sessionStorage.getItem(JSON_MODE_KEY) !== '0';
  } catch {
    return true;
  }
}

function disableJsonMode() {
  try {
    sessionStorage.setItem(JSON_MODE_KEY, '0');
  } catch {
    /* ignore */
  }
}

function buildChatBody(
  settings: ApiSettings,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { withJsonFormat: boolean; stream?: boolean },
) {
  const payload: Record<string, unknown> = {
    model: settings.model,
    temperature: settings.temperature,
    messages,
  };
  if (opts.stream) {
    payload.stream = true;
  }
  if (opts.withJsonFormat) {
    payload.response_format = { type: 'json_object' };
  }
  return JSON.stringify(payload);
}

const META_MARKER = '<<<META>>>';

/** 若正文末尾正在打出 META 标记的前缀，先藏起来避免闪一下 */
function stripPartialMetaSuffix(text: string): string {
  const m = META_MARKER;
  for (let len = Math.min(m.length - 1, text.length); len >= 1; len--) {
    if (text.endsWith(m.slice(0, len))) {
      return text.slice(0, text.length - len);
    }
  }
  return text;
}

async function sleep(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms));
}

async function chat(
  settings: ApiSettings,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { jsonMode?: boolean; label?: string },
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new ApiError('请先在设定页填写 API Key');
  }
  const base = settings.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const label = opts?.label ?? 'chat';
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  const t0 = performance.now();

  const allowJson = opts?.jsonMode !== false;
  let useJsonFormat = allowJson && jsonModeEnabled();
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: buildChatBody(settings, messages, {
          withJsonFormat: useJsonFormat,
        }),
        keepalive: true,
      });
    } catch {
      lastError = new ApiError(
        attempt < maxAttempts
          ? `网络中断，正在重试（${attempt}/${maxAttempts}）…`
          : '网络请求失败（可能因锁屏或切到其他应用）。请保持本页在前台，或点重试。',
      );
      if (attempt < maxAttempts) {
        await sleep(800 * attempt);
        continue;
      }
      throw lastError;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // 中转站不支持 json_object：关掉后立刻无格式重试一次（仅此情况多一轮）
      if (
        useJsonFormat &&
        /response_format|json_object|JSON mode|not supported/i.test(errText)
      ) {
        disableJsonMode();
        useJsonFormat = false;
        attempt -= 1;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new ApiError(
          `API 错误 ${res.status}：${errText.slice(0, 160)}`,
        );
        if (attempt < maxAttempts) {
          await sleep(1000 * attempt);
          continue;
        }
        throw lastError;
      }
      throw new ApiError(`API 错误 ${res.status}：${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new ApiError('模型返回为空');

    const durationMs = Math.round(performance.now() - t0);
    lastChatTiming = {
      label,
      model: settings.model,
      promptChars,
      responseChars: content.length,
      durationMs,
      attempts: attempt,
      jsonMode: useJsonFormat,
      mode: 'json',
    };
    console.info('[simreader]', formatChatTiming(lastChatTiming), {
      ...lastChatTiming,
      usage: data.usage ?? null,
      baseUrl: base,
    });
    return content;
  }

  throw lastError ?? new ApiError('生成失败');
}

export type StreamHandlers = {
  onProse?: (prose: string) => void;
};

async function chatStream(
  settings: ApiSettings,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { label?: string; onProse?: (prose: string) => void },
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new ApiError('请先在设定页填写 API Key');
  }
  const base = settings.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const label = opts?.label ?? 'stream';
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  const t0 = performance.now();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: buildChatBody(settings, messages, {
        withJsonFormat: false,
        stream: true,
      }),
      keepalive: true,
    });
  } catch {
    throw new ApiError(
      '网络请求失败（可能因锁屏或切到其他应用）。请保持本页在前台，或点重试。',
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ApiError(`流式 API 错误 ${res.status}：${errText.slice(0, 200)}`);
  }
  if (!res.body) {
    throw new ApiError('流式响应无 body，将降级');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let lineBuf = '';
  let full = '';
  let proseEmitted = '';
  let inMeta = false;
  let ttftMs: number | undefined;

  const emitProse = (prose: string) => {
    if (prose.length <= proseEmitted.length) return;
    proseEmitted = prose;
    opts?.onProse?.(prose);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += decoder.decode(value, { stream: true });
    const parts = lineBuf.split('\n');
    lineBuf = parts.pop() ?? '';

    for (const rawLine of parts) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let delta = '';
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        delta = json.choices?.[0]?.delta?.content ?? '';
      } catch {
        continue;
      }
      if (!delta) continue;
      if (ttftMs == null) ttftMs = Math.round(performance.now() - t0);
      full += delta;

      if (!inMeta) {
        const metaAt = full.indexOf(META_MARKER);
        if (metaAt >= 0) {
          inMeta = true;
          emitProse(full.slice(0, metaAt));
        } else {
          emitProse(stripPartialMetaSuffix(full));
        }
      }
    }
  }

  if (!full.trim()) {
    throw new ApiError('流式返回为空');
  }

  const durationMs = Math.round(performance.now() - t0);
  lastChatTiming = {
    label,
    model: settings.model,
    promptChars,
    responseChars: full.length,
    durationMs,
    attempts: 1,
    jsonMode: false,
    mode: 'stream',
    ttftMs,
  };
  console.info('[simreader]', formatChatTiming(lastChatTiming), {
    ...lastChatTiming,
    baseUrl: base,
  });
  return full;
}

async function chatPreferStream(
  settings: ApiSettings,
  messagesStream: { role: 'system' | 'user' | 'assistant'; content: string }[],
  messagesJson: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { label?: string; onProse?: (prose: string) => void },
): Promise<string> {
  if (streamEnabled()) {
    try {
      return await chatStream(settings, messagesStream, opts);
    } catch (e) {
      console.warn('[simreader] stream failed, fallback to json', e);
      disableStream();
      // 通知 UI 清空草稿并提示降级（空串约定）
      opts?.onProse?.('');
    }
  }
  return chat(settings, messagesJson, {
    label: `${opts?.label ?? 'chat'}·降级`,
    jsonMode: true,
  });
}

export async function generatePrologue(
  settings: ApiSettings,
  save: SaveGame,
  handlers?: StreamHandlers,
): Promise<string> {
  const user = `玩家已填写初始设定如下：\n${save.characterNotes}\n\n请按模拟器规则生成「前置剧情 / 第一回合开场」（相遇或关系建立）。待玩家确认后才会进入正式回合。选项可以是确认进入游戏、微调设定相关的轻量选择。\n请按双段协议输出（正文可自由散文 + <<<META>>>）。`;
  const userJson = `玩家已填写初始设定如下：\n${save.characterNotes}\n\n请按模拟器规则生成「前置剧情 / 第一回合开场」（相遇或关系建立）。待玩家确认后才会进入正式回合。选项可以是确认进入游戏、微调设定相关的轻量选择。\n请只输出一个 JSON 对象。`;
  return chatPreferStream(
    settings,
    [
      { role: 'system', content: buildSystemPrompt(save, 'stream') },
      { role: 'user', content: user },
    ],
    [
      { role: 'system', content: buildSystemPrompt(save, 'json') },
      { role: 'user', content: userJson },
    ],
    { label: '前置剧情', onProse: handlers?.onProse },
  );
}

/** AI-guided onboarding: welcome / language / 开始游戏 / settings panel */
export async function generateOpening(
  settings: ApiSettings,
  save: SaveGame,
  handlers?: StreamHandlers,
): Promise<string> {
  const notes = save.characterNotes?.trim()
    ? `玩家可选备注：\n${save.characterNotes}\n\n`
    : '';
  const user = `${notes}本模拟器由 AI 引导开局。请严格按模拟器规则中的开局顺序执行第一步（如欢迎语、语言选择、提示输入「开始游戏」、设定面板等）。
玩家尚未填写完整人设时，不要编造姓名/角色等完整设定；用选项或提示引导玩家下一步输入。
必须提供 options。本步若仅为开局仪式短步骤，可短写。请按双段协议输出。`;
  const userJson = `${notes}本模拟器由 AI 引导开局。请严格按模拟器规则中的开局顺序执行第一步（如欢迎语、语言选择、提示输入「开始游戏」、设定面板等）。
玩家尚未填写完整人设时，不要编造姓名/角色等完整设定；用选项或提示引导玩家下一步输入。
必须提供 options。本步若仅为开局仪式短步骤，可短写。请只输出一个 JSON 对象。`;
  return chatPreferStream(
    settings,
    [
      { role: 'system', content: buildSystemPrompt(save, 'stream') },
      { role: 'user', content: user },
    ],
    [
      { role: 'system', content: buildSystemPrompt(save, 'json') },
      { role: 'user', content: userJson },
    ],
    { label: '引导开局', onProse: handlers?.onProse },
  );
}

export async function generateTurn(
  settings: ApiSettings,
  save: SaveGame,
  instruction: string,
  handlers?: StreamHandlers,
): Promise<string> {
  const notes = save.characterNotes?.trim() || '（尚未填写完整角色写入）';
  const nextIndex =
    save.turns.length === 0 ? 1 : save.turns[save.turns.length - 1].index + 1;
  const refreshContinuity =
    save.turns.length > 0 && save.turns.length % 5 === 0;
  const refreshHint = refreshContinuity
    ? `\n【连贯刷新·第${nextIndex}回】continuityDelta 请输出当前局势总览（关系、双方认知、地点、未竟冲突、在场/随身道具与场景陈设，8 条以内短句），将用于覆盖式更新连贯笔记。`
    : '';
  const reinforce = rulesReinforceBlock(save, nextIndex);
  const baseUser = `【角色写入】\n${notes}\n\n【历史】\n${buildHistory(save)}\n${reinforce}\n【本回合指令】\n${instruction}\n\n请按模拟器规则推进下一回合并给出选项。正文可用 Markdown。须承接上一回道具与场景，禁止无故改背景。summary 与 continuityDelta 请记下本回相关道具/场景。${refreshHint}`;
  const userStream = `${baseUser}\n请按双段协议输出（正文可用 Markdown + <<<META>>>）。`;
  const userJson = `${baseUser}\n请只输出一个 JSON 对象。`;
  return chatPreferStream(
    settings,
    [
      { role: 'system', content: buildSystemPrompt(save, 'stream') },
      { role: 'user', content: userStream },
    ],
    [
      { role: 'system', content: buildSystemPrompt(save, 'json') },
      { role: 'user', content: userJson },
    ],
    { label: `第${nextIndex}回`, onProse: handlers?.onProse },
  );
}

export async function regenerateOptions(
  settings: ApiSettings,
  save: SaveGame,
  turn: Turn,
): Promise<string> {
  const body = turn.blocks
    .map((b) =>
      b.type === 'dialogue' ? `${b.speaker}：${b.text}` : b.text,
    )
    .join('\n');
  // 重生成选项走 JSON，短且稳
  const system = buildSystemPrompt(save, 'json');
  const user = `当前回合内容如下，请保持叙事不变，只重新生成更好玩的 options（A-D），blocks 可原样返回或微调（勿擅自大幅删减正文）：\n标题：${turn.title}\n${body}\n\n角色写入：\n${save.characterNotes}`;
  return chat(
    settings,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { label: '重生成选项' },
  );
}
