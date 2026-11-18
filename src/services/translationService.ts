import { GoogleGenAI } from '@google/genai';
import { TextBlock, TranslationEngine, SUPPORTED_LANGUAGES } from '../types';
import { VisionDetectedBox } from './pdfService';

const CLOUD_AI_PROXY_BASE = 'https://daiichi-ai-chatbot.onrender.com';

export interface TranslateBatchOptions {
  blocks: TextBlock[];
  sourceLang: string;
  targetLang: string;
  engine: TranslationEngine;
  apiKey?: string;
  keepConciseForLayout?: boolean;
  onProgress?: (completedCount: number, totalCount: number) => void;
}

function getLanguageLabel(code: string): string {
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return found ? found.name : code;
}

/**
 * Translates an array of TextBlocks using Gemini API (`gemini-3.8-flash` or `gemini-3.5-flash-lite`)
 * via the current `@google/genai` Interactions API with Structured Output JSON Schema.
 */
async function translateWithGemini(
  blocks: TextBlock[],
  sourceLang: string,
  targetLang: string,
  model: 'gemini-3.8-flash' | 'gemini-3.5-flash-lite',
  apiKey: string,
  keepConciseForLayout: boolean,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, string>> {
  const client = new GoogleGenAI({ apiKey: apiKey.trim() });
  const resultMap = new Map<string, string>();

  const targetLangName = getLanguageLabel(targetLang);
  const sourceLangName =
    sourceLang === 'auto' ? 'Auto-detect language' : getLanguageLabel(sourceLang);

  // Process in batches of 35 blocks in parallel for maximum speed
  const BATCH_SIZE = 35;
  const batches: TextBlock[][] = [];
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    batches.push(blocks.slice(i, i + BATCH_SIZE));
  }

  let completed = 0;
  onProgress?.(0, blocks.length);

  await Promise.all(
    batches.map(async (batch) => {
      const payload = batch.map((b) => ({
        id: b.id,
        text: b.originalText,
      }));

      const conciseHint = keepConciseForLayout
        ? 'Keep translations natural, accurate, and reasonably concise so they fit cleanly inside the original PDF bounding boxes without excessive length expansion.'
        : 'Translate accurately and naturally while preserving all formatting and meaning.';

      const systemInstruction = `You are an expert document and PDF translator.
Translate each item in the input JSON array from ${sourceLangName} into ${targetLangName}.
Rules:
1. Preserve all numbers, proper nouns, codes, formulas, URLs, and bullet symbols accurately.
2. ${conciseHint}
3. Return every item with its exact matching "id" and "translatedText".`;

      const interaction = await client.interactions.create({
        model,
        system_instruction: systemInstruction,
        input: JSON.stringify(payload),
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: {
              translations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    translatedText: { type: 'string' },
                  },
                  required: ['id', 'translatedText'],
                },
              },
            },
            required: ['translations'],
          },
        },
      });

      const rawOutput = interaction.output_text || '{}';
      const parsed = JSON.parse(rawOutput) as {
        translations?: Array<{ id: string; translatedText: string }>;
      };

      if (parsed.translations && Array.isArray(parsed.translations)) {
        for (const item of parsed.translations) {
          if (item.id && typeof item.translatedText === 'string') {
            resultMap.set(item.id, item.translatedText);
          }
        }
      }

      completed += batch.length;
      onProgress?.(Math.min(completed, blocks.length), blocks.length);
    })
  );

  return resultMap;
}

/**
 * Ultra-fast browser translation using Google Translate public GTX endpoint.
 * Batches multiple blocks with a unique delimiter to translate whole pages in < 1 second!
 */
