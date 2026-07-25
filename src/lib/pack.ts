import type { SimulatorPack } from '../types';

const FALLBACK_TEMPLATE = `姓名：
年龄：
身份：
特殊设定 / 要求：
`;

/** Phone / feed UI chrome — not player setup. */
const LABEL_DENY =
  /^(例子|格式|操作|操作提示|注意|禁止|系统|导航|推荐|正文|配图|评论区|时间|熱門|热门|探索|基本信息|帖子列表|输入框|對話|对话|動態|动态|公告|狀態|状态|簡介|简介|標題|标题|内容警告|发生了什么|有哪些有消息|添加图片|編寫說明|编写说明|最后一條|最後一條|訊息內容|消息内容|串文内容|帖子文字|用户昵称|用户名稱|聯絡人|联系人|群組名稱|群组名称|频道名称|发布身份|趋势|为你推荐|我的状态|经常联络|附加内容|搜索框|编辑框|點讚數|点赞数|留言數|转发数)$/i;

const SETUP_HEADER =
  /男角色|女角色|我的信息|我的資訊|玩家信息|固定男角色|明星父母|明星男友|玩家身份|初始设定|初始設定|请提供以下信息|請提供以下信息|请回答以下问题|关系风格|關係風格|情欲浓度|情慾濃度|角色设定|开局|感情基础|不能公开|禁忌原因|感情现状|与他如何相识|你最害怕什么|二选一|风格|濃度|浓度|级别|級別|选择我的身份|選擇我的身份|職業|职业（可选）/;

const CHOICE_TOPIC =
  /风格|風格|浓度|濃度|级别|級別|身份|职业|職業|感情|关系|關係|害怕|相识|相識|现状|現狀|选择|選擇|二选一|情欲|情慾|推荐人群|特點|特点/;

