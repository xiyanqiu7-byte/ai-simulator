import type { ApiSettings, SaveGame, Turn } from '../types';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
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
  "summary": "两句以内的剧情摘要，供后续回合回忆，勿剧透隐藏设定"
}

规则：
- blocks 按阅读顺序排列，可多段；手机界面必须用 type=plaintext。
- 必须提供至少 3 个 options（A/B/C，建议含 D）。
- 严格遵守模拟器原文的语言、视角、禁止项与格式要求。
- 不要显示隐藏数值；不要上帝视角心理活动（除非模拟器允许）。
`.trim();

function compressRules(rules: string, max = 12000): string {
  if (rules.length <= max) return rules;
  return (
    rules.slice(0, max) +
    '\n\n…（规则过长已截断，请仍遵守前文核心玩法与手机格式）'
  );
}

function buildHistory(save: SaveGame): string {
  const turns = save.turns;
  if (!turns.length) return '（尚无回合）';

  const recentCount = 2;
  const recent = turns.slice(-recentCount);
  const older = turns.slice(0, Math.max(0, turns.length - recentCount));

  const olderText = older.length
    ? older.map((t) => `第${t.index}回合摘要：${t.summary}`).join('\n')
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

  return `更早回合摘要：\n${olderText}\n\n最近回合全文：\n${recentText}`;
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

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: settings.temperature,
        messages,
      }),
    });
  } catch {
    throw new ApiError('网络请求失败，请检查 Base URL 或跨域设置');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ApiError(`API 错误 ${res.status}：${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new ApiError('模型返回为空');
  return content;
}

export async function generatePrologue(
  settings: ApiSettings,
  save: SaveGame,
): Promise<string> {
  const system = `${compressRules(save.packRules)}\n\n${OUTPUT_SCHEMA}`;
  const user = `玩家已填写初始设定如下：\n${save.characterNotes}\n\n请生成「前置剧情 / 第一回合开场」（相遇或关系建立），phase 设为「前置剧情」。待玩家确认后才会进入正式回合。选项可以是确认进入游戏、微调设定相关的轻量选择。`;
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
  const system = `${compressRules(save.packRules)}\n\n${OUTPUT_SCHEMA}`;
  const user = `【角色写入】\n${save.characterNotes}\n\n【历史】\n${buildHistory(save)}\n\n【本回合指令】\n${instruction}\n\n请推进下一回合，并给出选项。`;
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
  const system = `${compressRules(save.packRules)}\n\n${OUTPUT_SCHEMA}`;
  const user = `当前回合内容如下，请保持叙事不变，只重新生成更好玩的 options（A-D），blocks 可原样返回或微调：\n标题：${turn.title}\n${body}\n\n角色写入：\n${save.characterNotes}`;
  return chat(settings, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
}
