import type { SetupMode, SimulatorPack } from '../types';

const FALLBACK_TEMPLATE = `姓名：
年龄：
身份：
特殊设定 / 要求：
`;

const LABEL_DENY =
  /^(例子|格式|操作|操作提示|注意|禁止|系统|导航|推荐|正文|配图|评论区|时间|熱門|热门|探索|基本信息|帖子列表|输入框|對話|对话|動態|动态|公告|狀態|状态|簡介|简介|標題|标题|内容警告|发生了什么|有哪些有消息|添加图片|編寫說明|编写说明|最后一條|最後一條|訊息內容|消息内容|串文内容|帖子文字|用户昵称|用户名稱|聯絡人|联系人|群組名稱|群组名称|频道名称|发布身份|趋势|为你推荐|我的状态|经常联络|附加内容|搜索框|编辑框|點讚數|点赞数|留言數|转发数)$/i;

const SETUP_HEADER =
  /男角色|女角色|我的信息|我的資訊|玩家信息|固定男角色|明星父母|明星男友|玩家身份|初始设定|初始設定|请提供以下信息|請提供以下信息|请回答以下问题|关系风格|關係風格|情欲浓度|情慾濃度|角色设定|角色建立|开局|感情基础|不能公开|禁忌原因|感情现状|与他如何相识|你最害怕什么|二选一|风格|濃度|浓度|级别|級別|选择我的身份|選擇我的身份|職業|职业（可选）|玩家设定/;

const CHOICE_TOPIC =
  /风格|風格|浓度|濃度|级别|級別|身份|职业|職業|感情|关系|關係|害怕|相识|相識|现状|現狀|选择|選擇|二选一|情欲|情慾|推荐人群|特點|特点/;

const LIST_SECTION =
  /角色建立|玩家开始时需提供|玩家開始時需提供|开始时需提供|開始時需提供|需提供[：:]|初始填写|初始填寫|创建角色|角色创建/;

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
  return /^#{1,3}\s*(核心玩法|事件与|事件與|NPC|游戏指令|遊戲指令|游戏目标|遊戲目標|特殊规则|特殊規則|属性系统|屬性系統|随机事件|隨機事件|行动选项|行動選項|游戏启动|遊戲啟動|恋爱系统|戀愛系統|隐藏数值|隱藏數值|分院系统|禁咒系统)/.test(
    line,
  );
}

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
  return /^(风格|風格|特点|特點|推荐人群|级别|級別|描写程度|适用阶段)(\s|$)/.test(t);
}

function isSetupHeaderLine(line: string): boolean {
  const t = stripMd(line);
  if (!t || t.length > 55) return false;
  if (isBlankTitleLine(line) || isChoiceLine(line)) return false;
  if (isTableHeaderRow(line)) return false;
  if (/[：:]\s*_{0,}\s*$/.test(t) && t.length < 20) return false;
  return SETUP_HEADER.test(t) || LIST_SECTION.test(t);
}

export function isChoiceLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 140) return false;
  if (!/^([A-Fa-f]|[1-9])[\.．、]\s+\S/.test(t)) return false;
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