async function translateWithGoogleFree(
  blocks: TextBlock[],
  sourceLang: string,
  targetLang: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, string>> {
  const resultMap = new Map<string, string>();
  const sl = sourceLang === 'auto' ? 'auto' : sourceLang;
  const tl = targetLang === 'auto' ? 'vi' : targetLang;

  // Group blocks into chunks of ~18 blocks separated by newline delimiter
  const CHUNK_SIZE = 15;
  const chunks: TextBlock[][] = [];
  for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
    chunks.push(blocks.slice(i, i + CHUNK_SIZE));
  }

  let completed = 0;
  onProgress?.(0, blocks.length);

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        // Translate each block concurrently within the chunk for 100% boundary accuracy
        await Promise.all(
          chunk.map(async (block) => {
            const text = block.originalText.trim();
            if (!text) {
              resultMap.set(block.id, block.originalText);
              return;
            }
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
              sl
            )}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data) && Array.isArray(data[0])) {
              const translated = data[0]
                .map((segment: any) => (Array.isArray(segment) ? segment[0] : ''))
                .join('');
              resultMap.set(block.id, translated || block.originalText);
            } else {
              resultMap.set(block.id, block.originalText);
            }
          })
        );
      } catch (err) {
        console.warn('Fallback translation warning for chunk:', err);
        for (const b of chunk) {
          if (!resultMap.has(b.id)) {
            resultMap.set(b.id, b.originalText);
          }
        }
      } finally {
        completed += chunk.length;
        onProgress?.(Math.min(completed, blocks.length), blocks.length);
      }
    })
  );

  return resultMap;
}

