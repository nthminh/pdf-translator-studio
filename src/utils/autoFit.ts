import { TextBlock, ImageBlock } from '../types';

let measureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  return measureCanvas.getContext('2d');
}

// Regex matching CJK ideographs, Hiragana, Katakana, Hangul, and CJK symbols
const CJK_CHAR_REGEX =
  /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;

// Characters that must NOT start a new line in Japanese/Chinese (Kinsoku Shori / 禁則処理)
const NO_START_LINE_CHARS = new Set([
  '。', '、', '，', '．', '.', ',', '！', '!', '？', '?', '：', ':', '；', ';',
  'ー', '〜', '～', '）', ')', '］', ']', '｝', '}', '」', '』', '】', '》', '〉', '≫',
  'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ',
  'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ッ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ヵ', 'ヶ',
  '・', '…', '‥', '°', '%', '％',
]);

// Characters that must NOT end a line (opening brackets)
const NO_END_LINE_CHARS = new Set([
  '（', '(', '［', '[', '｛', '{', '「', '『', '【', '《', '〈', '≪', '¥', '＄', '$',
]);

export interface TextToken {
  text: string;
  isCJK: boolean;
  hasTrailingSpace: boolean;
}

/**
 * Tokenizes any multilingual string (Vietnamese, English, Japanese, Chinese, Korean, mixed)
 * into smart breakable units.
 */
export function tokenizeMultilingualParagraph(para: string): TextToken[] {
  const normalized = para
    .replace(/(\d+)\s+([階番年月日人名個本枚歳時分秒%％度])/g, '$1$2')
    .replace(
      /([\u3040-\u30FF\u4E00-\u9FFF])\s+(\d+[階番年月日人名個本枚歳時分秒%％度]?)/g,
      '$1$2'
    );

  const rawTokens: TextToken[] = [];
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    const ch = normalized[i];

    if (/\s/.test(ch)) {
      if (rawTokens.length > 0) {
        rawTokens[rawTokens.length - 1].hasTrailingSpace = true;
      }
      i++;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let numStr = ch;
      i++;
      while (i < len && /[0-9.,%％]/.test(normalized[i])) {
        numStr += normalized[i];
        i++;
      }
      if (i < len && /[階番年月日人名個本枚歳時分秒棟号室]/.test(normalized[i])) {
        numStr += normalized[i];
        i++;
      }
      rawTokens.push({ text: numStr, isCJK: false, hasTrailingSpace: false });
      continue;
    }

    if (CJK_CHAR_REGEX.test(ch)) {
      let unit = ch;
      i++;
      while (
        i < len &&
        NO_END_LINE_CHARS.has(unit[unit.length - 1]) &&
        !/\s/.test(normalized[i])
      ) {
        unit += normalized[i];
        i++;
      }
      while (i < len && NO_START_LINE_CHARS.has(normalized[i])) {
        unit += normalized[i];
        i++;
      }
      rawTokens.push({ text: unit, isCJK: true, hasTrailingSpace: false });
      continue;
    }

    let word = ch;
    i++;
    while (
      i < len &&
      !/\s/.test(normalized[i]) &&
      !CJK_CHAR_REGEX.test(normalized[i])
    ) {
      word += normalized[i];
      i++;
    }
    while (i < len && NO_START_LINE_CHARS.has(normalized[i])) {
      word += normalized[i];
      i++;
    }
    rawTokens.push({ text: word, isCJK: false, hasTrailingSpace: false });
  }

  return rawTokens;
}

/**
 * Helper that splits any single over-wide string character by character so it never exceeds safeMaxWidth.
 */
function breakLongStringByChar(
  ctx: CanvasRenderingContext2D,
  str: string,
  safeMaxWidth: number
): string[] {
  const result: string[] = [];
  let sub = '';
  for (const ch of Array.from(str)) {
    const test = sub + ch;
    if (ctx.measureText(test).width > safeMaxWidth && sub !== '') {
      result.push(sub);
      sub = ch;
    } else {
      sub = test;
    }
  }
  if (sub) result.push(sub);
  return result.length > 0 ? result : [''];
}

