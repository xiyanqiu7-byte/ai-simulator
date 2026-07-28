import type { ApiSettings, PlayerPrefs, SaveGame, Turn } from '../types';
import { FOCUS_OPTIONS, PACE_OPTIONS } from '../types';
import { loadPlayerPrefs } from './storage';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const IMMERSION_RULES = `
【阅读器·沉浸主控】
- 默认沉浸式主控：以玩家可感知、可行动的视角推进，强化「我在场」的反馈。
- 少旁观腔、少上帝视角代操玩家；选项应是玩家能立刻采取的行动或对话。
`.trim();

function buildPrefsBlock(prefs: PlayerPrefs): string {
  const pace =
    PACE_OPTIONS.find((p) => p.id === prefs.pace) ?? PACE_OPTIONS[1];
  const focusLabels = prefs.focus
    .map((id) => FOCUS_OPTIONS.find((f) => f.id === id)?.label)
    .filter(Boolean) as string[];

  const focusLine = focusLabels.length
    ? `描写侧重（笔墨倾斜，可叠加）：${focusLabels.join('、')}。未点名的侧面可弱写，但不要完全空洞。`
    : '描写侧重：未勾选，跟规则与剧情需要均衡分配笔墨。';

  return `
【玩家阅读偏好·软约束】
优先级：模拟器规则禁止项 > 下列偏好 > 默认文风。
推进偏好：${pace.label}——${pace.hint}
${focusLine}
以上为侧重点提示，不能用来灌水复读；仍须遵守字数、反重复与规则硬性要求。
`.trim();
}

const OUTPUT_SCHEMA = `
你必须只输出一个 JSON 对象（不要 Markdown 说明，不要代码围栏外的闲聊），结构如下：
{
  "title": "本回合短标题",
  "timeLabel": "例如 2025年3月12日 周三 22:40",
  "phase": "前置剧情|自由行动|随机事件|手机|重大决策",
  "blocks": [
    { "type": "narrative", "text": "小说式叙事段落" },
    { "type": "dialogue", "speaker": "角色名", "text": "口语对话" },
    { "type": "system", "text": "系统提示/状态栏文字" },
    { "type": "plaintext", "title": "手机主页", "text": "严格按模拟器要求的伪界面纯文本，可含换行" }
  ],
  "options": [
    { "key": "A", "text": "选项内容（仅行动/对话，不剧透数值）" },
    { "key": "B", "text": "..." },
    { "key": "C", "text": "..." },
    { "key": "D", "text": "..." }
  ],
  "summary": "本回「新发生」的事件清单，用分号分隔 3～6 个短句；只写增量，勿复述旧情节",
  "continuityDelta": "本回对人设/关系/地点/未竟冲突的更新，2～6 条短句；无更新可写空字符串"
}

规则：
- 只输出一个 JSON 对象，不要 Markdown 说明，不要代码围栏外的闲聊。
- JSON 字符串内的引号必须转义为 \\"，换行用 \\n；禁止输出尾逗号。
- blocks 按阅读顺序排列，可多段；手机界面必须用 type=plaintext。
- 必须提供至少 3 个 options（A/B/C，建议含 D）。
- 严格遵守模拟器原文的语言、视角、禁止项与格式要求。
- 不要显示隐藏数值；不要上帝视角心理活动（除非模拟器允许）。
- 【章节长度·硬性】凡「正式剧情回合」（含前置剧情、自由行动、随机事件、手机互动、重大决策等叙事推进）：blocks 内全部可读正文合计必须达到 2000～3000 汉字（约 2k～3k 字）。禁止水字数复读；用场景、对话、细节、手机界面推进写满。少于 2000 字视为不合格，须自行加长后再输出。
- 【长度豁免】仅当本回合是开局仪式短步骤（欢迎语、选语言、提示「开始游戏」、空设定面板等、无实质剧情）时，可不遵守上述字数；一旦进入正式叙事，立即恢复 2k～3k 要求。
- 【反重复·硬性】禁止复读上一回合已写过的对话、告白、冲突拉扯；禁止堆砌空转情绪与万能霸总套话（如反复「你是我的」「听话」「小东西」而无新信息）。本回合至少一半篇幅必须是新信息、新行动、关系实质变化或场景推进。
- 【连贯】必须参考「连贯笔记」与更早摘要中的已发生事件：只写后果与延伸，不可重演同一桥段。continuityDelta 只记本回真正变化的设定。
`.trim();

function compressRules(rules: string, max = 12000): string {
  if (rules.length <= max) return rules;
  return (
    rules.slice(0, max) +
    '\n\n…（规则过长已截断，请仍遵守前文核心玩法与手机格式）'
  );
}

function buildSystemPrompt(packRules: string): string {
  const prefs = loadPlayerPrefs();
  return [
    compressRules(packRules),
    IMMERSION_RULES,
    buildPrefsBlock(prefs),
    OUTPUT_SCHEMA,
  ].join('\n\n');
}