function stripMd(s: string): string {
  return s
    .replace(/^#+\s*/, '')
    .replace(/[*`>#【】\[\]]/g, '')
    .replace(/^[🌃⚠️🎬🎭👨👩💡🔥💋📊🎮📱🔒🎲🧭🕹]+/u, '')
    .trim();
}

function isPhoneOrUiRegion(line: string): boolean {
  return (
    /手机主[页頁]|手机系统|手機系統|WhatsApp|Instagram|KakaoTalk|Weverse|Telegram|Threads|plaintext|伪代码|偽代碼|【手机|【手機|匿名论坛模板|粉圈属性|事件后，系统会提供|每个事件后/.test(
      line,
    )
  );
}

function isRuleSectionBreak(line: string): boolean {
  return /^#{1,3}\s*(核心玩法|事件与|事件與|NPC|游戏指令|遊戲指令|游戏目标|遊戲目標|特殊规则|特殊規則|属性系统|屬性系統|随机事件|隨機事件|行动选项|行動選項|游戏启动|遊戲啟動)/.test(
    line,
  );
}

/** Blank fill line like `姓名：` or `角色姓名：________` */
function isBlankTitleLine(line: string): boolean {
  if (isChoiceLine(line)) return false;

  const cleaned = line.replace(/^[\s>*\-•·]+/, '').trim();
  if (!cleaned || cleaned.length > 60) return false;

  const m = cleaned.match(/^(.{1,36}?)[：:]\s*(.*)$/);
  if (!m) return false;

  const label = stripMd(m[1]);
  const after = m[2].trim();
  if (!label || LABEL_DENY.test(label)) return false;
  if (/[，。！？]/.test(label)) return false;
  if (/请|必須|必须|禁止|将会|將會|包括|例如/.test(label) && label.length > 10) {
    return false;
  }

  if (!after || /^[_…·.\s（）()请填写填空－-]+$/.test(after)) return true;
  return false;
}

function isTableHeaderRow(line: string): boolean {
  const t = line.trim();
  if (/\t/.test(t)) return true;
  return /^(风格|風格|特点|特點|推荐人群|级别|級別|描写程度|适用阶段)(\s|$)/.test(
    t,
  );
}

function isSetupHeaderLine(line: string): boolean {
  const t = stripMd(line);
  if (!t || t.length > 55) return false;
  if (isBlankTitleLine(line) || isChoiceLine(line)) return false;
  if (isTableHeaderRow(line)) return false;
  if (/[：:]\s*_{0,}\s*$/.test(t) && t.length < 20) return false;
  return SETUP_HEADER.test(t);
}

/**
 * Setup multiple-choice line: A-F or 1-9.
 * Skip in-game example options that appear mid-narrative later.
 */
export function isChoiceLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 140) return false;
  // A. xxx  or  1. xxx  (not 2025. or 30.)
  if (!/^([A-Fa-f]|[1-9])[\.．、]\s+\S/.test(t)) return false;
  // Skip obvious UI / system noise
  if (/操作提示|返回|点赞|轉發|转发|查看串文/.test(t)) return false;
  return true;
}

function formatChoiceLine(line: string): string {
  return line.trim().replace(/\t+/g, ' — ').replace(/\s{2,}/g, ' ');
}

function lookBackTitle(lines: string[], from: number): string {
  for (let j = from - 1; j >= Math.max(0, from - 8); j--) {
    const raw = lines[j];
    if (!raw.trim()) continue;
    if (isPhoneOrUiRegion(raw) || isRuleSectionBreak(raw)) break;
    if (isChoiceLine(raw)) break;
    const t = stripMd(raw);
    if (!t || t.length > 60) continue;
    if (isTableHeaderRow(raw)) continue;
    if (
      SETUP_HEADER.test(t) ||
      CHOICE_TOPIC.test(t) ||
      /（可选）|（可選）|请选|請選|二选一/.test(t) ||
      t.length < 36
    ) {
      return t;
    }
  }
  return '请选择一项';
}

/**
 * Find A/B/C/D（或 1/2/3）选择题块，全文扫描（不限文末）。
 */
function extractChoiceBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let inPhone = false;
  let inFence = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      i += 1;
      continue;
    }
    if (inFence) {
      i += 1;
      continue;
    }
    if (isPhoneOrUiRegion(line)) {
      inPhone = true;
      i += 1;
      continue;
    }
    if (inPhone) {
      if (/^#{1,3}\s/.test(line) && !isPhoneOrUiRegion(line)) inPhone = false;
      else {
        i += 1;
        continue;
      }
    }
    if (isRuleSectionBreak(line)) {
      i += 1;
      continue;
    }

    // In-game sample options after 行动选项示例 — skip rest of that area lightly
    if (/行动选项示例|行動選項示例|例如：/.test(line) && /选项|選項/.test(line)) {
      i += 1;
      continue;
    }

    if (isChoiceLine(line)) {
      const start = i;
      const opts: string[] = [];
      while (i < lines.length) {
        const L = lines[i];
        if (!L.trim()) {
          // allow one blank inside a choice list
          if (opts.length && i + 1 < lines.length && isChoiceLine(lines[i + 1])) {
            i += 1;
            continue;
          }
          break;
        }
        if (isChoiceLine(L)) {
          opts.push(formatChoiceLine(L));
          i += 1;
          continue;
        }
        break;
      }

      // Need at least 2 options to count as a real chooser
      if (opts.length >= 2) {
        const title = lookBackTitle(lines, start);
        // Skip mid-game ABCD samples (speaker dialogue options)
        const joined = opts.join(' ');
        if (
          !/愧疚|伪装|信任|欲望不变|数值/.test(joined) ||
          CHOICE_TOPIC.test(title) ||
          SETUP_HEADER.test(title)
        ) {
          // Prefer setup-looking titles; drop pure gameplay samples
          const looksSetup =
            CHOICE_TOPIC.test(title) ||
            SETUP_HEADER.test(title) ||
            /请提供|請提供|自定义|職業|职业|身份|风格|濃度|浓度|害怕|相识/.test(
              title,
            ) ||
            opts.every((o) => o.length < 50);

          if (looksSetup || CHOICE_TOPIC.test(title)) {
            blocks.push([
              `【请选择】${title}`,
              ...opts,
              '我的选择：',
            ]);
          }
        }
      }
      continue;
    }
    i += 1;
  }

  return blocks;
}

/**
 * Walk the doc for blank fill titles + section headers.
 */
function extractBlankChunks(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let inPhone = false;
  let inFence = false;
  let inSetupZone = false;
  let zoneIdle = 0;

  const flush = () => {
    const useful = cur.filter((l) => l.trim());
    if (useful.length >= 1) chunks.push([...cur]);
    cur = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (isPhoneOrUiRegion(line)) {
      inPhone = true;
      inSetupZone = false;
      flush();
      continue;
    }
    if (inPhone) {
      if (/^#{1,3}\s/.test(line) && !isPhoneOrUiRegion(line)) inPhone = false;
      else continue;
    }

    if (isRuleSectionBreak(line)) {
      inSetupZone = false;
      flush();
      continue;
    }

    const blank = isBlankTitleLine(line);
    const header = !blank && isSetupHeaderLine(line);

    if (blank) {
      inSetupZone = true;
      zoneIdle = 0;
      const cleaned = line.replace(/^[\s>*\-•·]+/, '').trim();
      const label = cleaned
        .split(/[：:]/)[0]
        .replace(/^[A-F][\.．、]\s*/, '');
      cur.push(`${stripMd(label)}：`);
      continue;
    }

    if (header) {
      inSetupZone = true;
      zoneIdle = 0;
      if (cur.length) flush();
      cur.push(stripMd(line));
      continue;
    }

    if (/现在开始游戏|現在開始遊戲|第一回合生成/.test(line)) {
      flush();
      inSetupZone = false;
      continue;
    }

    // Keep choice lines attached under blank/header zones (e.g. 职业： then A/B/C)
    if (inSetupZone && isChoiceLine(line)) {
      zoneIdle = 0;
      cur.push(formatChoiceLine(line));
      continue;
    }

    if (inSetupZone) {
      // table column header — skip but don't kill zone
      if (isTableHeaderRow(line)) {
        zoneIdle = 0;
        continue;
      }
      if (
        trimmed &&
        trimmed.length < 40 &&
        !/禁止|必须每回合|回合制|随机事件/.test(trimmed) &&
        zoneIdle < 1
      ) {
        cur.push(trimmed);
        zoneIdle = 0;
        continue;
      }
      if (!trimmed) {
        zoneIdle += 1;
        if (zoneIdle >= 3) {
          flush();
          inSetupZone = false;
        } else if (cur.length) {
          cur.push('');
        }
        continue;
      }
      zoneIdle += 1;
      if (zoneIdle >= 3) {
        flush();
        inSetupZone = false;
      }
    }
  }
  flush();
  return chunks;
}

function chunkKey(c: string[]): string {
  return c
    .filter((l) => l.trim())
    .map((l) => l.replace(/^【请选择】/, '').slice(0, 40))
    .join('|');
}

/**
 * Extract a single copyable fill template: blank fields + ABCD choice blocks.
 */
export function extractFillTemplate(md: string): string {
  const lines = md.split(/\r?\n/);
  const blankChunks = extractBlankChunks(lines);
  const choiceBlocks = extractChoiceBlocks(lines);

  // Keep blank chunks that have fill lines, or inline choices
  const blankUseful = blankChunks
    .filter(
      (c) =>
        c.some((l) => /：\s*$/.test(l.trim())) ||
        c.filter((l) => isChoiceLine(l)).length >= 2,
    )
    .map((c) => {
      const hasChoices = c.some((l) => isChoiceLine(l));
      const hasPickLine = c.some((l) => /我的选择|我的選擇/.test(l));
      if (hasChoices && !hasPickLine) {
        return [...c, '我的选择：'];
      }
      return c;
    });

  // Merge: blanks first (identity), then choice blocks not already covered
  const merged: string[][] = [...blankUseful];
  const seen = new Set(merged.map(chunkKey));

  for (const block of choiceBlocks) {
    const key = chunkKey(block);
    const opts = block.filter((l) => isChoiceLine(l));
    const already = blankUseful.some((c) => {
      const hit = opts.filter((o) =>
        c.some((l) => {
          const head = o.slice(0, 8);
          return l.includes(head) || l.includes(o.replace(/^[A-F1-9][\.．、]\s*/, '').slice(0, 6));
        }),
      ).length;
      return hit >= Math.min(2, opts.length);
    });
    if (already || seen.has(key)) continue;
    seen.add(key);
    merged.push(block);
  }

  let text = merged
    .map((c) => c.join('\n').replace(/\n{3,}/g, '\n\n').trim())
    .filter(Boolean)
    .join('\n\n');

  if (!text || (!/：/.test(text) && !/【请选择】/.test(text))) {
    return FALLBACK_TEMPLATE;
  }

  if (!/特殊设定|特殊設定|其他|补充|要求/.test(text)) {
    text += '\n\n特殊设定 / 要求：';
  }

  // Tip line at top when there are choices
  if (/【请选择】/.test(text) || merged.some((c) => c.some((l) => isChoiceLine(l)))) {
    text =
      '（含选择题：在「我的选择：」后写 A/B/C… 或选项原文）\n\n' + text;
  }

  return text.trim() + '\n';
}

export function inferPackTitle(md: string): string {
  const heading = md.match(/^#{1,3}\s*[^\n]*?([^\n]{2,40}模拟器)/m);
  if (heading) return heading[1].trim();
  const plain = md.match(/([^\n\r]{2,40}模拟器)/);
  if (plain) return plain[1].trim();
  return '未命名模拟器';
}

export function createPackFromMarkdown(md: string): SimulatorPack {
  const title = inferPackTitle(md);
  return {
    id: crypto.randomUUID(),
    title,
    rawRules: md.trim(),
    fillTemplate: extractFillTemplate(md),
    importedAt: Date.now(),
  };
}