export async function translateTextBlocks(
  options: TranslateBatchOptions
): Promise<Map<string, string>> {
  const {
    blocks,
    sourceLang,
    targetLang,
    engine,
    apiKey,
    keepConciseForLayout = true,
    onProgress,
  } = options;

  if (blocks.length === 0) return new Map();

  if (engine === 'gemini-3.8-flash' || engine === 'gemini-3.5-flash-lite') {
    if (apiKey && apiKey.trim()) {
      return await translateWithGemini(
        blocks,
        sourceLang,
        targetLang,
        engine,
        apiKey,
        keepConciseForLayout,
        onProgress
      );
    }

    // Zero-key Cloud AI proxy fallback via Daiichi AI server, then Google Free fallback
    try {
      const targetLangName = getLanguageLabel(targetLang);
      const sourceLangName =
        sourceLang === 'auto' ? 'Auto-detect language' : getLanguageLabel(sourceLang);
      const resultMap = new Map<string, string>();
      const BATCH_SIZE = 35;
      const batches: TextBlock[][] = [];
      for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        batches.push(blocks.slice(i, i + BATCH_SIZE));
      }
      let completed = 0;
      onProgress?.(0, blocks.length);

      await Promise.all(
        batches.map(async (batch) => {
          const r = await fetch(`${CLOUD_AI_PROXY_BASE}/api/pdf-studio/translate-blocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: engine,
              source_lang: sourceLangName,
              target_lang: targetLangName,
              keep_concise: keepConciseForLayout,
              items: batch.map((b) => ({ id: b.id, text: b.originalText })),
            }),
          });
          if (!r.ok) throw new Error(`Cloud proxy HTTP ${r.status}`);
          const data = await r.json();
          if (Array.isArray(data?.translations)) {
            for (const item of data.translations) {
              if (item?.id && typeof item?.translatedText === 'string') {
                resultMap.set(item.id, item.translatedText);
              }
            }
          }
          completed += batch.length;
          onProgress?.(Math.min(completed, blocks.length), blocks.length);
        })
      );

      if (resultMap.size > 0) {
        return resultMap;
      }
    } catch (proxyErr) {
      console.warn('Cloud AI proxy unavailable, falling back to fast Google Translate:', proxyErr);
    }
  }

  return await translateWithGoogleFree(blocks, sourceLang, targetLang, onProgress);
}

/**
 * Compresses a rendered page DataURL to an optimized JPEG (~1560px max dimension)
 * for fast multimodal upload to Gemini Vision.
 */
async function compressPageImageForVision(
  dataUrl: string,
  maxDim: number = 1560
): Promise<{ base64: string; mimeType: 'image/jpeg' }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Không thể đọc ảnh trang để quét OCR.'));
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const w = Math.max(64, Math.round(img.width * scale));
      const h = Math.max(64, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const jpegUrl = canvas.toDataURL('image/jpeg', 0.86);
      const base64 = jpegUrl.split(',')[1] || '';
      resolve({ base64, mimeType: 'image/jpeg' });
    };
    img.src = dataUrl;
  });
}

/**
 * Runs Multimodal Gemini Vision OCR + 2D Bounding Box Detection + Translation
 * for image-based / Canva / poster / scanned PDF pages that have 0 text layer items.
 */
export async function visionOcrAndTranslatePage(options: {
  backgroundDataUrl: string;
  sourceLang: string;
  targetLang: string;
  engine: TranslationEngine;
  apiKey?: string;
}): Promise<VisionDetectedBox[]> {
  const { backgroundDataUrl, sourceLang, targetLang, engine, apiKey } = options;
  const { base64, mimeType } = await compressPageImageForVision(backgroundDataUrl);

  const targetLangName = getLanguageLabel(targetLang);
  const sourceLangName =
    sourceLang === 'auto' ? 'Auto-detect language' : getLanguageLabel(sourceLang);
  const modelToUse: 'gemini-3.8-flash' | 'gemini-3.5-flash-lite' =
    engine === 'gemini-3.5-flash-lite' ? 'gemini-3.5-flash-lite' : 'gemini-3.8-flash';

  // 1. If user entered their own Gemini API Key in the UI, call @google/genai directly in browser
  if (apiKey && apiKey.trim()) {
    const client = new GoogleGenAI({ apiKey: apiKey.trim() });
    const systemInstruction = `You are an expert visual PDF/poster OCR layout detector and translator from ${sourceLangName} into ${targetLangName}.
Detect every translatable text block/caption/heading in the document image and return tight 2D bounding boxes normalized to 0-1000 (ymin, xmin, ymax, xmax).
CRITICAL LAYOUT RULES:
1. Wrap each bounding box TIGHTLY around ONLY the text characters — NEVER include adjacent decorative icons, illustrations, boats, trees, teapots, or borders inside the box.
2. Group multi-line phrases that belong to the same small caption/card slot into ONE single block (using newline '\\n' in originalText/translatedText if multi-line), but NEVER merge across separate columns or separate cards.
3. SKIP standalone clock times (e.g. '16:00', '17:00', '19:00', '21:30') or pure numeric date ranges (e.g. '24/12/2026 - 31/12/2026') that contain no words needing translation, so original decorative numbers and icons remain untouched.
4. Translate naturally and concisely into ${targetLangName} so the translated text fits cleanly inside the exact same visual box.
5. Set align to 'center', 'left', or 'right' matching the visual alignment of that text block, and isBold=true for headings/bold labels.`;

    const interaction = await client.interactions.create({
      model: modelToUse,
      store: false,
      system_instruction: systemInstruction,
      input: [
        {
          type: 'image',
          data: base64,
          mime_type: mimeType,
        },
        {
          type: 'text',
          text: `Detect all translatable text regions in this page and translate them into ${targetLangName}. Return strict JSON.`,
        },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: {
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ymin: { type: 'number' },
                  xmin: { type: 'number' },
                  ymax: { type: 'number' },
                  xmax: { type: 'number' },
                  originalText: { type: 'string' },
                  translatedText: { type: 'string' },
                  align: { type: 'string' },
                  isBold: { type: 'boolean' },
                },
                required: ['ymin', 'xmin', 'ymax', 'xmax', 'originalText', 'translatedText'],
              },
            },
          },
          required: ['blocks'],
        },
      },
    });

    const rawText = (interaction.output_text || '{}')
      .replace(/^```(?:json)?\s*|\s*```$/gi, '')
      .trim();
    const parsed = JSON.parse(rawText) as { blocks?: VisionDetectedBox[] };
    return Array.isArray(parsed.blocks) ? parsed.blocks : [];
  }

  // 2. Zero-key Cloud AI Vision OCR via Daiichi AI server
  const res = await fetch(`${CLOUD_AI_PROXY_BASE}/api/pdf-studio/vision-ocr-translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_base64: base64,
      mime_type: mimeType,
      source_lang: sourceLangName,
      target_lang: targetLangName,
      model: modelToUse,
    }),
  });

  if (!res.ok) {
    let errDetail = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error) errDetail = errJson.error;
    } catch {
      // ignore
    }
    throw new Error(
      `Không thể quét OCR tự động (${errDetail}). Bạn có thể bấm nút "API Key" ở thanh trên để nhập Gemini API Key trực tiếp.`
    );
  }

  const data = await res.json();
  return Array.isArray(data?.blocks) ? data.blocks : [];
}

