import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { jsPDF } from 'jspdf';
import { PageData, TextBlock, ImageBlock } from '../types';
import { wrapTextLines } from '../utils/autoFit';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const RENDER_SCALE = 2.0; // High-DPI rendering for crisp text and graphics

interface RawTextItem {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  bgHex?: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#ffffff').replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16) || 255,
    g: parseInt(clean.slice(2, 4), 16) || 255,
    b: parseInt(clean.slice(4, 6), 16) || 255,
  };
}

function colorDistanceHex(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  return Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b);
}

/**
 * Samples the perimeter around a bounding box on the rendered canvas to detect
 * the exact background color behind the text or image.
 */
export function sampleBackgroundColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number = RENDER_SCALE
): string {
  try {
    const sx = Math.max(0, Math.floor(x * scale) - 2);
    const sy = Math.max(0, Math.floor(y * scale) - 2);
    const sw = Math.min(ctx.canvas.width - sx, Math.ceil(width * scale) + 4);
    const sh = Math.min(ctx.canvas.height - sy, Math.ceil(height * scale) + 4);

    if (sw <= 0 || sh <= 0) return '#ffffff';

    const imgData = ctx.getImageData(sx, sy, sw, sh).data;
    let rSum = 0,
      gSum = 0,
      bSum = 0,
      count = 0;

    // Sample top & bottom border pixels
    for (let col = 0; col < sw; col += 2) {
      const topIdx = col * 4;
      const botIdx = ((sh - 1) * sw + col) * 4;
      rSum += imgData[topIdx] + imgData[botIdx];
      gSum += imgData[topIdx + 1] + imgData[botIdx + 1];
      bSum += imgData[topIdx + 2] + imgData[botIdx + 2];
      count += 2;
    }

    if (count === 0) return '#ffffff';
    return rgbToHex(rSum / count, gSum / count, bSum / count);
  } catch {
    return '#ffffff';
  }
}

/**
 * Detects if a text box starting inside a colored container (like a gray/blue card)
 * accidentally extends past the right border of that visual container, and clamps width to stay inside!
 */
function clampWidthToVisualContainer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  bgHex: string,
  scale: number = RENDER_SCALE
): number {
  try {
    const baseRgb = hexToRgb(bgHex);
    const startPx = Math.max(0, Math.floor(x * scale));
    const endPx = Math.min(ctx.canvas.width - 1, Math.ceil((x + width + 12) * scale));
    const sampleY = Math.max(0, Math.min(ctx.canvas.height - 1, Math.floor((y - 2) * scale)));

    if (endPx <= startPx + 20) return width;

    const rowData = ctx.getImageData(startPx, sampleY, endPx - startPx, 1).data;
    // Scan from 35% of the width onward to see if the background color sharply transitions (e.g. gray card -> white margin)
    const minScanOffset = Math.floor((endPx - startPx) * 0.35);
    let consecutiveDiff = 0;

    for (let offset = minScanOffset; offset < endPx - startPx; offset++) {
      const idx = offset * 4;
      const r = rowData[idx];
      const g = rowData[idx + 1];
      const b = rowData[idx + 2];
      const dist =
        Math.abs(r - baseRgb.r) + Math.abs(g - baseRgb.g) + Math.abs(b - baseRgb.b);

      if (dist > 32) {
        consecutiveDiff++;
        if (consecutiveDiff >= 6) {
          // Found the visual container's right edge! Clamp 6px inside it.
          const edgePageX = (startPx + offset - 6) / scale;
          const clampedW = edgePageX - x - 6;
          if (clampedW >= 40 && clampedW < width) {
            return Math.round(clampedW);
          }
          break;
        }
      } else {
        consecutiveDiff = 0;
      }
    }
    return width;
  } catch {
    return width;
  }
}

/**
 * Samples inside the text bounding box to find the most contrasting foreground text color.
 */
function sampleTextColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  bgHex: string,
  scale: number = RENDER_SCALE
): string {
  try {
    const sx = Math.max(0, Math.floor(x * scale));
    const sy = Math.max(0, Math.floor(y * scale));
    const sw = Math.min(ctx.canvas.width - sx, Math.ceil(width * scale));
    const sh = Math.min(ctx.canvas.height - sy, Math.ceil(height * scale));
    if (sw <= 0 || sh <= 0) return '#0f172a';

    const { r: bgR, g: bgG, b: bgB } = hexToRgb(bgHex);
    const imgData = ctx.getImageData(sx, sy, sw, sh).data;
    let maxDist = 0;
    let bestR = 15,
      bestG = 23,
      bestB = 42;

    for (let i = 0; i < imgData.length; i += 16) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (dist > maxDist && dist > 80) {
        maxDist = dist;
        bestR = r;
        bestG = g;
        bestB = b;
      }
    }

    return rgbToHex(bestR, bestG, bestB);
  } catch {
    return '#0f172a';
  }
}

/**
 * Groups raw PDF text items into logical lines and paragraphs while strictly respecting
 * column gaps, visual background containers, and table boundaries.
 */
function groupTextItemsIntoBlocks(
  rawItems: RawTextItem[],
  pageIndex: number,
  ctx: CanvasRenderingContext2D,
  pageWidth: number,
  mergeParagraphs: boolean = true
): TextBlock[] {
  if (rawItems.length === 0) return [];

  // Pre-sample background color for each item so we never merge across different colored boxes
  const itemsWithBg = rawItems.map((it) => ({
    ...it,
    bgHex: sampleBackgroundColor(ctx, it.x, it.y, it.width, it.height),
  }));

  // 1. Sort top-to-bottom, then left-to-right
  const sorted = [...itemsWithBg].sort((a, b) => {
    if (Math.abs(a.y - b.y) <= Math.min(a.height, b.height) * 0.45) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  // 2. Merge items on the same horizontal line ONLY if they are genuinely adjacent words in the same column/box
  const lines: RawTextItem[] = [];
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const last = lines[lines.length - 1];
    if (last) {
      const sameRow =
        Math.abs(item.y - last.y) <= Math.min(item.height, last.height) * 0.48;
      const similarFont = Math.abs(item.fontSize - last.fontSize) <= 2.0;
      const gap = item.x - (last.x + last.width);
      // Strict column gap threshold: max 0.85 * fontSize (prevents merging across two columns!)
      const closeHorizontally = gap >= -4 && gap <= Math.max(item.fontSize * 0.85, 10);
      const sameBg =
        colorDistanceHex(last.bgHex || '#ffffff', item.bgHex || '#ffffff') <= 32;

      if (sameRow && similarFont && closeHorizontally && sameBg) {
        const needsSpace =
          gap > item.fontSize * 0.12 &&
          !last.text.endsWith(' ') &&
          !item.text.startsWith(' ');
        last.text = last.text + (needsSpace ? ' ' : '') + item.text;
        const rightEdge = Math.max(last.x + last.width, item.x + item.width);
        last.x = Math.min(last.x, item.x);
        last.width = rightEdge - last.x;
        last.height = Math.max(last.height, item.height);
        continue;
      }
    }
    lines.push({ ...item });
  }

  // 3. Optionally merge consecutive lines that belong to the same paragraph & visual container
  const mergedGroups: RawTextItem[] = [];
  if (!mergeParagraphs) {
    mergedGroups.push(...lines);
  } else {
    for (const line of lines) {
      const prev = mergedGroups[mergedGroups.length - 1];
      if (prev) {
        const verticalGap = line.y - (prev.y + prev.height);
        const sameFontSize = Math.abs(line.fontSize - prev.fontSize) <= 1.2;
        const alignedLeft = Math.abs(line.x - prev.x) <= prev.fontSize * 1.2;
        const reasonableGap =
          verticalGap >= -line.height * 0.25 && verticalGap <= prev.fontSize * 0.75;
        const sameBg =
          colorDistanceHex(prev.bgHex || '#ffffff', line.bgHex || '#ffffff') <= 28;
        const isHeadingOrBullet =
          /^[•\-*0-9]+[\.)]\s/.test(line.text.trim()) || line.fontSize >= 15;

        if (
          sameFontSize &&
          alignedLeft &&
          reasonableGap &&
          sameBg &&
          !isHeadingOrBullet
        ) {
          prev.text = prev.text + ' ' + line.text.trim();
          const minX = Math.min(prev.x, line.x);
          const maxRight = Math.max(prev.x + prev.width, line.x + line.width);
          const maxBottom = Math.max(prev.y + prev.height, line.y + line.height);
          prev.x = minX;
          prev.width = maxRight - minX;
          prev.height = maxBottom - prev.y;
          continue;
        }
      }
      mergedGroups.push({ ...line });
    }
  }

  // 4. Convert to TextBlock objects and clamp width to visual container borders
  return mergedGroups.map((g, idx) => {
    const bgHex =
      g.bgHex || sampleBackgroundColor(ctx, g.x, g.y, g.width, g.height);
    const fgHex = sampleTextColor(ctx, g.x, g.y, g.width, g.height, bgHex);

    const safeX = Math.max(2, g.x - 2);
    const safeY = Math.max(2, g.y - 2);
    const rawW = Math.min(pageWidth - safeX - 4, Math.max(g.width + 6, 28));
    const clampedW = clampWidthToVisualContainer(
      ctx,
      safeX,
      safeY,
      rawW,
      g.height + 4,
      bgHex
    );
    const paddedH = Math.max(g.height + 4, g.fontSize * 1.28);

    return {
      id: `p${pageIndex}_tb_${idx}_${Date.now().toString(36)}`,
      pageIndex,
      x: safeX,
      y: safeY,
      width: clampedW,
      height: paddedH,
      origX: safeX,
      origY: safeY,
      origWidth: rawW,
      origHeight: paddedH,
      originalText: g.text.trim(),
      translatedText: g.text.trim(),
      fontSize: Number(g.fontSize.toFixed(1)),
      originalFontSize: Number(g.fontSize.toFixed(1)),
      autoFit: true,
      fontFamily: 'Inter, sans-serif',
      fontWeight: g.isBold || g.fontSize >= 15 ? 'bold' : 'normal',
      fontStyle: 'normal',
      color: fgHex,
      backgroundColor: bgHex,
      bgOpacity: 1,
      textAlign: 'left',
      lineHeight: 1.22,
      padding: 2,
      visible: true,
      isTranslated: false,
    };
  });
}

