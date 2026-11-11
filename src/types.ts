export interface TextBlock {
  id: string;
  pageIndex: number;
  // Current position & size (in page coordinate points at base scale)
  x: number;
  y: number;
  width: number;
  height: number;
  // Original bounding box on the PDF page (used to mask/erase original text cleanly)
  origX: number;
  origY: number;
  origWidth: number;
  origHeight: number;
  originalText: string;
  translatedText: string;
  fontSize: number;
  originalFontSize: number;
  autoFit: boolean;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  backgroundColor: string;
  bgOpacity: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number;
  padding: number;
  visible: boolean;
  isTranslated: boolean;
}

export interface ImageBlock {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  // If extracted or snipped from the PDF page, stores original coordinates so moving/deleting it masks the old spot
  origX?: number;
  origY?: number;
  origWidth?: number;
  origHeight?: number;
  maskBgColor?: string;
  dataUrl: string;
  opacity: number;
  rotation: number;
  borderRadius: number;
  brightness: number;
  contrast: number;
  visible: boolean;
  aspectLocked: boolean;
  label: string;
}

export interface PageData {
  pageIndex: number;
  width: number;
  height: number;
  backgroundDataUrl: string;
  textBlocks: TextBlock[];
  imageBlocks: ImageBlock[];
}

export type TranslationEngine =
  | 'gemini-3.8-flash'
  | 'gemini-3.5-flash-lite'
  | 'google-free';

export type ViewMode = 'translated' | 'split' | 'original';

export type ActiveTool = 'select' | 'snip-image' | 'add-text';

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'auto', name: 'Tự động nhận diện', flag: '✨' },
  { code: 'vi', name: 'Tiếng Việt (Vietnamese)', flag: '🇻🇳' },
  { code: 'en', name: 'Tiếng Anh (English)', flag: '🇺🇸' },
  { code: 'ja', name: 'Tiếng Nhật (Japanese)', flag: '🇯🇵' },
  { code: 'ko', name: 'Tiếng Hàn (Korean)', flag: '🇰🇷' },
  { code: 'zh-CN', name: 'Tiếng Trung Giản Thể (Simplified Chinese)', flag: '🇨🇳' },
  { code: 'zh-TW', name: 'Tiếng Trung Phồn Thể (Traditional Chinese)', flag: '🇹🇼' },
  { code: 'fr', name: 'Tiếng Pháp (French)', flag: '🇫🇷' },
  { code: 'de', name: 'Tiếng Đức (German)', flag: '🇩🇪' },
  { code: 'es', name: 'Tiếng Tây Ban Nha (Spanish)', flag: '🇪🇸' },
  { code: 'ru', name: 'Tiếng Nga (Russian)', flag: '🇷🇺' },
  { code: 'th', name: 'Tiếng Thái (Thai)', flag: '🇹🇭' },
  { code: 'id', name: 'Tiếng Indonesia (Indonesian)', flag: '🇮🇩' },
];

export const AVAILABLE_FONTS = [
  { value: 'Inter, sans-serif', label: 'Inter (Hiện đại / Mặc định)' },
  { value: 'Roboto, sans-serif', label: 'Roboto (Chuẩn tài liệu)' },
  { value: '"Noto Sans", sans-serif', label: 'Noto Sans (Đa ngôn ngữ CJK/Việt)' },
  { value: '"Noto Serif", serif', label: 'Noto Serif (Sách / Học thuật)' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman (Hành chính)' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial (Cơ bản)' },
];

