import React, { useState, useEffect, useRef } from 'react';
import {
  PageData,
  TextBlock,
  ImageBlock,
  TranslationEngine,
  ViewMode,
  ActiveTool,
  SUPPORTED_LANGUAGES,
} from './types';
import {
  parsePdfFile,
  createSampleDocumentPages,
  snipImageRegionFromPage,
  exportPagesToPdf,
} from './services/pdfService';
import { translateTextBlocks } from './services/translationService';
import { fitTextBlock, autoAlignAndFitPage } from './utils/autoFit';
import { PageCanvasEditor } from './components/PageCanvasEditor';
import { InspectorPanel } from './components/InspectorPanel';
import {
  FileUp,
  Sparkles,
  Download,
  Languages,
  ZoomIn,
  ZoomOut,
  MousePointer,
  Scissors,
  Type,
  Columns,
  Eye,
  KeyRound,
  CheckCircle2,
  Loader2,
  FileText,
  Wand2,
  RotateCcw,
  BoxSelect,
} from 'lucide-react';

export const App: React.FC = () => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0);
  const [documentName, setDocumentName] = useState<string>('Sample-AI-Report-2026.pdf');

  // Selection states
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  // Translation settings
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('vi');
  const [engine, setEngine] = useState<TranslationEngine>('gemini-3.8-flash');
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem('GEMINI_API_KEY') || ''
  );
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [autoFitOnTranslate, setAutoFitOnTranslate] = useState<boolean>(true);
  const [mergeParagraphsOnLoad, setMergeParagraphsOnLoad] = useState<boolean>(true);

  // Editor & Viewport settings
  const [zoom, setZoom] = useState<number>(1.05);
  const [viewMode, setViewMode] = useState<ViewMode>('translated');
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);

  // Status & Progress
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [lastStats, setLastStats] = useState<string>('Sẵn sàng dịch siêu tốc');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sample PDF on initial startup so the user can test immediately
  useEffect(() => {
    const sample = createSampleDocumentPages();
    setPages(sample);
    setCurrentPageIdx(0);
  }, []);

  const currentPage = pages[currentPageIdx] || null;

  const selectedTextBlock =
    currentPage?.textBlocks.find((b) => b.id === selectedTextId) || null;
  const selectedImageBlock =
    currentPage?.imageBlocks.find((b) => b.id === selectedImageId) || null;

  const handleSaveApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('GEMINI_API_KEY', val);
  };

  // Upload & Parse PDF
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsBusy(true);
    setStatusMessage('Đang phân tích bố cục, phông chữ & màu nền PDF...');
    setSelectedTextId(null);
    setSelectedImageId(null);

    try {
      const parsedPages = await parsePdfFile(
        file,
        mergeParagraphsOnLoad,
        (cur, total) => {
          setStatusMessage(`Đang trích xuất trang ${cur}/${total}...`);
        }
      );
      setPages(parsedPages);
      setCurrentPageIdx(0);
      setDocumentName(file.name);
      const totalBlocks = parsedPages.reduce((acc, p) => acc + p.textBlocks.length, 0);
      setLastStats(`Đã tải ${parsedPages.length} trang (${totalBlocks} khung văn bản)`);
    } catch (err: any) {
      alert('Không thể đọc file PDF: ' + (err?.message || String(err)));
    } finally {
      setIsBusy(false);
      setStatusMessage('');
      e.target.value = '';
    }
  };

  // Translate Current Page or All Pages
  const handleTranslate = async (allPages: boolean = true) => {
    if (pages.length === 0) return;

    const targetPages = allPages ? pages : currentPage ? [currentPage] : [];
    const allBlocks = targetPages.flatMap((p) => p.textBlocks);
    if (allBlocks.length === 0) return;

    // If user chose Gemini engine but hasn't entered an API key yet, automatically use Google Free with a helpful note or let them enter key
    let effectiveEngine: TranslationEngine = engine;
    if (
      (engine === 'gemini-3.8-flash' || engine === 'gemini-3.5-flash-lite') &&
      !apiKey.trim()
    ) {
      effectiveEngine = 'google-free';
    }

    setIsBusy(true);
    const startTime = performance.now();
    setStatusMessage(`Đang dịch ${allBlocks.length} khung văn bản...`);

    try {
      const translatedMap = await translateTextBlocks({
        blocks: allBlocks,
        sourceLang,
        targetLang,
        engine: effectiveEngine,
        apiKey,
        keepConciseForLayout: autoFitOnTranslate,
        onProgress: (done, total) => {
          setStatusMessage(`Đang dịch siêu tốc: ${done}/${total} đoạn...`);
        },
      });

      setPages((prevPages) =>
        prevPages.map((p) => {
          const isTargetPage = allPages || p.pageIndex === currentPageIdx;
          if (!isTargetPage) return p;

          const updatedBlocks = p.textBlocks.map((tb) => {
            const newText = translatedMap.get(tb.id);
            if (!newText) return tb;
            const updatedTb: TextBlock = {
              ...tb,
              translatedText: newText,
              isTranslated: true,
            };
            return autoFitOnTranslate || tb.autoFit
              ? fitTextBlock(updatedTb)
              : updatedTb;
          });

          return {
            ...p,
            textBlocks: autoFitOnTranslate
              ? autoAlignAndFitPage(updatedBlocks, p.imageBlocks, p.width, p.height)
              : updatedBlocks,
          };
        })
      );

      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
      const engineBadge =
        effectiveEngine === 'google-free' && engine !== 'google-free'
          ? 'Chế độ Dịch Nhanh (Nhập Gemini Key nếu muốn dùng AI sâu)'
          : effectiveEngine;
      setLastStats(
        `Đã dịch ${allBlocks.length} đoạn trong ${elapsedSec}s (${engineBadge})`
      );
    } catch (err: any) {
      alert('Lỗi khi dịch: ' + (err?.message || String(err)));
    } finally {
      setIsBusy(false);
      setStatusMessage('');
    }
  };

  // Update a single TextBlock on currentPage
  const updateTextBlock = (id: string, patch: Partial<TextBlock>) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          textBlocks: p.textBlocks.map((tb) =>
            tb.id === id ? { ...tb, ...patch } : tb
          ),
        };
      })
    );
  };

  const deleteTextBlock = (id: string) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          textBlocks: p.textBlocks.filter((tb) => tb.id !== id),
        };
      })
    );
    if (selectedTextId === id) setSelectedTextId(null);
  };

  const duplicateTextBlock = (id: string) => {
    if (!currentPage) return;
    const found = currentPage.textBlocks.find((tb) => tb.id === id);
    if (!found) return;
    const newId = `tb_dup_${Date.now().toString(36)}`;
    const copy: TextBlock = {
      ...found,
      id: newId,
      x: Math.min(currentPage.width - found.width, found.x + 14),
      y: Math.min(currentPage.height - found.height, found.y + 14),
    };
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === currentPageIdx ? { ...p, textBlocks: [...p.textBlocks, copy] } : p
      )
    );
    setSelectedTextId(newId);
  };

  // Update a single ImageBlock on currentPage
  const updateImageBlock = (id: string, patch: Partial<ImageBlock>) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          imageBlocks: p.imageBlocks.map((img) =>
            img.id === id ? { ...img, ...patch } : img
          ),
        };
      })
    );
  };

  const deleteImageBlock = (id: string) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          imageBlocks: p.imageBlocks.filter((img) => img.id !== id),
        };
      })
    );
    if (selectedImageId === id) setSelectedImageId(null);
  };

  const duplicateImageBlock = (id: string) => {
    if (!currentPage) return;
    const found = currentPage.imageBlocks.find((img) => img.id === id);
    if (!found) return;
    const newId = `img_dup_${Date.now().toString(36)}`;
    const copy: ImageBlock = {
      ...found,
      id: newId,
      x: Math.min(currentPage.width - found.width, found.x + 18),
      y: Math.min(currentPage.height - found.height, found.y + 18),
      origX: undefined,
      origY: undefined,
      origWidth: undefined,
      origHeight: undefined,
      label: `${found.label} (Bản sao)`,
    };
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === currentPageIdx ? { ...p, imageBlocks: [...p.imageBlocks, copy] } : p
      )
    );
    setSelectedImageId(newId);
  };

  // Snip a region from the PDF page into an interactive ImageBlock
  const handleSnipImageRect = async (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    if (!currentPage) return;
    try {
      const snipped = await snipImageRegionFromPage(currentPage, rect);
      setPages((prev) =>
        prev.map((p, idx) =>
          idx === currentPageIdx
            ? { ...p, imageBlocks: [...p.imageBlocks, snipped] }
            : p
        )
      );
      setSelectedImageId(snipped.id);
      setSelectedTextId(null);
      setActiveTool('select');
      setLastStats('Đã cắt vùng ảnh thành đối tượng độc lập! Bạn có thể kéo và phóng to/thu nhỏ.');
    } catch (e) {
      console.error(e);
    }
  };

  // Add a custom TextBlock at marquee rect
  const handleCreateTextBlockAt = (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    if (!currentPage) return;
    const newId = `tb_custom_${Date.now().toString(36)}`;
    const newBlock: TextBlock = {
      id: newId,
      pageIndex: currentPageIdx,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(60, Math.round(rect.width)),
      height: Math.max(24, Math.round(rect.height)),
      origX: Math.round(rect.x),
      origY: Math.round(rect.y),
      origWidth: 0,
      origHeight: 0,
      originalText: 'Văn bản mới',
      translatedText: 'Nhập nội dung văn bản tại đây...',
      fontSize: 12,
      originalFontSize: 12,
      autoFit: true,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: '#0f172a',
      backgroundColor: '#ffffff',
      bgOpacity: 0.9,
      textAlign: 'left',
      lineHeight: 1.22,
      padding: 4,
      visible: true,
      isTranslated: true,
    };

    setPages((prev) =>
      prev.map((p, idx) =>
        idx === currentPageIdx
          ? { ...p, textBlocks: [...p.textBlocks, newBlock] }
          : p
      )
    );
    setSelectedTextId(newId);
    setSelectedImageId(null);
    setActiveTool('select');
  };

  // Upload a new image onto the current page
  const handleUploadNewImage = (file: File) => {
    if (!currentPage) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / Math.max(1, img.height);
        const w = Math.min(220, currentPage.width * 0.4);
        const h = Math.round(w / aspect);
        const newImg: ImageBlock = {
          id: `img_upload_${Date.now().toString(36)}`,
          pageIndex: currentPageIdx,
          x: Math.round((currentPage.width - w) / 2),
          y: Math.round((currentPage.height - h) / 2),
          width: w,
          height: h,
          dataUrl,
          opacity: 1,
          rotation: 0,
          borderRadius: 0,
          brightness: 100,
          contrast: 100,
          visible: true,
          aspectLocked: true,
          label: file.name,
        };
        setPages((prev) =>
          prev.map((p, idx) =>
            idx === currentPageIdx
              ? { ...p, imageBlocks: [...p.imageBlocks, newImg] }
              : p
          )
        );
        setSelectedImageId(newImg.id);
        setSelectedTextId(null);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Auto-align & auto-fit all text blocks on current page
  const handleAutoAlignCurrentPage = () => {
    if (!currentPage) return;
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          textBlocks: autoAlignAndFitPage(
            p.textBlocks,
            p.imageBlocks,
            p.width,
            p.height
          ),
        };
      })
    );
    setLastStats('Đã tự động căn chỉnh lề và co giãn cỡ chữ vừa khít toàn trang!');
  };

  // Scale all fonts on current page by factor
  const handleScaleAllFonts = (factor: number) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          textBlocks: p.textBlocks.map((tb) => ({
            ...tb,
            fontSize: Number(
              Math.max(5, Math.min(96, tb.fontSize * factor)).toFixed(1)
            ),
            autoFit: false,
          })),
        };
      })
    );
  };

  // Apply font family to all text blocks on current page
  const handleApplyGlobalFont = (fontFamily: string) => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          textBlocks: p.textBlocks.map((tb) => ({
            ...tb,
            fontFamily,
          })),
        };
      })
    );
  };

  // Reset all translations/positions on current page back to original
  const handleResetPageToOriginal = () => {
    setPages((prev) =>
      prev.map((p, idx) => {
        if (idx !== currentPageIdx) return p;
        return {
          ...p,
          textBlocks: p.textBlocks.map((tb) => ({
            ...tb,
            x: tb.origX,
            y: tb.origY,
            width: tb.origWidth,
            height: tb.origHeight,
            translatedText: tb.originalText,
            fontSize: tb.originalFontSize,
            isTranslated: false,
          })),
        };
      })
    );
    setLastStats('Đã khôi phục trang về văn bản và vị trí gốc.');
  };

  // Export to PDF
  const handleExportPdf = async () => {
    if (pages.length === 0) return;
    setIsBusy(true);
    setStatusMessage('Đang kết xuất file PDF chất lượng cao...');
    try {
      const outName = documentName.replace(/\.pdf$/i, '') + `_${targetLang}.pdf`;
      await exportPagesToPdf(pages, outName, (cur, total) => {
        setStatusMessage(`Đang xuất trang ${cur}/${total}...`);
      });
      setLastStats(`Đã xuất thành công file ${outName}`);
    } catch (err: any) {
      alert('Lỗi khi xuất PDF: ' + (err?.message || String(err)));
    } finally {
      setIsBusy(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* 1. Primary Header Bar */}
      <header className="h-14 bg-slate-900/95 border-b border-slate-800 px-4 flex items-center justify-between gap-3 shrink-0 z-30">
        {/* Brand & File Upload */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-950">
              <Languages className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                PDF Translator Studio
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  AI Layout
                </span>
              </h1>
              <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                {documentName}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 flex items-center gap-1.5 transition"
          >
            <FileUp className="w-3.5 h-3.5 text-indigo-400" />
            Tải PDF Lên
          </button>

          <button
            onClick={() => {
              const sample = createSampleDocumentPages();
              setPages(sample);
              setCurrentPageIdx(0);
              setDocumentName('Sample-AI-Report-2026.pdf');
              setSelectedTextId(null);
              setSelectedImageId(null);
              setLastStats('Đã mở lại tài liệu PDF mẫu.');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 flex items-center gap-1 transition"
            title="Mở tài liệu mẫu có sẵn chữ và biểu đồ để thử nghiệm"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            PDF Mẫu
          </button>
        </div>

        {/* Language & Engine Bar */}
        <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-800 px-2.5 py-1 rounded-xl">
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-slate-900">
                {l.flag} {l.name}
              </option>
            ))}
          </select>

          <span className="text-slate-500 text-xs font-bold">→</span>

          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="bg-indigo-950/60 border border-indigo-500/40 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-200 focus:outline-none cursor-pointer"
          >
            {SUPPORTED_LANGUAGES.filter((l) => l.code !== 'auto').map((l) => (
              <option key={l.code} value={l.code} className="bg-slate-900">
                {l.flag} {l.name}
              </option>
            ))}
          </select>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as TranslationEngine)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="gemini-3.8-flash">⚡ Gemini 3.8 Flash (Thông minh)</option>
            <option value="gemini-3.5-flash-lite">
              🚀 Gemini 3.5 Flash-Lite (Siêu tốc)
            </option>
            <option value="google-free">
              🌐 Google Translate (Miễn phí / Không cần Key)
            </option>
          </select>

          <button
            onClick={() => setShowKeyModal(true)}
            className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 border transition ${
              apiKey.trim()
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Cấu hình Gemini API Key"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">
              {apiKey.trim() ? 'Đã lưu Key' : 'API Key'}
            </span>
          </button>
        </div>

        {/* Translate & Export Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            disabled={isBusy}
            onClick={() => handleTranslate(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-indigo-950/60 flex items-center gap-1.5 transition"
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Dịch Ngay & Tự Căn Chỉnh
          </button>

          <button
            disabled={isBusy}
            onClick={handleExportPdf}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white shadow-lg shadow-emerald-950/60 flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất PDF
          </button>
        </div>
      </header>

      {/* 2. Secondary Studio Toolbar */}
      <div className="h-11 bg-slate-900/70 border-b border-slate-800/80 px-4 flex items-center justify-between gap-4 shrink-0 z-20 text-xs">
        {/* Interactive Canvas Tools */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 mr-1 font-medium">
            Công cụ:
          </span>
          <button
            onClick={() => setActiveTool('select')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium transition ${
              activeTool === 'select'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            Chọn / Kéo thả Chữ & Ảnh
          </button>

          <button
            onClick={() =>
              setActiveTool(activeTool === 'snip-image' ? 'select' : 'snip-image')
            }
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium transition ${
              activeTool === 'snip-image'
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-slate-800/80 text-emerald-300 hover:bg-slate-800 border border-emerald-500/30'
            }`}
            title="Kéo khung chọn bất kỳ hình ảnh/biểu đồ nào trên PDF để di chuyển hoặc phóng to/thu nhỏ"
          >
            <Scissors className="w-3.5 h-3.5" />
            Cắt / Chọn Vùng Ảnh PDF để Co Giãn
          </button>

          <button
            onClick={() =>
              setActiveTool(activeTool === 'add-text' ? 'select' : 'add-text')
            }
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium transition ${
              activeTool === 'add-text'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Thêm Khung Chữ
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            onClick={handleAutoAlignCurrentPage}
            className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 flex items-center gap-1.5 font-medium transition"
            title="Tự động tính toán cỡ chữ vừa khít khung và căn thẳng cột"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Auto-Fit Toàn Trang
          </button>

          <button
            onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 transition ${
              showBoundingBoxes
                ? 'bg-slate-800 text-indigo-300 border border-indigo-500/30'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
            title="Hiện hoặc ẩn đường viền khung văn bản/hình ảnh"
          >
            <BoxSelect className="w-3.5 h-3.5" />
            Viền khung
          </button>

          <button
            onClick={handleResetPageToOriginal}
            className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
            title="Khôi phục trang hiện tại về trạng thái ban đầu"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Khôi phục gốc
          </button>
        </div>

        {/* View Mode & Zoom Controls */}
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-950/70 px-2.5 py-1 rounded-lg border border-slate-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate max-w-[260px]">
              {statusMessage || lastStats}
            </span>
          </div>

          {/* View Mode Selector */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('translated')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                viewMode === 'translated'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Bản dịch
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition ${
                viewMode === 'split'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3 h-3" /> Song song
            </button>
            <button
              onClick={() => setViewMode('original')}
              className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition ${
                viewMode === 'original'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3" /> Bản gốc
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
              className="p-1 hover:bg-slate-800 rounded text-slate-300"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono w-11 text-center text-slate-200">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.1).toFixed(2))))}
              className="p-1 hover:bg-slate-800 rounded text-slate-300"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Contextual Banner when Snip Image or Add Text tool is active */}
      {activeTool !== 'select' && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/40 px-4 py-1.5 text-center text-xs text-emerald-200 flex items-center justify-center gap-3 z-20">
          <span>
            {activeTool === 'snip-image'
              ? '✂️ Chế độ Cắt/Chọn Vùng Ảnh: Nhấn giữ chuột và kéo khung bao quanh bất kỳ hình ảnh/biểu đồ nào trên trang PDF để tách thành đối tượng ảnh có thể di chuyển & phóng to/thu nhỏ.'
              : '📝 Chế độ Thêm Khung Chữ: Nhấn giữ chuột và kéo trên trang PDF để tạo khung văn bản mới.'}
          </span>
          <button
            onClick={() => setActiveTool('select')}
            className="px-2 py-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-white text-[11px]"
          >
            Hủy (ESC)
          </button>
        </div>
      )}

      {/* 3. Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Page Thumbnails & Extraction Options */}
        <aside className="w-44 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Trang ({pages.length})
            </span>
            <label
              className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer"
              title="Gộp các dòng liên tiếp thành đoạn văn khi tải PDF"
            >
              <input
                type="checkbox"
                checked={mergeParagraphsOnLoad}
                onChange={(e) => setMergeParagraphsOnLoad(e.target.checked)}
                className="rounded border-slate-700 text-indigo-500"
              />
              Gộp đoạn
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {pages.map((p, idx) => {
              const active = idx === currentPageIdx;
              const translatedCount = p.textBlocks.filter((b) => b.isTranslated).length;
              return (
                <div
                  key={p.pageIndex}
                  onClick={() => {
                    setCurrentPageIdx(idx);
                    setSelectedTextId(null);
                    setSelectedImageId(null);
                  }}
                  className={`group cursor-pointer rounded-xl p-2 border transition ${
                    active
                      ? 'bg-indigo-950/50 border-indigo-500 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="relative aspect-[1/1.414] w-full bg-white rounded overflow-hidden mb-1.5">
                    <img
                      src={p.backgroundDataUrl}
                      alt={`Thumb ${idx + 1}`}
                      className="w-full h-full object-contain"
                    />
                    {translatedCount > 0 && (
                      <span className="absolute top-1 right-1 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                        Đã dịch
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={`font-medium ${
                        active ? 'text-indigo-300' : 'text-slate-400'
                      }`}
                    >
                      Trang {idx + 1}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {p.textBlocks.length} chữ • {p.imageBlocks.length} ảnh
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center Interactive PDF Canvas Area */}
        <main className="flex-1 bg-slate-950 overflow-auto p-6 flex justify-center items-start relative">
          {isBusy && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl flex flex-col items-center max-w-sm text-center">
                <Loader2 className="w-9 h-9 text-indigo-400 animate-spin mb-3" />
                <p className="text-sm font-semibold text-white">
                  {statusMessage || 'Đang xử lý...'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Hệ thống đang giữ nguyên bố cục và tự động căn chỉnh kích thước phông chữ.
                </p>
              </div>
            </div>
          )}

          {currentPage && (
            <div className="flex items-start gap-6 pb-12">
              {/* If Split View or Original View: Show Original PDF on the Left */}
              {(viewMode === 'split' || viewMode === 'original') && (
                <div className="flex flex-col items-center">
                  <div className="mb-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 font-medium">
                    Bản gốc (Original PDF - Trang {currentPageIdx + 1})
                  </div>
                  <div
                    style={{
                      width: currentPage.width * zoom,
                      height: currentPage.height * zoom,
                    }}
                    className="relative bg-white shadow-2xl rounded-sm overflow-hidden ring-1 ring-slate-800"
                  >
                    <img
                      src={currentPage.backgroundDataUrl}
                      alt="Original PDF Page"
                      className="w-full h-full object-fill"
                    />
                  </div>
                </div>
              )}

              {/* If Translated View or Split View: Show Interactive Canvas Editor */}
              {(viewMode === 'translated' || viewMode === 'split') && (
                <div className="flex flex-col items-center">
                  {viewMode === 'split' && (
                    <div className="mb-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/30 text-xs text-indigo-300 font-medium">
                      Bản dịch & Chỉnh sửa Bố cục (Trang {currentPageIdx + 1})
                    </div>
                  )}
                  <PageCanvasEditor
                    page={currentPage}
                    zoom={zoom}
                    activeTool={activeTool}
                    showBoundingBoxes={showBoundingBoxes}
                    selectedTextId={selectedTextId}
                    selectedImageId={selectedImageId}
                    onSelectText={setSelectedTextId}
                    onSelectImage={setSelectedImageId}
                    onUpdateTextBlock={updateTextBlock}
                    onDeleteTextBlock={deleteTextBlock}
                    onDuplicateTextBlock={duplicateTextBlock}
                    onUpdateImageBlock={updateImageBlock}
                    onDeleteImageBlock={deleteImageBlock}
                    onDuplicateImageBlock={duplicateImageBlock}
                    onSnipImageRect={handleSnipImageRect}
                    onCreateTextBlockAt={handleCreateTextBlockAt}
                  />
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar: Granular Inspector for Text & Images */}
        <InspectorPanel
          page={currentPage}
          selectedTextBlock={selectedTextBlock}
          selectedImageBlock={selectedImageBlock}
          onSelectText={setSelectedTextId}
          onSelectImage={setSelectedImageId}
          onUpdateTextBlock={updateTextBlock}
          onDeleteTextBlock={deleteTextBlock}
          onDuplicateTextBlock={duplicateTextBlock}
          onUpdateImageBlock={updateImageBlock}
          onDeleteImageBlock={deleteImageBlock}
          onDuplicateImageBlock={duplicateImageBlock}
          onAutoAlignPage={handleAutoAlignCurrentPage}
          onScaleAllFonts={handleScaleAllFonts}
          onApplyGlobalFont={handleApplyGlobalFont}
          onUploadNewImage={handleUploadNewImage}
        />
      </div>

      {/* Gemini API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                Cấu hình Gemini API Key
              </h3>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Đóng
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Nhập khóa Gemini API để sử dụng mô hình{' '}
              <code className="text-indigo-300">gemini-3.8-flash</code> hoặc{' '}
              <code className="text-indigo-300">gemini-3.5-flash-lite</code> giúp dịch chuẩn ngữ cảnh chuyên ngành. Nếu để trống, ứng dụng sẽ tự động dùng chế độ Dịch Nhanh Miễn Phí.
            </p>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 focus:border-indigo-500 focus:outline-none px-3 py-2 text-xs text-white font-mono"
            />
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFitOnTranslate}
                  onChange={(e) => setAutoFitOnTranslate(e.target.checked)}
                  className="rounded border-slate-600 text-indigo-500"
                />
                Tự động co giãn cỡ chữ vừa khung khi dịch
              </label>
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