/**
 * Parses an uploaded PDF file into interactive PageData objects.
 */
export async function parsePdfFile(
  file: File,
  mergeParagraphs: boolean = true,
  onProgress?: (currentPage: number, totalPages: number) => void
): Promise<PageData[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pages: PageData[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const pageIndex = pageNum - 1;
    onProgress?.(pageNum, numPages);

    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1.0 });
    const renderViewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = document.createElement('canvas');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({
      canvasContext: ctx,
      viewport: renderViewport,
    }).promise;

    const backgroundDataUrl = canvas.toDataURL('image/png');

    // Extract text items
    const textContent = await page.getTextContent();
    const rawItems: RawTextItem[] = [];

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const tx = item.transform;
      const fontSize = Math.hypot(tx[0], tx[1]);
      const [vx, vy] = baseViewport.convertToViewportPoint(tx[4], tx[5]);
      const itemWidth = item.width || item.str.length * fontSize * 0.52;
      const itemHeight = item.height || fontSize * 1.15;

      rawItems.push({
        x: vx,
        y: vy - fontSize * 0.88,
        width: itemWidth,
        height: Math.max(itemHeight, fontSize * 1.15),
        text: item.str,
        fontSize: Math.max(7, fontSize),
        fontName: item.fontName || '',
        isBold: /bold|black|heavy|semibold/i.test(item.fontName || ''),
      });
    }

    const pageWidth = Math.round(baseViewport.width);
    const pageHeight = Math.round(baseViewport.height);

    const textBlocks = groupTextItemsIntoBlocks(
      rawItems,
      pageIndex,
      ctx,
      pageWidth,
      mergeParagraphs
    );

    pages.push({
      pageIndex,
      width: pageWidth,
      height: pageHeight,
      backgroundDataUrl,
      textBlocks,
      imageBlocks: [],
    });
  }

  return pages;
}