/**
 * Wraps text into lines that strictly respect `maxWidth` for all languages
 * (guaranteed 0 horizontal overflow).
 */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [''];

  const hasCJK = CJK_CHAR_REGEX.test(text);
  const cleanedText = hasCJK
    ? text
        .replace(/([^\n])\n(\d+\s*\n?\s*[階番年月日人名個本枚])/g, '$1$2')
        .replace(
          /([、。！？\u3040-\u30FF\u4E00-\u9FFF])\n([\u3040-\u30FF\u4E00-\u9FFF0-9])/g,
          '$1$2'
        )
    : text;

  const paragraphs = cleanedText.split('\n');
  const lines: string[] = [];
  // Leave a 4px safety buffer inside maxWidth so glyphs never touch or cross the right edge
  const safeMaxWidth = Math.max(16, maxWidth - 4);

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }

    const tokens = tokenizeMultilingualParagraph(para);
    let currentLine = '';
    let prevToken: TextToken | null = null;

    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx];
      const needsSpace =
        currentLine !== '' &&
        prevToken !== null &&
        prevToken.hasTrailingSpace &&
        !(prevToken.isCJK && token.isCJK);

      const separator = needsSpace ? ' ' : '';
      const candidate = currentLine + separator + token.text;

      if (ctx.measureText(candidate).width <= safeMaxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine !== '') {
          lines.push(currentLine);
          currentLine = '';
        }

        if (ctx.measureText(token.text).width > safeMaxWidth) {
          const broken = breakLongStringByChar(ctx, token.text, safeMaxWidth);
          for (let b = 0; b < broken.length - 1; b++) {
            lines.push(broken[b]);
          }
          currentLine = broken[broken.length - 1];
        } else {
          currentLine = token.text;
        }
      }
      prevToken = token;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Computes the ideal fontSize so `text` fits 100% within `(width, height)`
 * without overflowing horizontally or vertically.
 */
