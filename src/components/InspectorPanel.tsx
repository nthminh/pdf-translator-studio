import React, { useRef } from 'react';
import {
  TextBlock,
  ImageBlock,
  PageData,
  AVAILABLE_FONTS,
} from '../types';
import { fitTextBlock } from '../utils/autoFit';
import {
  Sparkles,
  Type,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
  Copy,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Lock,
  Unlock,
  Upload,
  Eye,
  EyeOff,
  Sliders,
  Layers,
} from 'lucide-react';

interface InspectorPanelProps {
  page: PageData | null;
  selectedTextBlock: TextBlock | null;
  selectedImageBlock: ImageBlock | null;
  onSelectText: (id: string | null) => void;
  onSelectImage: (id: string | null) => void;
  onUpdateTextBlock: (id: string, patch: Partial<TextBlock>) => void;
  onDeleteTextBlock: (id: string) => void;
  onDuplicateTextBlock: (id: string) => void;
  onUpdateImageBlock: (id: string, patch: Partial<ImageBlock>) => void;
  onDeleteImageBlock: (id: string) => void;
  onDuplicateImageBlock: (id: string) => void;
  onAutoAlignPage: () => void;
  onScaleAllFonts: (factor: number) => void;
  onApplyGlobalFont: (fontFamily: string) => void;
  onUploadNewImage: (file: File) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  page,
  selectedTextBlock,
  selectedImageBlock,
  onSelectText,
  onSelectImage,
  onUpdateTextBlock,
  onDeleteTextBlock,
  onDuplicateTextBlock,
  onUpdateImageBlock,
  onDeleteImageBlock,
  onDuplicateImageBlock,
  onAutoAlignPage,
  onScaleAllFonts,
  onApplyGlobalFont,
  onUploadNewImage,
}) => {
  const replaceImgInputRef = useRef<HTMLInputElement>(null);
  const addImgInputRef = useRef<HTMLInputElement>(null);

  if (!page) {
    return (
      <aside className="w-80 bg-slate-900 border-l border-slate-800 p-5 flex flex-col justify-center items-center text-center text-slate-400">
        <Sliders className="w-10 h-10 text-slate-600 mb-3" />
        <p className="text-sm font-medium text-slate-300">Bảng điều khiển bố cục</p>
        <p className="text-xs mt-1">
          Tải file PDF hoặc mở tài liệu mẫu để tùy chỉnh văn bản và hình ảnh.
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-y-auto select-none">
      {/* CASE 1: Selected Text Block */}
      {selectedTextBlock && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                <Type className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Chỉnh sửa Khung Chữ
                </h3>
                <p className="text-[11px] text-slate-400">
                  Cỡ gốc: {selectedTextBlock.originalFontSize}pt • Hiện tại:{' '}
                  <span className="text-indigo-400 font-semibold">
                    {selectedTextBlock.fontSize}pt
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                title="Nhân bản"
                onClick={() => onDuplicateTextBlock(selectedTextBlock.id)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                title="Xóa khung chữ"
                onClick={() => onDeleteTextBlock(selectedTextBlock.id)}
                className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Original vs Translated Text */}
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Nội dung gốc (Original)
              </label>
              <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-400 max-h-20 overflow-y-auto select-text">
                {selectedTextBlock.originalText || '(Trống)'}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-indigo-300 mb-1">
                Nội dung hiển thị / Bản dịch (Chỉnh sửa trực tiếp)
              </label>
              <textarea
                rows={4}
                value={selectedTextBlock.translatedText}
                onChange={(e) => {
                  const val = e.target.value;
                  if (selectedTextBlock.autoFit) {
                    const fitted = fitTextBlock({
                      ...selectedTextBlock,
                      translatedText: val,
                    });
                    onUpdateTextBlock(selectedTextBlock.id, {
                      translatedText: val,
                      fontSize: fitted.fontSize,
                    });
                  } else {
                    onUpdateTextBlock(selectedTextBlock.id, { translatedText: val });
                  }
                }}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 focus:border-indigo-500 focus:outline-none p-2.5 text-xs text-slate-100 leading-relaxed"
              />
            </div>
          </div>

          {/* Auto-Fit Font Control */}
          <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-indigo-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTextBlock.autoFit}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked) {
                      const fitted = fitTextBlock({
                        ...selectedTextBlock,
                        autoFit: true,
                      });
                      onUpdateTextBlock(selectedTextBlock.id, {
                        autoFit: true,
                        fontSize: fitted.fontSize,
                      });
                    } else {
                      onUpdateTextBlock(selectedTextBlock.id, { autoFit: false });
                    }
                  }}
                  className="rounded border-slate-600 text-indigo-500 focus:ring-indigo-500"
                />
                <span>Tự động co giãn chữ vừa khung</span>
              </label>
              <button
                onClick={() => {
                  const fitted = fitTextBlock({ ...selectedTextBlock, autoFit: true });
                  onUpdateTextBlock(selectedTextBlock.id, {
                    fontSize: fitted.fontSize,
                    autoFit: true,
                  });
                }}
                className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[11px] font-medium text-white flex items-center gap-1 shadow"
              >
                <Sparkles className="w-3 h-3" />
                Vừa khít ngay
              </button>
            </div>
          </div>

          {/* Font Size Slider & Stepper */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                Kích thước chữ (Font Size)
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min={5}
                  max={96}
                  value={selectedTextBlock.fontSize}
                  onChange={(e) =>
                    onUpdateTextBlock(selectedTextBlock.id, {
                      fontSize: Math.max(5, Number(e.target.value) || 10),
                      autoFit: false,
                    })
                  }
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right text-xs text-indigo-300 font-mono"
                />
                <span className="text-xs text-slate-500">pt</span>
              </div>
            </div>
            <input
              type="range"
              min={6}
              max={64}
              step={0.5}
              value={selectedTextBlock.fontSize}
              onChange={(e) =>
                onUpdateTextBlock(selectedTextBlock.id, {
                  fontSize: Number(e.target.value),
                  autoFit: false,
                })
              }
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                onClick={() =>
                  onUpdateTextBlock(selectedTextBlock.id, {
                    fontSize: Math.max(5, Number((selectedTextBlock.fontSize - 1).toFixed(1))),
                    autoFit: false,
                  })
                }
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200"
              >
                -1 pt
              </button>
              <button
                onClick={() =>
                  onUpdateTextBlock(selectedTextBlock.id, {
                    fontSize: selectedTextBlock.originalFontSize,
                    autoFit: false,
                  })
                }
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300"
              >
                Gốc ({selectedTextBlock.originalFontSize}pt)
              </button>
              <button
                onClick={() =>
                  onUpdateTextBlock(selectedTextBlock.id, {
                    fontSize: Math.min(96, Number((selectedTextBlock.fontSize + 1).toFixed(1))),
                    autoFit: false,
                  })
                }
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200"
              >
                +1 pt
              </button>
            </div>
          </div>

          {/* Font Family & Formatting */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Phông chữ & Định dạng
            </label>
            <select
              value={selectedTextBlock.fontFamily}
              onChange={(e) =>
                onUpdateTextBlock(selectedTextBlock.id, {
                  fontFamily: e.target.value,
                })
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {AVAILABLE_FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 pt-1">
              <button
                onClick={() =>
                  onUpdateTextBlock(selectedTextBlock.id, {
                    fontWeight:
                      selectedTextBlock.fontWeight === 'bold' ? 'normal' : 'bold',
                  })
                }
                className={`flex-1 py-1.5 rounded-lg border text-xs flex justify-center items-center gap-1 ${
                  selectedTextBlock.fontWeight === 'bold'
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Bold className="w-3.5 h-3.5" /> Đậm
              </button>
              <button
                onClick={() =>
                  onUpdateTextBlock(selectedTextBlock.id, {
                    fontStyle:
                      selectedTextBlock.fontStyle === 'italic' ? 'normal' : 'italic',
                  })
                }
                className={`flex-1 py-1.5 rounded-lg border text-xs flex justify-center items-center gap-1 ${
                  selectedTextBlock.fontStyle === 'italic'
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Italic className="w-3.5 h-3.5" /> Nghiêng
              </button>
            </div>

            {/* Alignment */}
            <div className="grid grid-cols-4 gap-1 pt-1">
              {(
                [
                  { align: 'left', icon: AlignLeft, label: 'Trái' },
                  { align: 'center', icon: AlignCenter, label: 'Giữa' },
                  { align: 'right', icon: AlignRight, label: 'Phải' },
                  { align: 'justify', icon: AlignJustify, label: 'Đều' },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = selectedTextBlock.textAlign === item.align;
                return (
                  <button
                    key={item.align}
                    onClick={() =>
                      onUpdateTextBlock(selectedTextBlock.id, {
                        textAlign: item.align,
                      })
                    }
                    className={`py-1.5 rounded-lg border text-xs flex flex-col items-center gap-0.5 ${
                      active
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[10px]">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Colors & Background Opacity */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Màu chữ
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                <input
                  type="color"
                  value={selectedTextBlock.color}
                  onChange={(e) =>
                    onUpdateTextBlock(selectedTextBlock.id, { color: e.target.value })
                  }
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs font-mono text-slate-300">
                  {selectedTextBlock.color}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Màu nền che chữ gốc
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                <input
                  type="color"
                  value={selectedTextBlock.backgroundColor}
                  onChange={(e) =>
                    onUpdateTextBlock(selectedTextBlock.id, {
                      backgroundColor: e.target.value,
                    })
                  }
                  className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                />
                <span className="text-xs font-mono text-slate-300">
                  {selectedTextBlock.backgroundColor}
                </span>
              </div>
            </div>
          </div>

          {/* Line Height & Background Opacity */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Giãn dòng (Line Height)</span>
              <span className="font-mono text-slate-200">
                {selectedTextBlock.lineHeight.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0.95}
              max={2.0}
              step={0.05}
              value={selectedTextBlock.lineHeight}
              onChange={(e) =>
                onUpdateTextBlock(selectedTextBlock.id, {
                  lineHeight: Number(e.target.value),
                })
              }
              className="w-full accent-indigo-500"
            />

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-400">Độ đục nền khung chữ</span>
              <span className="font-mono text-slate-200">
                {Math.round(selectedTextBlock.bgOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selectedTextBlock.bgOpacity}
              onChange={(e) =>
                onUpdateTextBlock(selectedTextBlock.id, {
                  bgOpacity: Number(e.target.value),
                })
              }
              className="w-full accent-indigo-500"
            />
          </div>

          {/* Position & Dimensions */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                Vị trí & Kích thước Khung
              </span>
              <button
                onClick={() =>
                  onUpdateTextBlock(selectedTextBlock.id, {
                    x: selectedTextBlock.origX,
                    y: selectedTextBlock.origY,
                    width: selectedTextBlock.origWidth,
                    height: selectedTextBlock.origHeight,
                  })
                }
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Về vị trí gốc
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                <span className="text-slate-500">X:</span>
                <input
                  type="number"
                  value={Math.round(selectedTextBlock.x)}
                  onChange={(e) =>
                    onUpdateTextBlock(selectedTextBlock.id, {
                      x: Number(e.target.value) || 0,
                    })
                  }
                  className="w-16 bg-transparent text-right text-slate-200 focus:outline-none"
                />
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                <span className="text-slate-500">Y:</span>
                <input
                  type="number"
                  value={Math.round(selectedTextBlock.y)}
                  onChange={(e) =>
                    onUpdateTextBlock(selectedTextBlock.id, {
                      y: Number(e.target.value) || 0,
                    })
                  }
                  className="w-16 bg-transparent text-right text-slate-200 focus:outline-none"
                />
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                <span className="text-slate-500">Rộng:</span>
                <input
                  type="number"
                  value={Math.round(selectedTextBlock.width)}
                  onChange={(e) =>
                    onUpdateTextBlock(selectedTextBlock.id, {
                      width: Math.max(20, Number(e.target.value) || 20),
                    })
                  }
                  className="w-16 bg-transparent text-right text-slate-200 focus:outline-none"
                />
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                <span className="text-slate-500">Cao:</span>
                <input
                  type="number"
                  value={Math.round(selectedTextBlock.height)}
                  onChange={(e) =>
                    onUpdateTextBlock(selectedTextBlock.id, {
                      height: Math.max(14, Number(e.target.value) || 14),
                    })
                  }
                  className="w-16 bg-transparent text-right text-slate-200 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CASE 2: Selected Image Block */}
      {selectedImageBlock && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  Căn chỉnh Hình Ảnh
                </h3>
                <p className="text-[11px] text-slate-400">
                  Kích thước: {Math.round(selectedImageBlock.width)} ×{' '}
                  {Math.round(selectedImageBlock.height)} px
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                title="Nhân bản ảnh"
                onClick={() => onDuplicateImageBlock(selectedImageBlock.id)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                title="Xóa ảnh"
                onClick={() => onDeleteImageBlock(selectedImageBlock.id)}
                className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Scale Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Co giãn nhanh kích thước ảnh
              </label>
              <button
                onClick={() =>
                  onUpdateImageBlock(selectedImageBlock.id, {
                    aspectLocked: !selectedImageBlock.aspectLocked,
                  })
                }
                className={`text-[11px] flex items-center gap-1 px-2 py-0.5 rounded ${
                  selectedImageBlock.aspectLocked
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {selectedImageBlock.aspectLocked ? (
                  <>
                    <Lock className="w-3 h-3" /> Giữ tỷ lệ
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3" /> Tự do
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1">
              {[
                { label: '-25%', factor: 0.75 },
                { label: '-10%', factor: 0.9 },
                { label: 'Gốc', factor: 0 },
                { label: '+10%', factor: 1.1 },
                { label: '+25%', factor: 1.25 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => {
                    if (btn.factor === 0) {
                      onUpdateImageBlock(selectedImageBlock.id, {
                        x: selectedImageBlock.origX ?? selectedImageBlock.x,
                        y: selectedImageBlock.origY ?? selectedImageBlock.y,
                        width: selectedImageBlock.origWidth ?? selectedImageBlock.width,
                        height: selectedImageBlock.origHeight ?? selectedImageBlock.height,
                        rotation: 0,
                      });
                    } else {
                      onUpdateImageBlock(selectedImageBlock.id, {
                        width: Math.max(24, Math.round(selectedImageBlock.width * btn.factor)),
                        height: Math.max(24, Math.round(selectedImageBlock.height * btn.factor)),
                      });
                    }
                  }}
                  className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-200"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Width, Height, X, Y Inputs */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
              <span className="text-slate-500">Rộng:</span>
              <input
                type="number"
                value={Math.round(selectedImageBlock.width)}
                onChange={(e) => {
                  const nw = Math.max(20, Number(e.target.value) || 20);
                  const ratio =
                    selectedImageBlock.height / Math.max(1, selectedImageBlock.width);
                  onUpdateImageBlock(selectedImageBlock.id, {
                    width: nw,
                    height: selectedImageBlock.aspectLocked
                      ? Math.round(nw * ratio)
                      : selectedImageBlock.height,
                  });
                }}
                className="w-16 bg-transparent text-right text-emerald-300 font-mono focus:outline-none"
              />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
              <span className="text-slate-500">Cao:</span>
              <input
                type="number"
                value={Math.round(selectedImageBlock.height)}
                onChange={(e) => {
                  const nh = Math.max(20, Number(e.target.value) || 20);
                  const ratio =
                    selectedImageBlock.width / Math.max(1, selectedImageBlock.height);
                  onUpdateImageBlock(selectedImageBlock.id, {
                    height: nh,
                    width: selectedImageBlock.aspectLocked
                      ? Math.round(nh * ratio)
                      : selectedImageBlock.width,
                  });
                }}
                className="w-16 bg-transparent text-right text-emerald-300 font-mono focus:outline-none"
              />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
              <span className="text-slate-500">Vị trí X:</span>
              <input
                type="number"
                value={Math.round(selectedImageBlock.x)}
                onChange={(e) =>
                  onUpdateImageBlock(selectedImageBlock.id, {
                    x: Number(e.target.value) || 0,
                  })
                }
                className="w-16 bg-transparent text-right text-slate-200 font-mono focus:outline-none"
              />
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
              <span className="text-slate-500">Vị trí Y:</span>
              <input
                type="number"
                value={Math.round(selectedImageBlock.y)}
                onChange={(e) =>
                  onUpdateImageBlock(selectedImageBlock.id, {
                    y: Number(e.target.value) || 0,
                  })
                }
                className="w-16 bg-transparent text-right text-slate-200 font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* Rotation, Border Radius, Opacity, Brightness, Contrast */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Góc xoay (Rotation)</span>
              <span className="font-mono text-slate-200">
                {selectedImageBlock.rotation}°
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={selectedImageBlock.rotation}
              onChange={(e) =>
                onUpdateImageBlock(selectedImageBlock.id, {
                  rotation: Number(e.target.value),
                })
              }
              className="w-full accent-emerald-500"
            />

            <div className="flex justify-between">
              <span className="text-slate-400">Bo tròn góc (Border Radius)</span>
              <span className="font-mono text-slate-200">
                {selectedImageBlock.borderRadius} px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={48}
              step={1}
              value={selectedImageBlock.borderRadius}
              onChange={(e) =>
                onUpdateImageBlock(selectedImageBlock.id, {
                  borderRadius: Number(e.target.value),
                })
              }
              className="w-full accent-emerald-500"
            />

            <div className="flex justify-between">
              <span className="text-slate-400">Độ sáng (Brightness)</span>
              <span className="font-mono text-slate-200">
                {selectedImageBlock.brightness}%
              </span>
            </div>
            <input
              type="range"
              min={40}
              max={160}
              step={2}
              value={selectedImageBlock.brightness}
              onChange={(e) =>
                onUpdateImageBlock(selectedImageBlock.id, {
                  brightness: Number(e.target.value),
                })
              }
              className="w-full accent-emerald-500"
            />

            <div className="flex justify-between">
              <span className="text-slate-400">Độ tương phản (Contrast)</span>
              <span className="font-mono text-slate-200">
                {selectedImageBlock.contrast}%
              </span>
            </div>
            <input
              type="range"
              min={40}
              max={160}
              step={2}
              value={selectedImageBlock.contrast}
              onChange={(e) =>
                onUpdateImageBlock(selectedImageBlock.id, {
                  contrast: Number(e.target.value),
                })
              }
              className="w-full accent-emerald-500"
            />

            <div className="flex justify-between">
              <span className="text-slate-400">Độ hiển thị (Opacity)</span>
              <span className="font-mono text-slate-200">
                {Math.round(selectedImageBlock.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={selectedImageBlock.opacity}
              onChange={(e) =>
                onUpdateImageBlock(selectedImageBlock.id, {
                  opacity: Number(e.target.value),
                })
              }
              className="w-full accent-emerald-500"
            />
          </div>

          {/* Replace Image Button */}
          <div className="pt-2 border-t border-slate-800">
            <input
              ref={replaceImgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    onUpdateImageBlock(selectedImageBlock.id, {
                      dataUrl: reader.result,
                    });
                  }
                };
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => replaceImgInputRef.current?.click()}
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-emerald-300 flex items-center justify-center gap-2 border border-slate-700"
            >
              <Upload className="w-3.5 h-3.5" />
              Thay thế bằng hình ảnh khác từ máy
            </button>
          </div>
        </div>
      )}

      {/* CASE 3: Global Page Overview & Batch Layout Tools */}
      {!selectedTextBlock && !selectedImageBlock && (
        <div className="p-4 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Tự Động Căn Chỉnh Toàn Trang
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Tự động đo kích thước từng khung văn bản, căn thẳng lề cột và điều chỉnh cỡ chữ vừa khít không bị tràn.
            </p>
            <button
              onClick={onAutoAlignPage}
              className="mt-3 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-semibold text-white shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition"
            >
              <Sparkles className="w-4 h-4" />
              Tự động Căn Chỉnh & Co Giãn Chữ
            </button>
          </div>

          {/* Batch Font Size Scaling */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <label className="block text-xs font-medium text-slate-300">
              Co giãn cỡ chữ toàn trang cùng lúc
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => onScaleAllFonts(0.9)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-200 font-medium"
              >
                -10%
              </button>
              <button
                onClick={() => onScaleAllFonts(0.95)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-200 font-medium"
              >
                -5%
              </button>
              <button
                onClick={() => onScaleAllFonts(1.05)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-200 font-medium"
              >
                +5%
              </button>
              <button
                onClick={() => onScaleAllFonts(1.1)}
                className="py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-200 font-medium"
              >
                +10%
              </button>
            </div>
          </div>

          {/* Global Font Selector */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <label className="block text-xs font-medium text-slate-300">
              Đổi phông chữ đồng loạt cho trang
            </label>
            <select
              onChange={(e) => {
                if (e.target.value) onApplyGlobalFont(e.target.value);
              }}
              defaultValue=""
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="" disabled>
                -- Chọn phông chữ áp dụng toàn trang --
              </option>
              {AVAILABLE_FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Add New Image to Page */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <label className="block text-xs font-medium text-slate-300">
              Chèn thêm hình ảnh / logo vào trang
            </label>
            <input
              ref={addImgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadNewImage(file);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => addImgInputRef.current?.click()}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-medium text-emerald-300 flex items-center justify-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              Tải ảnh từ máy lên trang PDF
            </button>
          </div>

          {/* Layer List (Images + Text Blocks) */}
          <div className="space-y-2 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Danh sách thành phần ({page.imageBlocks.length + page.textBlocks.length})
              </span>
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {page.imageBlocks.map((img) => (
                <div
                  key={img.id}
                  onClick={() => {
                    onSelectImage(img.id);
                    onSelectText(null);
                  }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/70 hover:bg-slate-800 border border-slate-800/80 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate text-slate-200">{img.label}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateImageBlock(img.id, { visible: !img.visible });
                    }}
                    className="text-slate-400 hover:text-white p-0.5"
                  >
                    {img.visible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                    )}
                  </button>
                </div>
              ))}

              {page.textBlocks.map((tb, idx) => (
                <div
                  key={tb.id}
                  onClick={() => {
                    onSelectText(tb.id);
                    onSelectImage(null);
                  }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/70 hover:bg-slate-800 border border-slate-800/80 cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Type className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate text-slate-300">
                      {idx + 1}. {tb.translatedText || tb.originalText}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-indigo-400 shrink-0 ml-1">
                    {tb.fontSize}pt
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

