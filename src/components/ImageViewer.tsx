"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface ImageViewerProps {
  originalUrl: string;
  processedUrl?: string;
  originalLabel?: string;
  processedLabel?: string;
  onClose: () => void;
}

const MAX_SCALE = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface Size {
  w: number;
  h: number;
}

function loadImageSize(src: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export default function ImageViewer({
  originalUrl,
  processedUrl,
  originalLabel = "Original",
  processedLabel = "Processed",
  onClose,
}: ImageViewerProps) {
  const [imgSize, setImgSize] = useState<Size | null>(null);
  const [vpSize, setVpSize] = useState<Size | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState(50);
  const [initialized, setInitialized] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef<{ px: number; py: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadImageSize(originalUrl)
      .then((size) => {
        if (!cancelled) setImgSize(size);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const rect = viewport.getBoundingClientRect();
      setVpSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  const baseline = useCallback((): number => {
    if (!imgSize || !vpSize) return 1;
    const fit = Math.min(vpSize.w / imgSize.w, vpSize.h / imgSize.h);
    return Math.min(fit, 1);
  }, [imgSize, vpSize]);

  const setZoom = useCallback(
    (next: number, anchorX: number, anchorY: number) => {
      if (!imgSize || !vpSize) return;
      const base = baseline();
      const clamped = clamp(next, base, MAX_SCALE);
      const cur = scaleRef.current;
      const curCenterX = (vpSize.w - imgSize.w * cur) / 2;
      const curCenterY = (vpSize.h - imgSize.h * cur) / 2;
      const curOffX = curCenterX + panRef.current.x;
      const curOffY = curCenterY + panRef.current.y;

      const imgX = (anchorX - curOffX) / cur;
      const imgY = (anchorY - curOffY) / cur;

      const nCenterX = (vpSize.w - imgSize.w * clamped) / 2;
      const nCenterY = (vpSize.h - imgSize.h * clamped) / 2;

      let px = anchorX - imgX * clamped - nCenterX;
      let py = anchorY - imgY * clamped - nCenterY;

      const rangeX = Math.max(0, (imgSize.w * clamped - vpSize.w) / 2);
      const rangeY = Math.max(0, (imgSize.h * clamped - vpSize.h) / 2);
      px = clamp(px, -rangeX, rangeX);
      py = clamp(py, -rangeY, rangeY);

      scaleRef.current = clamped;
      panRef.current = { x: px, y: py };
      setScale(clamped);
      setPan({ x: px, y: py });
    },
    [imgSize, vpSize, baseline]
  );

  if (imgSize && vpSize && !initialized) {
    setInitialized(true);
    setScale(baseline());
  }

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const factor = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom(scaleRef.current * factor, x, y);
    },
    [setZoom]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (e.key === "Escape") onClose();
      if (e.key === "=" || e.key === "+") setZoom(scaleRef.current * 1.25, cx, cy);
      if (e.key === "-") setZoom(scaleRef.current / 1.25, cx, cy);
      if (e.key === "0") setZoom(baseline(), cx, cy);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, setZoom, baseline]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      setZoom(scaleRef.current * factor, rect.width / 2, rect.height / 2);
    },
    [setZoom]
  );

  const resetZoom = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setZoom(baseline(), rect.width / 2, rect.height / 2);
  }, [setZoom, baseline]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!imgSize || !vpSize) return;
      if (!(imgSize.w * scaleRef.current > vpSize.w || imgSize.h * scaleRef.current > vpSize.h)) return;
      panStartRef.current = {
        px: e.clientX,
        py: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [imgSize, vpSize]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panStartRef.current || !imgSize || !vpSize) return;
      const cur = scaleRef.current;
      const rangeX = Math.max(0, (imgSize.w * cur - vpSize.w) / 2);
      const rangeY = Math.max(0, (imgSize.h * cur - vpSize.h) / 2);
      const nx = clamp(panStartRef.current.panX + (e.clientX - panStartRef.current.px), -rangeX, rangeX);
      const ny = clamp(panStartRef.current.panY + (e.clientY - panStartRef.current.py), -rangeY, rangeY);
      panRef.current = { x: nx, y: ny };
      setPan({ x: nx, y: ny });
    },
    [imgSize, vpSize]
  );

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const updatePosition = useCallback(
    (clientX: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || !imgSize || !vpSize) return;
      const centerX = (vpSize.w - imgSize.w * scaleRef.current) / 2;
      const offX = centerX + panRef.current.x;
      const imgX = (clientX - rect.left - offX) / scaleRef.current;
      const p = clamp((imgX / imgSize.w) * 100, 0, 100);
      setPosition(p);
    },
    [imgSize, vpSize]
  );

  const handleSlideDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const handleSlideMove = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      updatePosition(e.clientX);
    },
    [updatePosition]
  );

  const ready = imgSize !== null && vpSize !== null;
  const canPanState = ready && (imgSize.w * scale > vpSize.w || imgSize.h * scale > vpSize.h);
  const centerX = ready ? (vpSize.w - imgSize.w * scale) / 2 : 0;
  const centerY = ready ? (vpSize.h - imgSize.h * scale) / 2 : 0;
  const offX = centerX + pan.x;
  const offY = centerY + pan.y;
  const dividerX = ready ? offX + (position / 100) * imgSize.w * scale : 0;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-950 animate-in fade-in duration-200">
      <div className="flex items-center justify-between px-4 py-3 select-none">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-white">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <span className="text-sm font-medium text-white/90">Before / After</span>
        </div>
        <span className="text-xs text-white/50 hidden sm:block">
          {ready ? `${imgSize.w} × ${imgSize.h}px` : ""}
        </span>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        ref={viewportRef}
        className={`flex-1 relative overflow-hidden bg-zinc-950 ${canPanState ? "cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center z-50">
            <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {ready && (
          <div
            className="absolute left-0 top-0 will-change-transform touch-none"
            style={{
              width: imgSize.w,
              height: imgSize.h,
              transform: `translate(${offX}px, ${offY}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            <img
              src={processedUrl || originalUrl}
              alt="Processed"
              className="w-full h-full select-none pointer-events-none"
              draggable={false}
            />
            {processedUrl && (
              <img
                src={originalUrl}
                alt="Original"
                className="absolute inset-0 w-full h-full select-none pointer-events-none"
                style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                draggable={false}
              />
            )}
          </div>
        )}

        {ready && processedUrl && (
          <div
            className="absolute inset-y-0 z-10"
            style={{ left: dividerX }}
          >
            <div
              className="absolute inset-y-0 w-0.5 -translate-x-1/2"
              style={{ background: "linear-gradient(to bottom, transparent, rgb(167 139 250), transparent)" }}
            />
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg border-2 border-violet-500 flex items-center justify-center cursor-ew-resize touch-none select-none"
              onPointerDown={handleSlideDown}
              onPointerMove={handleSlideMove}
              onPointerUp={handlePointerUp}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 4l-6 8 6 8" />
                <path d="M15 4l6 8-6 8" />
              </svg>
            </div>
          </div>
        )}

        <div className="absolute top-3 left-3 bg-white/10 backdrop-blur-md text-white text-xs font-medium px-2.5 py-1 rounded-lg border border-white/20 shadow-sm z-30">
          {processedUrl ? originalLabel : "Original"}
        </div>
        {processedUrl && (
          <div className="absolute top-3 right-3 bg-white/10 backdrop-blur-md text-white text-xs font-medium px-2.5 py-1 rounded-lg border border-white/20 shadow-sm z-30">
            {processedLabel}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 px-4 py-3 select-none">
        <button
          onClick={() => zoomBy(1 / 1.25)}
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Zoom out (-)"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="w-14 text-center text-sm font-medium text-white/90 tabular-nums" title="Percentage of actual pixels">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => zoomBy(1.25)}
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Zoom in (+)"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={resetZoom}
          className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
          title="Fit to screen (0)"
        >
          <RotateCcw className="w-4 h-4" />
          Fit
        </button>
      </div>
    </div>
  );
}