/**
 * Snips a rectangular region from a PageData's background image and turns it into an interactive,
 * movable, resizable ImageBlock (while masking its original spot with the surrounding background color!).
 */
export async function snipImageRegionFromPage(
  page: PageData,
  rect: { x: number; y: number; width: number; height: number }
): Promise<ImageBlock> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scaleX = img.width / page.width;
      const scaleY = img.height / page.height;

      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = img.width;
      fullCanvas.height = img.height;
      const fullCtx = fullCanvas.getContext('2d')!;
      fullCtx.drawImage(img, 0, 0);

      const maskBgColor = sampleBackgroundColor(
        fullCtx,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        scaleX
      );

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = Math.max(10, Math.round(rect.width * scaleX));
      cropCanvas.height = Math.max(10, Math.round(rect.height * scaleY));
      const cropCtx = cropCanvas.getContext('2d')!;

      cropCtx.drawImage(
        img,
        rect.x * scaleX,
        rect.y * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
      );

      resolve({
        id: `img_${page.pageIndex}_${Date.now().toString(36)}`,
        pageIndex: page.pageIndex,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        origX: Math.round(rect.x),
        origY: Math.round(rect.y),
        origWidth: Math.round(rect.width),
        origHeight: Math.round(rect.height),
        maskBgColor,
        dataUrl: cropCanvas.toDataURL('image/png'),
        opacity: 1,
        rotation: 0,
        borderRadius: 0,
        brightness: 100,
        contrast: 100,
        visible: true,
        aspectLocked: true,
        label: 'Hình ảnh cắt từ PDF',
      });
    };
    img.onerror = reject;
    img.src = page.backgroundDataUrl;
  });
}

/**
 * Generates a rich, realistic sample PDF page with diagrams, images, headers, and paragraphs.
 */