export function calculateOptimalFontSize(
  text: string,
  width: number,
  height: number,
  originalFontSize: number,
  fontFamily: string = 'Inter, sans-serif',
  fontWeight: 'normal' | 'bold' = 'normal',
  fontStyle: 'normal' | 'italic' = 'normal',
  lineHeight: number = 1.22,
  padding: number = 2,
  allowScaleUp: boolean = false
): number {
  const ctx = getMeasureContext();
  if (!ctx || !text.trim()) return originalFontSize;

  const availW = Math.max(16, width - padding * 2);
  const availH = Math.max(12, height - padding * 2);

  const maxFont = allowScaleUp
    ? Math.min(Math.max(originalFontSize * 1.6, 26), 72)
    : Math.min(Math.max(originalFontSize, 9), 96);
  const minFont = 6.0;

  const fitsAtSize = (size: number): boolean => {
    ctx.font = `${fontStyle} ${fontWeight} ${size}px ${fontFamily}`;
    const lines = wrapTextLines(ctx, text, availW);
    const totalHeight = lines.length * size * lineHeight;

    for (const line of lines) {
      if (ctx.measureText(line).width > availW + 1) {
        return false;
      }
    }
    return totalHeight <= availH + 1;
  };

  if (!allowScaleUp && fitsAtSize(originalFontSize)) {
    return Number(originalFontSize.toFixed(1));
  }

  let low = minFont;
  let high = allowScaleUp ? maxFont : originalFontSize;
  let best = minFont;

  for (let iter = 0; iter < 16; iter++) {
    const mid = (low + high) / 2;
    if (fitsAtSize(mid)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  const limitMax = allowScaleUp ? maxFont : originalFontSize;
  return Number(Math.max(minFont, Math.min(best, limitMax)).toFixed(1));
}

/**
 * Computes how many vertical pixels `text` needs at `fontSize`.
 */
export function measureRequiredHeight(
  text: string,
  width: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: 'normal' | 'bold',
  fontStyle: 'normal' | 'italic',
  lineHeight: number,
  padding: number
): number {
  const ctx = getMeasureContext();
  if (!ctx || !text.trim()) return fontSize * lineHeight + padding * 2;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  const availW = Math.max(16, width - padding * 2);
  const lines = wrapTextLines(ctx, text, availW);
  return Math.ceil(lines.length * fontSize * lineHeight + padding * 2 + 2);
}

/**
 * Applies Auto-Fit font size to a single TextBlock.
 */
export function fitTextBlock(
  block: TextBlock,
  allowScaleUp: boolean = false
): TextBlock {
  const rawText = block.translatedText || block.originalText;
  const hasCJK = CJK_CHAR_REGEX.test(rawText);
  const cleanedText = hasCJK
    ? rawText
        .replace(/([^\n])\n(\d+\s*\n?\s*[階番年月日人名個本枚])/g, '$1$2')
        .replace(/(\d+)\s+([階番年月日人名個本枚])/g, '$1$2')
    : rawText;

  const fontFamily =
    hasCJK && block.fontFamily === 'Inter, sans-serif'
      ? '"Noto Sans", Inter, sans-serif'
      : block.fontFamily;

  const optimalSize = calculateOptimalFontSize(
    cleanedText,
    block.width,
    block.height,
    block.originalFontSize,
    fontFamily,
    block.fontWeight,
    block.fontStyle,
    block.lineHeight,
    block.padding,
    allowScaleUp
  );

  // Also ensure height is at least enough for the fitted lines if optimalSize hit the minimum floor
  const reqH = measureRequiredHeight(
    cleanedText,
    block.width,
    optimalSize,
    fontFamily,
    block.fontWeight,
    block.fontStyle,
    block.lineHeight,
    block.padding
  );

  return {
    ...block,
    translatedText: cleanedText,
    fontFamily,
    fontSize: optimalSize,
    height: Math.max(block.height, reqH),
  };
}

/**
 * Smart Page Auto-Alignment & Layout Refinement:
 * 1. Clamps every block strictly inside page margins.
 * 2. Allows blocks to expand vertically into free empty space below them before shrinking font excessively,
 *    while strictly preventing overlap with the next block below!
 * 3. Re-runs Auto-Fit on every text block so all translated text fits 100% inside its box.
 */
export function autoAlignAndFitPage(
  textBlocks: TextBlock[],
  _imageBlocks: ImageBlock[],
  pageWidth: number,
  pageHeight: number
): TextBlock[] {
  const updated = textBlocks.map((b) => ({
    ...b,
    // Clamp width so no block ever exceeds the right edge of the page
    x: Math.max(4, Math.min(pageWidth - 28, b.x)),
    width: Math.min(b.width, pageWidth - Math.max(4, b.x) - 6),
  }));

  // 1. Snap left alignment for blocks that share nearly identical X coordinates (within 5px)
  const sortedByX = [...updated].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sortedByX.length; i++) {
    for (let j = i + 1; j < sortedByX.length; j++) {
      const diffX = Math.abs(sortedByX[j].x - sortedByX[i].x);
      if (diffX > 0 && diffX <= 5) {
        sortedByX[j].x = sortedByX[i].x;
      }
    }
  }

  // 2. Sort top-to-bottom and calculate maximum safe height before hitting the next block in the same column
  const sortedByY = [...updated].sort((a, b) => a.y - b.y);
  for (let i = 0; i < sortedByY.length; i++) {
    const curr = sortedByY[i];

    // Find the closest block directly below `curr` in the same horizontal column
    let maxAvailableBottom = pageHeight - 6;
    for (let j = 0; j < sortedByY.length; j++) {
      if (i === j) continue;
      const other = sortedByY[j];
      if (other.y <= curr.y + 2) continue;

      const horizOverlap =
        Math.min(curr.x + curr.width, other.x + other.width) -
        Math.max(curr.x, other.x);

      if (horizOverlap > 8) {
        maxAvailableBottom = Math.min(maxAvailableBottom, other.y - 3);
      }
    }

    const maxSafeHeight = Math.max(14, maxAvailableBottom - curr.y);

    // Check how much height the text would ideally need at a comfortable readable size (e.g. 88% of originalFontSize)
    const targetReadableFont = Math.max(8.5, curr.originalFontSize * 0.88);
    const idealH = measureRequiredHeight(
      curr.translatedText || curr.originalText,
      curr.width,
      targetReadableFont,
      curr.fontFamily,
      curr.fontWeight,
      curr.fontStyle,
      curr.lineHeight,
      curr.padding
    );

    if (idealH > curr.height && idealH <= maxSafeHeight) {
      curr.height = idealH;
    } else {
      curr.height = Math.min(Math.max(curr.height, 14), maxSafeHeight);
    }
  }

  // 3. Run fitTextBlock on each block and clamp height to maxSafeHeight
  return updated.map((b) => {
    const fitted = fitTextBlock(b);
    return fitted;
  });
}
