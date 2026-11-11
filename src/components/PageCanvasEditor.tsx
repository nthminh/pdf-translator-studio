import React, { useState, useRef, useEffect } from 'react';
import {
  PageData,
  TextBlock,
  ImageBlock,
  ActiveTool,
} from '../types';
import { fitTextBlock } from '../utils/autoFit';
import {
  Type,
  Maximize2,
  Trash2,
  RotateCw,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  ZoomIn,
  ZoomOut,
  Sparkles,
} from 'lucide-react';

interface PageCanvasEditorProps {
  page: PageData;
  zoom: number;
  activeTool: ActiveTool;
  showBoundingBoxes: boolean;
  selectedTextId: string | null;
  selectedImageId: string | null;
  onSelectText: (id: string | null) => void;
  onSelectImage: (id: string | null) => void;
  onUpdateTextBlock: (id: string, patch: Partial<TextBlock>) => void;
  onDeleteTextBlock: (id: string) => void;
  onDuplicateTextBlock: (id: string) => void;
  onUpdateImageBlock: (id: string, patch: Partial<ImageBlock>) => void;
  onDeleteImageBlock: (id: string) => void;
  onDuplicateImageBlock: (id: string) => void;
  onSnipImageRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  onCreateTextBlockAt: (rect: { x: number; y: number; width: number; height: number }) => void;
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  kind: 'move-text' | 'resize-text' | 'move-image' | 'resize-image' | 'marquee';
  targetId?: string;
  handle?: HandleDir;
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
  initialW: number;
  initialH: number;
}