function buildHistory(save: SaveGame): string {
  const turns = save.turns;
  if (!turns.length) return '（尚无回合）';

  const recentCount = 1;
  const recent = turns.slice(-recentCount);
  const older = turns.slice(0, Math.max(0, turns.length - recentCount));

  const olderText = older.length
    ? older
        .map((t) => `第${t.index}回《${t.title}》：${t.summary || '（无摘要）'}`)
        .join('\n')
    : '（无更早摘要）';

  const recentText = recent
    .map((t) => {
      const body = t.blocks
        .map((b) => {
          if (b.type === 'dialogue') return `${b.speaker}：${b.text}`;
          if (b.type === 'plaintext') return `[手机界面]\n${b.text}`;
          return b.text;
        })
        .join('\n');
      const choice = t.playerChoice
        ? `\n玩家选择：${t.playerChoice.label}`
        : '';
      return `【第${t.index}回合 · ${t.title}】\n时间：${t.timeLabel || '未知'}\n${body}${choice}`;
    })
    .join('\n\n');

  const continuity = save.continuityNotes?.trim()
    ? `【连贯笔记·关系与设定演化】\n${save.continuityNotes.trim()}\n\n`
    : '';

  return `${continuity}【已发生事件摘要·禁止重演】\n${olderText}\n\n【上一章全文·禁止复读其中对话与桥段】\n${recentText || '（尚无上一章）'}`;
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
  withJsonFormat: boolean,
) {
  const payload: Record<string, unknown> = {
    model: settings.model,
    temperature: settings.temperature,
    messages,
  };
  if (withJsonFormat) {
    payload.response_format = { type: 'json_object' };
  }
  return JSON.stringify(payload);
}

async function sleep(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms));
}

async function chat(
  settings: ApiSettings,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new ApiError('请先在设定页填写 API Key');
  }
  const base = settings.baseUrl.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;

  let useJsonFormat = jsonModeEnabled();
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
        body: buildChatBody(settings, messages, useJsonFormat),
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
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new ApiError('模型返回为空');
    return content;
  }

  throw lastError ?? new ApiError('生成失败');
}

export async function generatePrologue(
  settings: ApiSettings,
  save: SaveGame,
): Promise<string> {
  const system = buildSystemPrompt(save.packRules);
  const user = `玩家已填写初始设定如下：\n${save.characterNotes}\n\n请生成「前置剧情 / 第一回合开场」（相遇或关系建立），phase 设为「前置剧情」。待玩家确认后才会进入正式回合。选项可以是确认进入游戏、微调设定相关的轻量选择。\n本回合为正式叙事：blocks 正文合计须 2000～3000 字。`;
  return chat(settings, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
}

/** AI-guided onboarding: welcome / language / 开始游戏 / settings panel */
export async function generateOpening(
  settings: ApiSettings,
  save: SaveGame,
): Promise<string> {
  const system = buildSystemPrompt(save.packRules);
  const notes = save.characterNotes?.trim()
    ? `玩家可选备注：\n${save.characterNotes}\n\n`
    : '';
  const user = `${notes}本模拟器由 AI 引导开局。请严格按规则原文的开局顺序执行第一步（如欢迎语、语言选择、提示输入「开始游戏」、设定面板等）。
phase 设为「开局引导」。
玩家尚未填写完整人设时，不要编造姓名/角色等完整设定；用选项或提示引导玩家下一步输入。
必须提供 options（如语言选择、或「开始游戏」）。
本步若仅为开局仪式短步骤，可短写；不要为凑字数灌水。`;
  return chat(settings, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
}

export async function generateTurn(
  settings: ApiSettings,
  save: SaveGame,
  instruction: string,
): Promise<string> {
  const system = buildSystemPrompt(save.packRules);
  const notes = save.characterNotes?.trim() || '（尚未填写完整角色写入）';
  const nextIndex =
    save.turns.length === 0 ? 1 : save.turns[save.turns.length - 1].index + 1;
  const refreshContinuity =
    save.turns.length > 0 && save.turns.length % 5 === 0;
  const refreshHint = refreshContinuity
    ? `\n【连贯刷新·第${nextIndex}回】continuityDelta 请输出当前局势总览（关系、双方认知、地点、未竟冲突、人设新侧面，8 条以内短句），将用于覆盖式更新连贯笔记。`
    : '';
  const user = `【角色写入】\n${notes}\n\n【历史】\n${buildHistory(save)}\n\n【本回合指令】\n${instruction}\n\n请推进下一回合，并给出选项。\n硬性要求：本回合 blocks 可读正文合计 2000～3000 汉字；必须实质推进剧情，禁止废话复读与空转霸总套话；summary 只写本回新事件；填写 continuityDelta。${refreshHint}`;
  return chat(settings, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
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
  const system = buildSystemPrompt(save.packRules);
  const user = `当前回合内容如下，请保持叙事不变，只重新生成更好玩的 options（A-D），blocks 可原样返回或微调（勿擅自大幅删减正文）：\n标题：${turn.title}\n${body}\n\n角色写入：\n${save.characterNotes}`;
  return chat(settings, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
}