export function detectGuidedSetup(md: string): boolean {
  const t = md.replace(/\s+/g, ' ');
  if (
    /开始游戏|開始遊戲/.test(t) &&
    /载入设定面板|載入設定面板|输入完开始游戏|輸入完開始遊戲|打完招呼之后|打完招呼之後|再载入设定|再載入設定/.test(
      t,
    )
  ) {
    return true;
  }
  if (/强制直接复制以下内容|強制直接複製以下內容/.test(t) && /欢迎|歡迎/.test(t)) {
    return true;
  }
  if (/请输入[「"']开始游戏[」"']|請輸入[「"']開始遊戲[」"']/.test(md)) {
    return true;
  }
  if (/玩家输入完开始游戏之后再载入|玩家輸入完開始遊戲之後再載入/.test(t)) {
    return true;
  }
  return false;
}

function pushListLabel(fields: string[], body: string) {
  const cleaned = body.replace(/[：:]\s*$/, '').trim();
  const withParen = cleaned.match(/^(.{1,20}?)[（(](.+?)[）)]$/);
  if (withParen) {
    const label = withParen[1].trim();
    if (label && label.length <= 16 && !LABEL_DENY.test(label)) {
      fields.push(`${label}：`);
      fields.push(`  （${withParen[2]}）`);
      return;
    }
  }
  const label = cleaned.split(/[（(]/)[0].trim();
  if (
    label &&
    label.length <= 16 &&
    !LABEL_DENY.test(label) &&
    !/[，。！？]/.test(label)
  ) {
    fields.push(`${label}：`);
  }
}

export function extractListFields(md: string): string {
  const lines = md.split(/\r?\n/);
  const blocks: string[][] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!LIST_SECTION.test(stripMd(line)) && !LIST_SECTION.test(line)) {
      i += 1;
      continue;
    }
    const title = stripMd(line).replace(/^#+\s*/, '') || '角色建立';
    const fields: string[] = [`【${title}】`];
    i += 1;
    let idle = 0;
    while (i < lines.length && idle < 2) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) {
        idle += 1;
        i += 1;
        continue;
      }
      if (isRuleSectionBreak(raw) || /^#{1,3}\s/.test(raw)) break;
      idle = 0;

      // 附属说明：如（纯血／混血…）并入上一字段
      if (/^[（(]/.test(trimmed) && fields.length > 1) {
        fields.push(`  ${trimmed}`);
        i += 1;
        continue;
      }
      // 小节下的「需提供：」等副标题，继续往下找列表项
      if (LIST_SECTION.test(stripMd(trimmed)) || LIST_SECTION.test(trimmed)) {
        i += 1;
        continue;
      }

      const bullet = trimmed.match(/^[\-*•·]\s*(.+)$/);
      const numbered = trimmed.match(/^\d+[\.．、]\s*(.+)$/);
      const body = (bullet?.[1] || numbered?.[1] || '').trim();
      if (body) {
        if (/^(可选|可選)/.test(body) && fields.length > 1) {
          fields.push(`  （${body}）`);
        } else {
          pushListLabel(fields, body);
        }
        i += 1;
        continue;
      }
      if (/^[\u4e00-\u9fffA-Za-z]{2,12}$/.test(trimmed)) {
        fields.push(`${trimmed}：`);
        i += 1;
        continue;
      }
      break;
    }
    if (fields.some((f) => /：\s*$/.test(f))) blocks.push(fields);
  }

  return blocks
    .map((b) => b.join('\n').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function extractLatexPanelFields(md: string): string {
  const sections: { title: string; labels: string[] }[] = [];
  let ctx = '设定';

  const labelRe =
    /(?:\\textsf\{|\\text\{)?【?(姓名|性别|性別|年龄|年齡|MBTI|mbti|职业|職業|兴趣|興趣|性格|是否为角色的粉丝|是否為角色的粉絲)】?[：:]/gi;

  const parts = md.split(/(【玩家设定】|【玩家設定】|【角色设定】|【角色設定】)/);
  for (const part of parts) {
    if (/【玩家设定】|【玩家設定】/.test(part)) {
      ctx = '玩家设定';
      continue;
    }
    if (/【角色设定】|【角色設定】/.test(part)) {
      ctx = '角色设定';
      continue;
    }
    const found: string[] = [];
    let m: RegExpExecArray | null;
    labelRe.lastIndex = 0;
    while ((m = labelRe.exec(part))) {
      const label = m[1];
      if (!found.includes(label)) found.push(label);
    }
    if (found.length) {
      let sec = sections.find((s) => s.title === ctx);
      if (!sec) {
        sec = { title: ctx, labels: [] };
        sections.push(sec);
      }
      for (const l of found) {
        if (!sec.labels.includes(l)) sec.labels.push(l);
      }
    }
  }

  if (!sections.length) {
    const found: string[] = [];
    let m: RegExpExecArray | null;
    labelRe.lastIndex = 0;
    while ((m = labelRe.exec(md))) {
      if (!found.includes(m[1])) found.push(m[1]);
    }
    if (found.length >= 3) {
      sections.push({ title: '设定面板', labels: found });
    }
  }

  if (!sections.some((s) => s.labels.length >= 2)) return '';

  return sections
    .filter((s) => s.labels.length)
    .map((s) => [`【${s.title}】`, ...s.labels.map((l) => `${l}：`)].join('\n'))
    .join('\n\n');
}

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
    if (/行动选项示例|行動選項示例/.test(line)) {
      i += 1;
      continue;
    }

    if (isChoiceLine(line)) {
      const start = i;
      const opts: string[] = [];
      while (i < lines.length) {
        const L = lines[i];
        if (!L.trim()) {
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

      if (opts.length >= 2) {
        const title = lookBackTitle(lines, start);
        const looksSetup =
          CHOICE_TOPIC.test(title) ||
          SETUP_HEADER.test(title) ||
          /请提供|請提供|自定义|職業|职业|身份|风格|濃度|浓度|害怕|相识/.test(
            title,
          ) ||
          opts.every((o) => o.length < 50);
        if (looksSetup || CHOICE_TOPIC.test(title)) {
          blocks.push([`【请选择】${title}`, ...opts, '我的选择：']);
        }
      }
      continue;
    }
    i += 1;
  }
  return blocks;
}

function extractBlankChunks(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let inPhone = false;
  let inFence = false;
  let inSetupZone = false;
  let zoneIdle = 0;

  const flush = () => {
    if (cur.filter((l) => l.trim()).length >= 1) chunks.push([...cur]);
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
    // 列表型「角色建立 / 需提供」交给 extractListFields，避免把 * 姓名 原文塞进提纲
    const listHeader =
      !blank && (LIST_SECTION.test(stripMd(line)) || LIST_SECTION.test(line));
    if (listHeader) {
      inSetupZone = false;
      flush();
      continue;
    }
    const header = !blank && isSetupHeaderLine(line);

    if (blank) {
      inSetupZone = true;
      zoneIdle = 0;
      const cleaned = line.replace(/^[\s>*\-•·]+/, '').trim();
      const label = cleaned.split(/[：:]/)[0].replace(/^[A-F][\.．、]\s*/, '');
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

    if (inSetupZone && isChoiceLine(line)) {
      zoneIdle = 0;
      cur.push(formatChoiceLine(line));
      continue;
    }

    if (inSetupZone) {
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
        } else if (cur.length) cur.push('');
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

function countFillLines(text: string): number {
  return text
    .split('\n')
    .filter((l) => /：\s*$/.test(l.trim()) || /^[^：\n]{1,20}：/.test(l.trim()))
    .length;
}

export function extractFillTemplate(md: string): string {
  const lines = md.split(/\r?\n/);
  const blankChunks = extractBlankChunks(lines);
  const choiceBlocks = extractChoiceBlocks(lines);
  const listBlock = extractListFields(md);
  const latexBlock = extractLatexPanelFields(md);

  const blankUseful = blankChunks
    .filter(
      (c) =>
        c.some((l) => /：\s*$/.test(l.trim())) ||
        c.filter((l) => isChoiceLine(l)).length >= 2,
    )
    .map((c) => {
      const hasChoices = c.some((l) => isChoiceLine(l));
      const hasPickLine = c.some((l) => /我的选择|我的選擇/.test(l));
      if (hasChoices && !hasPickLine) return [...c, '我的选择：'];
      return c;
    });

  const merged: string[][] = [...blankUseful];
  const seen = new Set(merged.map(chunkKey));

  for (const block of choiceBlocks) {
    const key = chunkKey(block);
    const opts = block.filter((l) => isChoiceLine(l));
    const already = blankUseful.some((c) => {
      const hit = opts.filter((o) =>
        c.some(
          (l) =>
            l.includes(o.slice(0, 8)) ||
            l.includes(o.replace(/^[A-F1-9][\.．、]\s*/, '').slice(0, 6)),
        ),
      ).length;
      return hit >= Math.min(2, opts.length);
    });
    if (already || seen.has(key)) continue;
    seen.add(key);
    merged.push(block);
  }

  const parts: string[] = [];
  if (listBlock) parts.push(listBlock);
  if (latexBlock) parts.push(latexBlock);

  // 已有可靠列表提纲时，不再叠空白块（常把同一段列表原文重复塞入）
  const listStrong = countFillLines(listBlock) >= 3;
  const fromBlanks = listStrong
    ? ''
    : merged
        .map((c) => c.join('\n').replace(/\n{3,}/g, '\n\n').trim())
        .filter(Boolean)
        .join('\n\n');
  if (fromBlanks) parts.push(fromBlanks);

  let text = parts.filter(Boolean).join('\n\n');
  if (!text || countFillLines(text) < 2) return '';

  if (!/特殊设定|特殊設定|其他|补充|要求/.test(text)) {
    text += '\n\n特殊设定 / 要求：';
  }
  if (
    /【请选择】/.test(text) ||
    merged.some((c) => c.some((l) => isChoiceLine(l)))
  ) {
    text = '（含选择题：在「我的选择：」后写 A/B/C… 或选项原文）\n\n' + text;
  }
  return text.trim() + '\n';
}

export function resolveSetupMode(md: string, fillTemplate: string): SetupMode {
  if (detectGuidedSetup(md)) return 'guided';
  if (countFillLines(fillTemplate) >= 2) return 'form';
  if (!fillTemplate.trim()) return 'guided';
  return 'form';
}

export interface PackAnalysis {
  fillTemplate: string;
  setupMode: SetupMode;
  usedFallback: boolean;
}

export function analyzePackRules(md: string): PackAnalysis {
  const extracted = extractFillTemplate(md);
  const setupMode = resolveSetupMode(md, extracted);
  let fillTemplate = extracted;
  let usedFallback = false;

  if (setupMode === 'form' && !fillTemplate.trim()) {
    fillTemplate = FALLBACK_TEMPLATE;
    usedFallback = true;
  }

  if (setupMode === 'guided' && !fillTemplate.trim()) {
    const latex = extractLatexPanelFields(md);
    if (latex) fillTemplate = latex + '\n';
  }

  return { fillTemplate, setupMode, usedFallback };
}

/** Strip junk around a candidate simulator title */
function cleanPackTitle(raw: string): string {
  let t = raw
    .replace(/^[#>*\-\s·•]+/, '')
    .replace(/^[「『《"']+/, '')
    .replace(/[」』》"']+$/, '')
    .replace(/\s+/g, '')
    .trim();
  t = t.replace(/[，,。！？!?；;：:].*$/, '').trim();
  // 去掉「你将运行韩娱嫂子模拟器」一类前缀
  t = t.replace(
    /^(?:你是|你将|你將|请你|請你|运行|運行|进入|進入|使用|欢迎使用|歡迎使用|一个|一個)+/,
    '',
  );
  t = t.replace(/^(?:名为|名為|叫做|称作|稱作|叫作)+/, '');
  t = t.replace(/(?:的?(?:AI|人工智能))?$/i, '');
  if (t.length > 36) t = t.slice(0, 36);
  return t;
}

function ensureSimulatorSuffix(name: string): string {
  const t = name.trim();
  if (!t) return '文字模拟器';
  if (/(?:模拟器|模擬器)$/.test(t)) return t;
  return `${t.slice(0, 20)}模拟器`;
}

function isWeakTitleSeed(plain: string): boolean {
  return /^(你是|请|請|扮演|角色|规则|規則|系统|系統|注意|禁止|目录|目錄|第一步|开局流程|開局流程|核心玩法)/.test(
    plain,
  );
}

/**
 * Infer display title from rule markdown.
 * Prefers: 名为X模拟器 → headings → early X模拟器 → forced name from opening.
 * Never returns empty / 「未命名模拟器」.
 */
export function inferPackTitle(md: string): string {
  const head = md.slice(0, 4000);

  // 1) 「名为 / 名為 / 叫做 … 法友模拟器」
  const named = head.match(
    /(?:名为|名為|叫做|称作|稱作|叫作)\s*[「『《"']?([^\n「」『』《》"'，,。]{1,28}?(?:模拟器|模擬器))/,
  );
  if (named) {
    const t = cleanPackTitle(named[1]);
    if (t.length >= 3) return ensureSimulatorSuffix(t);
  }

  // 2) Markdown heading containing 模拟器 / 模擬器
  const headingSim = head.match(
    /^#{1,3}\s*[^\n]*?([^\n#]{1,32}(?:模拟器|模擬器))/m,
  );
  if (headingSim) {
    const t = cleanPackTitle(headingSim[1]);
    if (t.length >= 3) return ensureSimulatorSuffix(t);
  }

  // 3) Early standalone line that is mostly the title
  const lines = head.split(/\r?\n/).slice(0, 40);
  for (const line of lines) {
    const plain = line
      .replace(/^#+\s*/, '')
      .replace(/^[\s>*\-•·]+/, '')
      .trim();
    if (!plain || plain.length > 48) continue;
    const alone = plain.match(
      /^[「『《"']?([^\n「」『』《》"']{2,32}(?:模拟器|模擬器))[」』》"']?\s*$/,
    );
    if (alone) {
      const t = cleanPackTitle(alone[1]);
      if (t.length >= 3) return ensureSimulatorSuffix(t);
    }
  }

  // 4) Collect compact …模拟器 hits; prefer shortest clean name
  const all: string[] = [];
  const re = /([一-龥A-Za-z0-9]{2,24}(?:模拟器|模擬器))/g;
  let m: RegExpExecArray | null;
  const slice = head.slice(0, 1800);
  while ((m = re.exec(slice))) {
    const t = cleanPackTitle(m[1]);
    if (t.length >= 4 && t.length <= 28 && /(?:模拟器|模擬器)$/.test(t)) {
      all.push(t);
    }
  }
  if (all.length) {
    all.sort((a, b) => a.length - b.length);
    return ensureSimulatorSuffix(all[0]);
  }

  // 5) Force a name from first usable markdown heading
  for (const line of lines) {
    if (!/^#{1,3}\s+\S/.test(line)) continue;
    const plain = line
      .replace(/^#+\s*/, '')
      .replace(/[*`]/g, '')
      .trim();
    if (!plain || isWeakTitleSeed(plain)) continue;
    if (/^第[一二三四五六七八九十\d]+/.test(plain)) continue;
    const seed = plain
      .replace(/[：:].*$/, '')
      .replace(/[（(].*$/, '')
      .slice(0, 18);
    if (seed.length >= 2) return ensureSimulatorSuffix(cleanPackTitle(seed));
  }

  // 6) Theme keywords in opening
  const theme = head.match(
    /(霍格華茲|霍格沃茨|港娱孩子|韓娛嫂子|韩娱嫂子|港影禁恋|法友|嫂子|禁恋|禁戀)/,
  );
  if (theme) return ensureSimulatorSuffix(theme[1]);

  return '文字模拟器';
}

export function createPackFromMarkdown(md: string): SimulatorPack {
  const title = inferPackTitle(md);
  const analysis = analyzePackRules(md);
  return {
    id: crypto.randomUUID(),
    title,
    rawRules: md.trim(),
    fillTemplate: analysis.fillTemplate,
    setupMode: analysis.setupMode,
    importedAt: Date.now(),
  };
}