export const PageCanvasEditor: React.FC<PageCanvasEditorProps> = ({
  page,
  zoom,
  activeTool,
  showBoundingBoxes,
  selectedTextId,
  selectedImageId,
  onSelectText,
  onSelectImage,
  onUpdateTextBlock,
  onDeleteTextBlock,
  onDuplicateTextBlock,
  onUpdateImageBlock,
  onDeleteImageBlock,
  onDuplicateImageBlock,
  onSnipImageRect,
  onCreateTextBlockAt,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Convert client mouse event to page coordinate space
  const getPageCoords = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragState.startClientX) / zoom;
      const dy = (e.clientY - dragState.startClientY) / zoom;

      if (dragState.kind === 'move-text' && dragState.targetId) {
        const nx = Math.max(0, Math.min(page.width - 20, dragState.initialX + dx));
        const ny = Math.max(0, Math.min(page.height - 14, dragState.initialY + dy));
        onUpdateTextBlock(dragState.targetId, {
          x: Math.round(nx * 10) / 10,
          y: Math.round(ny * 10) / 10,
        });
      } else if (dragState.kind === 'resize-text' && dragState.targetId && dragState.handle) {
        let { initialX: x, initialY: y, initialW: w, initialH: h } = dragState;
        const dir = dragState.handle;

        if (dir.includes('e')) w = Math.max(24, w + dx);
        if (dir.includes('s')) h = Math.max(14, h + dy);
        if (dir.includes('w')) {
          const possibleW = w - dx;
          if (possibleW >= 24) {
            x += dx;
            w = possibleW;
          }
        }
        if (dir.includes('n')) {
          const possibleH = h - dy;
          if (possibleH >= 14) {
            y += dy;
            h = possibleH;
          }
        }

        const targetBlock = page.textBlocks.find((b) => b.id === dragState.targetId);
        if (targetBlock) {
          const updated: TextBlock = {
            ...targetBlock,
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            width: Math.round(w * 10) / 10,
            height: Math.round(h * 10) / 10,
          };
          if (targetBlock.autoFit) {
            const fitted = fitTextBlock(updated);
            onUpdateTextBlock(dragState.targetId, {
              x: fitted.x,
              y: fitted.y,
              width: fitted.width,
              height: fitted.height,
              fontSize: fitted.fontSize,
            });
          } else {
            onUpdateTextBlock(dragState.targetId, {
              x: updated.x,
              y: updated.y,
              width: updated.width,
              height: updated.height,
            });
          }
        }
      } else if (dragState.kind === 'move-image' && dragState.targetId) {
        const nx = Math.max(-dragState.initialW * 0.5, Math.min(page.width - 20, dragState.initialX + dx));
        const ny = Math.max(-dragState.initialH * 0.5, Math.min(page.height - 20, dragState.initialY + dy));
        onUpdateImageBlock(dragState.targetId, {
          x: Math.round(nx),
          y: Math.round(ny),
        });
      } else if (dragState.kind === 'resize-image' && dragState.targetId && dragState.handle) {
        let { initialX: x, initialY: y, initialW: w, initialH: h } = dragState;
        const dir = dragState.handle;
        const imgBlock = page.imageBlocks.find((b) => b.id === dragState.targetId);
        const aspect = w / Math.max(1, h);

        if (dir.includes('e')) w = Math.max(24, w + dx);
        if (dir.includes('s')) h = Math.max(24, h + dy);
        if (dir.includes('w')) {
          const nw = w - dx;
          if (nw >= 24) {
            x += dx;
            w = nw;
          }
        }
        if (dir.includes('n')) {
          const nh = h - dy;
          if (nh >= 24) {
            y += dy;
            h = nh;
          }
        }

        if (imgBlock?.aspectLocked && (dir === 'se' || dir === 'nw' || dir === 'ne' || dir === 'sw')) {
          h = Math.max(24, w / aspect);
        }

        onUpdateImageBlock(dragState.targetId, {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
        });
      } else if (dragState.kind === 'marquee') {
        const curX = dragState.initialX + dx;
        const curY = dragState.initialY + dy;
        const rx = Math.max(0, Math.min(dragState.initialX, curX));
        const ry = Math.max(0, Math.min(dragState.initialY, curY));
        const rw = Math.min(page.width - rx, Math.abs(curX - dragState.initialX));
        const rh = Math.min(page.height - ry, Math.abs(curY - dragState.initialY));
        setMarqueeRect({ x: rx, y: ry, width: rw, height: rh });
      }
    };

    const handleMouseUp = () => {
      if (dragState.kind === 'marquee' && marqueeRect) {
        if (marqueeRect.width >= 18 && marqueeRect.height >= 14) {
          if (activeTool === 'snip-image') {
            onSnipImageRect(marqueeRect);
          } else if (activeTool === 'add-text') {
            onCreateTextBlockAt(marqueeRect);
          }
        }
      }
      setDragState(null);
      setMarqueeRect(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState,
    marqueeRect,
    zoom,
    page,
    activeTool,
    onUpdateTextBlock,
    onUpdateImageBlock,
    onSnipImageRect,
    onCreateTextBlockAt,
  ]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && !(e.target as HTMLElement).dataset.canvasBg) {
      return;
    }
    onSelectText(null);
    onSelectImage(null);
    setEditingTextId(null);

    if (activeTool === 'snip-image' || activeTool === 'add-text') {
      const coords = getPageCoords(e.clientX, e.clientY);
      setDragState({
        kind: 'marquee',
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialX: coords.x,
        initialY: coords.y,
        initialW: 0,
        initialH: 0,
      });
      setMarqueeRect({ x: coords.x, y: coords.y, width: 0, height: 0 });
    }
  };

  const renderResizeHandles = (
    onStartResize: (dir: HandleDir, e: React.MouseEvent) => void,
    accentColor: string = 'bg-indigo-500'
  ) => {
    const handles: { dir: HandleDir; posClass: string; cursor: string }[] = [
      { dir: 'nw', posClass: '-top-1.5 -left-1.5', cursor: 'nwse-resize' },
      { dir: 'n', posClass: '-top-1.5 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
      { dir: 'ne', posClass: '-top-1.5 -right-1.5', cursor: 'nesw-resize' },
      { dir: 'e', posClass: 'top-1/2 -translate-y-1/2 -right-1.5', cursor: 'ew-resize' },
      { dir: 'se', posClass: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
      { dir: 's', posClass: '-bottom-1.5 left-1/2 -translate-x-1/2', cursor: 'ns-resize' },
      { dir: 'sw', posClass: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
      { dir: 'w', posClass: 'top-1/2 -translate-y-1/2 -left-1.5', cursor: 'ew-resize' },
    ];

    return handles.map((h) => (
      <div
        key={h.dir}
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartResize(h.dir, e);
        }}
        style={{ cursor: h.cursor }}
        className={`absolute w-3 h-3 rounded-full border-2 border-white shadow-md z-30 ${accentColor} ${h.posClass} hover:scale-125 transition-transform`}
      />
    ));
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      style={{
        width: page.width * zoom,
        height: page.height * zoom,
        cursor:
          activeTool === 'snip-image' || activeTool === 'add-text'
            ? 'crosshair'
            : 'default',
      }}
      className="relative bg-white shadow-2xl rounded-sm select-none overflow-hidden ring-1 ring-slate-700/60"
    >
      {/* 1. Base Rendered PDF Background */}
      <img
        src={page.backgroundDataUrl}
        alt={`Page ${page.pageIndex + 1}`}
        data-canvas-bg="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-fill pointer-events-auto"
      />

      {/* 2. Clean Background Erase Masks for Snipped/Moved Images */}
      {page.imageBlocks.map((img) => {
        if (
          img.origX === undefined ||
          img.origY === undefined ||
          img.origWidth === undefined ||
          img.origHeight === undefined
        ) {
          return null;
        }
        return (
          <div
            key={`mask_img_${img.id}`}
            data-canvas-bg="true"
            style={{
              left: (img.origX - 1) * zoom,
              top: (img.origY - 1) * zoom,
              width: (img.origWidth + 2) * zoom,
              height: (img.origHeight + 2) * zoom,
              backgroundColor: img.maskBgColor || '#ffffff',
            }}
            className="absolute pointer-events-none"
          />
        );
      })}

      {/* 3. Clean Background Erase Masks for Original Text Positions */}
      {page.textBlocks.map((tb) => {
        const maskW = Math.min(tb.origWidth, tb.width + 4);
        return (
          <div
            key={`mask_tb_${tb.id}`}
            data-canvas-bg="true"
            style={{
              left: (tb.origX - 1) * zoom,
              top: (tb.origY - 1) * zoom,
              width: (maskW + 2) * zoom,
              height: (tb.origHeight + 2) * zoom,
              backgroundColor: tb.backgroundColor || '#ffffff',
            }}
            className="absolute pointer-events-none"
          />
        );
      })}

      {/* 4. Interactive Image Blocks Layer */}
      {page.imageBlocks.map((img) => {
        if (!img.visible) return null;
        const isSelected = selectedImageId === img.id;

        return (
          <div
            key={img.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelectImage(img.id);
              onSelectText(null);
              setEditingTextId(null);
              setDragState({
                kind: 'move-image',
                targetId: img.id,
                startClientX: e.clientX,
                startClientY: e.clientY,
                initialX: img.x,
                initialY: img.y,
                initialW: img.width,
                initialH: img.height,
              });
            }}
            style={{
              left: img.x * zoom,
              top: img.y * zoom,
              width: img.width * zoom,
              height: img.height * zoom,
              transform: `rotate(${img.rotation}deg)`,
              zIndex: isSelected ? 25 : 12,
            }}
            className={`group absolute transition-shadow ${
              isSelected
                ? 'ring-2 ring-emerald-500 shadow-lg'
                : showBoundingBoxes
                ? 'ring-1 ring-emerald-500/40 hover:ring-emerald-400'
                : 'hover:ring-1 hover:ring-emerald-400/70'
            }`}
          >
            {/* Floating Mini-Toolbar for Selected Image */}
            {isSelected && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute -top-10 left-0 flex items-center gap-1 bg-slate-900/95 text-white px-2 py-1 rounded-lg shadow-xl border border-slate-700 whitespace-nowrap z-40 text-xs"
              >
                <span className="text-emerald-400 font-semibold px-1">Ảnh</span>
                <button
                  title="Thu nhỏ 10%"
                  onClick={() =>
                    onUpdateImageBlock(img.id, {
                      width: Math.max(24, Math.round(img.width * 0.9)),
                      height: Math.max(24, Math.round(img.height * 0.9)),
                    })
                  }
                  className="p-1 hover:bg-slate-800 rounded"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Phóng to 10%"
                  onClick={() =>
                    onUpdateImageBlock(img.id, {
                      width: Math.round(img.width * 1.1),
                      height: Math.round(img.height * 1.1),
                    })
                  }
                  className="p-1 hover:bg-slate-800 rounded"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Xoay 90°"
                  onClick={() =>
                    onUpdateImageBlock(img.id, {
                      rotation: (img.rotation + 90) % 360,
                    })
                  }
                  className="p-1 hover:bg-slate-800 rounded"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Nhân bản ảnh"
                  onClick={() => onDuplicateImageBlock(img.id)}
                  className="p-1 hover:bg-slate-800 rounded"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Xóa ảnh"
                  onClick={() => onDeleteImageBlock(img.id)}
                  className="p-1 hover:bg-rose-600/80 text-rose-300 hover:text-white rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-400 pl-1 border-l border-slate-700">
                  {Math.round(img.width)}×{Math.round(img.height)}
                </span>
              </div>
            )}

            <img
              src={img.dataUrl}
              alt={img.label}
              draggable={false}
              style={{
                opacity: img.opacity,
                borderRadius: img.borderRadius * zoom,
                filter: `brightness(${img.brightness}%) contrast(${img.contrast}%)`,
              }}
              className="w-full h-full object-fill cursor-move"
            />

            {isSelected &&
              renderResizeHandles((dir, e) => {
                setDragState({
                  kind: 'resize-image',
                  targetId: img.id,
                  handle: dir,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  initialX: img.x,
                  initialY: img.y,
                  initialW: img.width,
                  initialH: img.height,
                });
              }, 'bg-emerald-500')}
          </div>
        );
      })}

      {/* 5. Interactive Text Blocks Layer */}
      {page.textBlocks.map((tb) => {
        if (!tb.visible) return null;
        const isSelected = selectedTextId === tb.id;
        const isEditing = editingTextId === tb.id;
        const displayText = tb.translatedText || tb.originalText;

        // Convert hex background + bgOpacity to rgba
        const hex = tb.backgroundColor || '#ffffff';
        const r = parseInt(hex.slice(1, 3), 16) || 255;
        const g = parseInt(hex.slice(3, 5), 16) || 255;
        const b = parseInt(hex.slice(5, 7), 16) || 255;
        const bgRgba = `rgba(${r}, ${g}, ${b}, ${tb.bgOpacity})`;

        return (
          <div
            key={tb.id}
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelectText(tb.id);
              onSelectImage(null);
              if (editingTextId && editingTextId !== tb.id) {
                setEditingTextId(null);
              }
              if (!isEditing) {
                setDragState({
                  kind: 'move-text',
                  targetId: tb.id,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  initialX: tb.x,
                  initialY: tb.y,
                  initialW: tb.width,
                  initialH: tb.height,
                });
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingTextId(tb.id);
            }}
            style={{
              left: tb.x * zoom,
              top: tb.y * zoom,
              width: tb.width * zoom,
              height: tb.height * zoom,
              backgroundColor: bgRgba,
              padding: (tb.padding ?? 2) * zoom,
              zIndex: isSelected ? 30 : 15,
            }}
            className={`group absolute transition-shadow ${
              isSelected
                ? 'ring-2 ring-indigo-500 shadow-lg'
                : showBoundingBoxes
                ? 'ring-1 ring-indigo-500/35 hover:ring-indigo-400'
                : 'hover:ring-1 hover:ring-indigo-400/60'
            }`}
          >
            {/* Floating Quick Toolbar for Selected Text Block */}
            {isSelected && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute -top-10 left-0 flex items-center gap-1 bg-slate-900/95 text-white px-2 py-1 rounded-lg shadow-xl border border-slate-700 whitespace-nowrap z-40 text-xs"
              >
                <button
                  title="Giảm cỡ chữ (-0.5pt)"
                  onClick={() =>
                    onUpdateTextBlock(tb.id, {
                      fontSize: Math.max(5, Number((tb.fontSize - 0.5).toFixed(1))),
                      autoFit: false,
                    })
                  }
                  className="px-1.5 py-0.5 hover:bg-slate-800 rounded font-semibold"
                >
                  A-
                </button>
                <span className="text-indigo-300 font-mono text-[11px] px-1">
                  {tb.fontSize}pt
                </span>
                <button
                  title="Tăng cỡ chữ (+0.5pt)"
                  onClick={() =>
                    onUpdateTextBlock(tb.id, {
                      fontSize: Math.min(96, Number((tb.fontSize + 0.5).toFixed(1))),
                      autoFit: false,
                    })
                  }
                  className="px-1.5 py-0.5 hover:bg-slate-800 rounded font-semibold"
                >
                  A+
                </button>
                <button
                  title="Tự động vừa khít khung (Auto-Fit)"
                  onClick={() => {
                    const fitted = fitTextBlock({ ...tb, autoFit: true });
                    onUpdateTextBlock(tb.id, {
                      fontSize: fitted.fontSize,
                      autoFit: true,
                    });
                  }}
                  className={`p-1 rounded flex items-center gap-0.5 ${
                    tb.autoFit
                      ? 'bg-indigo-600 text-white'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                </button>
                <button
                  title="In đậm (Bold)"
                  onClick={() =>
                    onUpdateTextBlock(tb.id, {
                      fontWeight: tb.fontWeight === 'bold' ? 'normal' : 'bold',
                    })
                  }
                  className={`p-1 rounded ${
                    tb.fontWeight === 'bold' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800'
                  }`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  title="In nghiêng (Italic)"
                  onClick={() =>
                    onUpdateTextBlock(tb.id, {
                      fontStyle: tb.fontStyle === 'italic' ? 'normal' : 'italic',
                    })
                  }
                  className={`p-1 rounded ${
                    tb.fontStyle === 'italic' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800'
                  }`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Căn trái"
                  onClick={() => onUpdateTextBlock(tb.id, { textAlign: 'left' })}
                  className={`p-1 rounded ${
                    tb.textAlign === 'left' ? 'bg-slate-700' : 'hover:bg-slate-800'
                  }`}
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Căn giữa"
                  onClick={() => onUpdateTextBlock(tb.id, { textAlign: 'center' })}
                  className={`p-1 rounded ${
                    tb.textAlign === 'center' ? 'bg-slate-700' : 'hover:bg-slate-800'
                  }`}
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Căn phải"
                  onClick={() => onUpdateTextBlock(tb.id, { textAlign: 'right' })}
                  className={`p-1 rounded ${
                    tb.textAlign === 'right' ? 'bg-slate-700' : 'hover:bg-slate-800'
                  }`}
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Nhân bản khung chữ"
                  onClick={() => onDuplicateTextBlock(tb.id)}
                  className="p-1 hover:bg-slate-800 rounded"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  title="Xóa khung chữ"
                  onClick={() => onDeleteTextBlock(tb.id)}
                  className="p-1 hover:bg-rose-600/80 text-rose-300 hover:text-white rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {isEditing ? (
              <textarea
                autoFocus
                value={tb.translatedText}
                onChange={(e) => {
                  const val = e.target.value;
                  if (tb.autoFit) {
                    const fitted = fitTextBlock({ ...tb, translatedText: val });
                    onUpdateTextBlock(tb.id, {
                      translatedText: val,
                      fontSize: fitted.fontSize,
                    });
                  } else {
                    onUpdateTextBlock(tb.id, { translatedText: val });
                  }
                }}
                onBlur={() => setEditingTextId(null)}
                style={{
                  fontFamily: tb.fontFamily,
                  fontSize: tb.fontSize * zoom,
                  fontWeight: tb.fontWeight,
                  fontStyle: tb.fontStyle,
                  color: tb.color,
                  textAlign: tb.textAlign,
                  lineHeight: tb.lineHeight,
                }}
                className="w-full h-full bg-transparent resize-none focus:outline-none overflow-hidden"
              />
            ) : (
              <div
                style={{
                  fontFamily: tb.fontFamily,
                  fontSize: tb.fontSize * zoom,
                  fontWeight: tb.fontWeight,
                  fontStyle: tb.fontStyle,
                  color: tb.color,
                  textAlign: tb.textAlign,
                  lineHeight: tb.lineHeight,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  lineBreak: 'strict',
                  whiteSpace: 'pre-wrap',
                }}
                className="w-full h-full overflow-hidden cursor-move"
              >
                {displayText}
              </div>
            )}

            {isSelected &&
              renderResizeHandles((dir, e) => {
                setDragState({
                  kind: 'resize-text',
                  targetId: tb.id,
                  handle: dir,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  initialX: tb.x,
                  initialY: tb.y,
                  initialW: tb.width,
                  initialH: tb.height,
                });
              }, 'bg-indigo-500')}
          </div>
        );
      })}

      {/* 6. Active Marquee Selection Box (for Snipping Image or Adding Text Box) */}
      {marqueeRect && (
        <div
          style={{
            left: marqueeRect.x * zoom,
            top: marqueeRect.y * zoom,
            width: marqueeRect.width * zoom,
            height: marqueeRect.height * zoom,
          }}
          className={`absolute z-50 pointer-events-none border-2 border-dashed ${
            activeTool === 'snip-image'
              ? 'border-emerald-400 bg-emerald-500/15'
              : 'border-indigo-400 bg-indigo-500/15'
          }`}
        >
          <span className="absolute -top-6 left-0 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded shadow">
            {activeTool === 'snip-image'
              ? `Cắt ảnh: ${Math.round(marqueeRect.width)}×${Math.round(marqueeRect.height)}`
              : `Thêm chữ: ${Math.round(marqueeRect.width)}×${Math.round(marqueeRect.height)}`}
          </span>
        </div>
      )}
    </div>
  );
};