export function createSampleDocumentPages(): PageData[] {
  const pageWidth = 595;
  const pageHeight = 842;

  const canvas = document.createElement('canvas');
  canvas.width = pageWidth * RENDER_SCALE;
  canvas.height = pageHeight * RENDER_SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RENDER_SCALE, RENDER_SCALE);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, pageWidth, 108);

  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 104, pageWidth, 4);

  ctx.fillStyle = '#f1f5f9';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(36, 134, 310, 175, 8);
  ctx.fill();
  ctx.stroke();

  const cardCoords = [
    { x: 36, y: 332, w: 252, h: 135, bg: '#eef2ff', border: '#c7d2fe' },
    { x: 306, y: 332, w: 252, h: 135, bg: '#ecfdf5', border: '#a7f3d0' },
  ];
  for (const c of cardCoords) {
    ctx.fillStyle = c.bg;
    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.roundRect(c.x, c.y, c.w, c.h, 8);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(36, 495, 522, 32);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(36, 495, 522, 132);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(36, 527, 522, 50);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(36, 577, 522, 50);
  ctx.beginPath();
  ctx.moveTo(36, 577);
  ctx.lineTo(558, 577);
  ctx.moveTo(210, 495);
  ctx.lineTo(210, 627);
  ctx.moveTo(410, 495);
  ctx.lineTo(410, 627);
  ctx.stroke();

  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#fde68a';
  ctx.beginPath();
  ctx.roundRect(36, 655, 330, 130, 8);
  ctx.fill();
  ctx.stroke();

  const chartCanvas = document.createElement('canvas');
  chartCanvas.width = 380;
  chartCanvas.height = 340;
  const cctx = chartCanvas.getContext('2d')!;
  cctx.fillStyle = '#1e1b4b';
  cctx.beginPath();
  cctx.roundRect(0, 0, 380, 340, 16);
  cctx.fill();
  const bars = [
    { h: 120, color: '#6366f1', label: 'Q1' },
    { h: 175, color: '#8b5cf6', label: 'Q2' },
    { h: 215, color: '#ec4899', label: 'Q3' },
    { h: 265, color: '#10b981', label: 'Q4' },
  ];
  bars.forEach((b, idx) => {
    const bx = 45 + idx * 78;
    const by = 290 - b.h;
    cctx.fillStyle = b.color;
    cctx.beginPath();
    cctx.roundRect(bx, by, 48, b.h, 8);
    cctx.fill();
    cctx.fillStyle = '#e2e8f0';
    cctx.font = 'bold 18px Inter, sans-serif';
    cctx.fillText(b.label, bx + 11, 318);
  });
  cctx.fillStyle = '#ffffff';
  cctx.font = 'bold 20px Inter, sans-serif';
  cctx.fillText('AI Performance Index 2026', 32, 38);

  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = 340;
  badgeCanvas.height = 260;
  const bctx = badgeCanvas.getContext('2d')!;
  const grad = bctx.createLinearGradient(0, 0, 340, 260);
  grad.addColorStop(0, '#0ea5e9');
  grad.addColorStop(1, '#2563eb');
  bctx.fillStyle = grad;
  bctx.beginPath();
  bctx.roundRect(0, 0, 340, 260, 18);
  bctx.fill();
  bctx.strokeStyle = 'rgba(255,255,255,0.35)';
  bctx.lineWidth = 4;
  bctx.beginPath();
  bctx.arc(170, 110, 56, 0, Math.PI * 2);
  bctx.stroke();
  bctx.fillStyle = '#ffffff';
  bctx.font = 'bold 28px Inter, sans-serif';
  bctx.textAlign = 'center';
  bctx.fillText('99.4%', 170, 120);
  bctx.font = '600 17px Inter, sans-serif';
  bctx.fillText('Layout Preservation Score', 170, 215);

  const imageBlocks: ImageBlock[] = [
    {
      id: 'sample_img_chart',
      pageIndex: 0,
      x: 364,
      y: 134,
      width: 194,
      height: 175,
      dataUrl: chartCanvas.toDataURL('image/png'),
      opacity: 1,
      rotation: 0,
      borderRadius: 8,
      brightness: 100,
      contrast: 100,
      visible: true,
      aspectLocked: false,
      label: 'Biểu đồ AI Performance (Kéo/Phóng to tùy ý)',
    },
    {
      id: 'sample_img_badge',
      pageIndex: 0,
      x: 382,
      y: 655,
      width: 176,
      height: 130,
      dataUrl: badgeCanvas.toDataURL('image/png'),
      opacity: 1,
      rotation: 0,
      borderRadius: 8,
      brightness: 100,
      contrast: 100,
      visible: true,
      aspectLocked: false,
      label: 'Hình minh họa Độ chính xác (Kéo/Phóng to)',
    },
  ];

  const rawBlocks: Array<
    Omit<
      TextBlock,
      | 'id'
      | 'pageIndex'
      | 'origX'
      | 'origY'
      | 'origWidth'
      | 'origHeight'
      | 'translatedText'
      | 'originalFontSize'
      | 'autoFit'
      | 'fontFamily'
      | 'fontStyle'
      | 'bgOpacity'
      | 'lineHeight'
      | 'padding'
      | 'visible'
      | 'isTranslated'
    >
  > = [
    {
      x: 36,
      y: 22,
      width: 520,
      height: 36,
      originalText: 'GLOBAL ENTERPRISE AI & CLOUD REPORT 2026',
      fontSize: 21,
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#0f172a',
      textAlign: 'left',
    },
    {
      x: 36,
      y: 62,
      width: 520,
      height: 28,
      originalText:
        'Next-Generation Document Intelligence, Instant Multilingual Translation & Dynamic Layout Adaptation',
      fontSize: 11.5,
      fontWeight: 'normal',
      color: '#94a3b8',
      backgroundColor: '#0f172a',
      textAlign: 'left',
    },
    {
      x: 48,
      y: 146,
      width: 286,
      height: 26,
      originalText: '1. Executive Summary',
      fontSize: 15,
      fontWeight: 'bold',
      color: '#0f172a',
      backgroundColor: '#f1f5f9',
      textAlign: 'left',
    },
    {
      x: 48,
      y: 178,
      width: 286,
      height: 118,
      originalText:
        'Modern organizations process thousands of technical PDF documents daily across international branches. Traditional translation tools destroy visual formatting, overflow tables, and misalign diagrams. Our adaptive layout engine automatically scales typography and preserves every visual asset.',
      fontSize: 10.5,
      fontWeight: 'normal',
      color: '#334155',
      backgroundColor: '#f1f5f9',
      textAlign: 'left',
    },
    {
      x: 48,
      y: 344,
      width: 228,
      height: 24,
      originalText: 'Ultra-Fast Parallel Processing',
      fontSize: 13,
      fontWeight: 'bold',
      color: '#312e81',
      backgroundColor: '#eef2ff',
      textAlign: 'left',
    },
    {
      x: 48,
      y: 374,
      width: 228,
      height: 82,
      originalText:
        'Powered by Gemini Flash neural architectures, entire multi-page PDF documents are translated in seconds while maintaining domain-specific terminology and context.',
      fontSize: 10,
      fontWeight: 'normal',
      color: '#3730a3',
      backgroundColor: '#eef2ff',
      textAlign: 'left',
    },
    {
      x: 318,
      y: 344,
      width: 228,
      height: 24,
      originalText: 'Smart Auto-Fit & Visual Control',
      fontSize: 13,
      fontWeight: 'bold',
      color: '#065f46',
      backgroundColor: '#ecfdf5',
      textAlign: 'left',
    },
    {
      x: 318,
      y: 374,
      width: 228,
      height: 82,
      originalText:
        'When translated sentences expand in languages like Vietnamese, German, or French, the Auto-Fit engine dynamically calibrates font size and line spacing to fit the exact bounding box.',
      fontSize: 10,
      fontWeight: 'normal',
      color: '#047857',
      backgroundColor: '#ecfdf5',
      textAlign: 'left',
    },
    {
      x: 44,
      y: 502,
      width: 158,
      height: 20,
      originalText: 'System Module',
      fontSize: 11,
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#1e293b',
      textAlign: 'left',
    },
    {
      x: 218,
      y: 502,
      width: 184,
      height: 20,
      originalText: 'Key Capability',
      fontSize: 11,
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#1e293b',
      textAlign: 'left',
    },
    {
      x: 418,
      y: 502,
      width: 132,
      height: 20,
      originalText: 'Processing Speed',
      fontSize: 11,
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#1e293b',
      textAlign: 'left',
    },
    {
      x: 44,
      y: 535,
      width: 158,
      height: 36,
      originalText: 'Typography Auto-Scaler',
      fontSize: 10,
      fontWeight: 'bold',
      color: '#0f172a',
      backgroundColor: '#f8fafc',
      textAlign: 'left',
    },
    {
      x: 218,
      y: 535,
      width: 184,
      height: 36,
      originalText: 'Automatic bounding-box font calibration & multi-line wrapping',
      fontSize: 9.5,
      fontWeight: 'normal',
      color: '#334155',
      backgroundColor: '#f8fafc',
      textAlign: 'left',
    },
    {
      x: 418,
      y: 535,
      width: 132,
      height: 36,
      originalText: '< 15 milliseconds / page',
      fontSize: 9.5,
      fontWeight: 'bold',
      color: '#2563eb',
      backgroundColor: '#f8fafc',
      textAlign: 'left',
    },
    {
      x: 44,
      y: 585,
      width: 158,
      height: 36,
      originalText: 'Interactive Image Studio',
      fontSize: 10,
      fontWeight: 'bold',
      color: '#0f172a',
      backgroundColor: '#ffffff',
      textAlign: 'left',
    },
    {
      x: 218,
      y: 585,
      width: 184,
      height: 36,
      originalText: 'Drag, resize, crop, rotate & replace embedded PDF illustrations',
      fontSize: 9.5,
      fontWeight: 'normal',
      color: '#334155',
      backgroundColor: '#ffffff',
      textAlign: 'left',
    },
    {
      x: 418,
      y: 585,
      width: 132,
      height: 36,
      originalText: 'Real-time 60 FPS Canvas',
      fontSize: 9.5,
      fontWeight: 'bold',
      color: '#059669',
      backgroundColor: '#ffffff',
      textAlign: 'left',
    },
    {
      x: 48,
      y: 667,
      width: 306,
      height: 24,
      originalText: 'Interactive Tip: Customize Anything!',
      fontSize: 13,
      fontWeight: 'bold',
      color: '#92400e',
      backgroundColor: '#fffbeb',
      textAlign: 'left',
    },
    {
      x: 48,
      y: 695,
      width: 306,
      height: 78,
      originalText:
        'Click any text block or image on this page to drag, resize, change font size, or edit content. Use the "Cut/Select Image" tool on the toolbar to turn any region of a PDF into a movable image object.',
      fontSize: 10,
      fontWeight: 'normal',
      color: '#78350f',
      backgroundColor: '#fffbeb',
      textAlign: 'left',
    },
  ];

  const textBlocks: TextBlock[] = rawBlocks.map((b, i) => ({
    ...b,
    id: `sample_tb_${i}`,
    pageIndex: 0,
    origX: b.x,
    origY: b.y,
    origWidth: b.width,
    origHeight: b.height,
    translatedText: b.originalText,
    originalFontSize: b.fontSize,
    autoFit: true,
    fontFamily: 'Inter, sans-serif',
    fontStyle: 'normal',
    bgOpacity: 1,
    lineHeight: 1.22,
    padding: 2,
    visible: true,
    isTranslated: false,
  }));

  return [
    {
      pageIndex: 0,
      width: pageWidth,
      height: pageHeight,
      backgroundDataUrl: canvas.toDataURL('image/png'),
      textBlocks,
      imageBlocks,
    },
  ];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Renders a complete PageData (background + clean original masks + images + formatted Unicode text)
 * onto a high-DPI HTMLCanvasElement for export.
 */
export async function renderCompositePageCanvas(
  page: PageData,
  exportScale: number = 2.5
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.width * exportScale);
  canvas.height = Math.round(page.height * exportScale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(exportScale, exportScale);

  // 1. Draw base PDF background
  const bgImg = await loadImage(page.backgroundDataUrl);
  ctx.drawImage(bgImg, 0, 0, page.width, page.height);

  // 2. Mask original positions of snipped/moved images
  for (const imgBlock of page.imageBlocks) {
    if (
      imgBlock.origX !== undefined &&
      imgBlock.origY !== undefined &&
      imgBlock.origWidth !== undefined &&
      imgBlock.origHeight !== undefined
    ) {
      ctx.fillStyle = imgBlock.maskBgColor || '#ffffff';
      ctx.fillRect(
        imgBlock.origX - 1,
        imgBlock.origY - 1,
        imgBlock.origWidth + 2,
        imgBlock.origHeight + 2
      );
    }
  }

  // 3. Mask original positions of text blocks so original PDF text never bleeds through
  for (const tb of page.textBlocks) {
    // Clamp original mask width to tb.width if tb was clamped to a visual container
    const maskW = Math.min(tb.origWidth, tb.width + 4);
    ctx.fillStyle = tb.backgroundColor || '#ffffff';
    ctx.fillRect(tb.origX - 1, tb.origY - 1, maskW + 2, tb.origHeight + 2);
  }

  // 4. Draw visible ImageBlocks
  for (const imgBlock of page.imageBlocks) {
    if (!imgBlock.visible) continue;
    try {
      const el = await loadImage(imgBlock.dataUrl);
      ctx.save();
      ctx.globalAlpha = imgBlock.opacity;
      ctx.filter = `brightness(${imgBlock.brightness}%) contrast(${imgBlock.contrast}%)`;
      const cx = imgBlock.x + imgBlock.width / 2;
      const cy = imgBlock.y + imgBlock.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((imgBlock.rotation * Math.PI) / 180);

      if (imgBlock.borderRadius > 0) {
        ctx.beginPath();
        ctx.roundRect(
          -imgBlock.width / 2,
          -imgBlock.height / 2,
          imgBlock.width,
          imgBlock.height,
          imgBlock.borderRadius
        );
        ctx.clip();
      }

      ctx.drawImage(
        el,
        -imgBlock.width / 2,
        -imgBlock.height / 2,
        imgBlock.width,
        imgBlock.height
      );
      ctx.restore();
    } catch (e) {
      console.warn('Could not render image block:', e);
    }
  }

  // 5. Draw visible TextBlocks with strict bounding-box clipping and exact word wrapping
  for (const tb of page.textBlocks) {
    if (!tb.visible) continue;
    const text = tb.translatedText || tb.originalText;
    if (!text.trim()) continue;

    ctx.save();
    // Strict clip to tb bounding box so no character can ever bleed outside the box
    ctx.beginPath();
    ctx.rect(tb.x, tb.y, tb.width, tb.height + 4);
    ctx.clip();

    if (tb.bgOpacity > 0) {
      ctx.globalAlpha = tb.bgOpacity;
      ctx.fillStyle = tb.backgroundColor || '#ffffff';
      ctx.fillRect(tb.x, tb.y, tb.width, tb.height);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = tb.color || '#0f172a';
    ctx.font = `${tb.fontStyle} ${tb.fontWeight} ${tb.fontSize}px ${tb.fontFamily}`;
    ctx.textBaseline = 'top';

    const pad = tb.padding ?? 2;
    const availW = Math.max(12, tb.width - pad * 2);
    const lines = wrapTextLines(ctx, text, availW);
    const lineStep = tb.fontSize * tb.lineHeight;

    lines.forEach((line, idx) => {
      const ly = tb.y + pad + idx * lineStep;
      if (ly + tb.fontSize * 0.75 > tb.y + tb.height + 4) return;

      let lx = tb.x + pad;
      if (tb.textAlign === 'center') {
        const lw = ctx.measureText(line).width;
        lx = tb.x + (tb.width - lw) / 2;
      } else if (tb.textAlign === 'right') {
        const lw = ctx.measureText(line).width;
        lx = tb.x + tb.width - pad - lw;
      }
      ctx.fillText(line, lx, ly);
    });

    ctx.restore();
  }

  return canvas;
}

/**
 * Exports all pages to a high-resolution PDF file and triggers browser download.
 */
export async function exportPagesToPdf(
  pages: PageData[],
  filename: string = 'translated-document.pdf',
  onProgress?: (pageNum: number, total: number) => void
): Promise<void> {
  if (pages.length === 0) return;

  const first = pages[0];
  const orientation = first.width > first.height ? 'l' : 'p';
  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [first.width, first.height],
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.(i + 1, pages.length);

    if (i > 0) {
      pdf.addPage(
        [page.width, page.height],
        page.width > page.height ? 'l' : 'p'
      );
    }

    const canvas = await renderCompositePageCanvas(page, 2.4);
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    pdf.addImage(imgData, 'JPEG', 0, 0, page.width, page.height);
  }

  pdf.save(filename);
}
