import { GoogleGenAI } from '@google/genai';
import { TextBlock, TranslationEngine, SUPPORTED_LANGUAGES } from '../types';

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
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        'Vui lòng nhập Gemini API Key ở thanh công cụ phía trên (hoặc chuyển sang chế độ "Google Translate Nhanh (Miễn phí)" để dịch ngay không cần Key).'
      );
    }
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

  return await translateWithGoogleFree(blocks, sourceLang, targetLang, onProgress);
}

