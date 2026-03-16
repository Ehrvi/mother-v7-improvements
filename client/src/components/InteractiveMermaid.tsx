/**
 * InteractiveMermaid — Interactive Mermaid diagram viewer
 * Features: zoom, pan, fullscreen, download SVG/PNG
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import mermaid from 'mermaid';
import type { MermaidConfig } from 'mermaid';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Download, X } from 'lucide-react';

interface InteractiveMermaidProps {
  chart: string;
  mermaidConfig?: MermaidConfig;
}

// Counter for unique diagram IDs
let diagramCounter = 0;

export default function InteractiveMermaid({ chart, mermaidConfig }: InteractiveMermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  // Render mermaid diagram
  useEffect(() => {
    if (!chart.trim()) return;

    const id = `mermaid-interactive-${++diagramCounter}`;

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      ...mermaidConfig,
      themeVariables: {
        primaryColor: '#B026FF',
        primaryTextColor: '#E0B3FF',
        primaryBorderColor: '#00F5FF',
        lineColor: '#00F5FF',
        secondaryColor: '#1a1a2e',
        tertiaryColor: '#0A0E1A',
        background: '#0A0E1A',
        mainBkg: '#1a1a2e',
        nodeBorder: '#B026FF',
        titleColor: '#E0B3FF',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        ...mermaidConfig?.themeVariables,
      },
    });

    mermaid.render(id, chart.trim())
      .then(({ svg }) => {
        // Make SVG responsive and properly sized
        const enhanced = svg
          .replace(/height="[^"]*"/, 'height="100%"')
          .replace(/style="[^"]*"/, 'style="width:100%;height:100%;"');
        setSvgHtml(enhanced);
        setError(null);
        // Reset zoom/pan on new render
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      })
      .catch((err) => {
        setError(err.message || 'Failed to render diagram');
        setSvgHtml('');
      });
  }, [chart, mermaidConfig]);

  // Zoom controls
  const zoomIn = useCallback(() => setScale(s => Math.min(s + 0.25, 4)), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(s - 0.25, 0.25)), []);
  const resetView = useCallback(() => { setScale(1); setTranslate({ x: 0, y: 0 }); }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.min(Math.max(s + delta, 0.25), 4));
  }, []);

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [translate]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTranslate({ x: translateStart.current.x + dx, y: translateStart.current.y + dy });
  }, [isPanning]);

  const handlePointerUp = useCallback(() => setIsPanning(false), []);

  // Download SVG
  const downloadSVG = useCallback(() => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mother-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, [svgHtml]);

  // Download PNG
  const downloadPNG = useCallback(() => {
    if (!svgHtml) return;
    const svgEl = svgContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const bbox = svgEl.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    const pixelRatio = 2; // High-res export
    canvas.width = bbox.width * pixelRatio;
    canvas.height = bbox.height * pixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(pixelRatio, pixelRatio);
    const img = new Image();
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      ctx.fillStyle = '#0A0E1A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, bbox.width, bbox.height);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.download = 'mother-diagram.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }, [svgHtml]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(v => !v);
    if (!isFullscreen) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [isFullscreen]);

  // ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  if (error) {
    return (
      <div className="rounded-xl p-4 text-sm" style={{ background: 'oklch(14% 0.04 25)', border: '1px solid oklch(25% 0.08 25)', color: 'oklch(70% 0.14 25)' }}>
        <p className="font-semibold mb-1">Erro no diagrama Mermaid</p>
        <pre className="text-xs opacity-70 whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  if (!svgHtml) {
    return (
      <div className="rounded-xl p-8 flex items-center justify-center" style={{ background: 'oklch(10% 0.02 280)', border: '1px solid oklch(18% 0.03 280)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'oklch(52% 0.02 280)' }}>
          <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'oklch(55% 0.18 295)', borderTopColor: 'transparent' }} />
          Renderizando diagrama...
        </div>
      </div>
    );
  }

  const viewerContent = (
    <div ref={containerRef} className={`relative rounded-xl overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
      style={{
        background: 'oklch(6% 0.01 280)',
        border: isFullscreen ? 'none' : '1px solid oklch(20% 0.04 285)',
        height: isFullscreen ? '100vh' : '500px',
      }}>
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5"
        style={{ background: 'oklch(12% 0.02 280)', borderRadius: 10, padding: '4px 6px', border: '1px solid oklch(22% 0.03 280)', backdropFilter: 'blur(8px)' }}>
        <ToolbarButton icon={ZoomIn} onClick={zoomIn} title="Zoom in (+)" />
        <ToolbarButton icon={ZoomOut} onClick={zoomOut} title="Zoom out (-)" />
        <span className="text-[10px] font-mono px-1.5 min-w-[36px] text-center" style={{ color: 'oklch(62% 0.02 280)' }}>
          {Math.round(scale * 100)}%
        </span>
        <ToolbarButton icon={RotateCcw} onClick={resetView} title="Reset view" />
        <div className="w-px h-4 mx-0.5" style={{ background: 'oklch(25% 0.02 280)' }} />
        <ToolbarButton icon={Download} onClick={downloadSVG} title="Download SVG" />
        <ToolbarButton icon={isFullscreen ? Minimize2 : Maximize2} onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'} />
        {isFullscreen && <ToolbarButton icon={X} onClick={() => setIsFullscreen(false)} title="Fechar (Esc)" />}
      </div>

      {/* Zoom hint */}
      {!isFullscreen && (
        <div className="absolute bottom-3 left-3 z-10 text-[10px] px-2 py-1 rounded-md"
          style={{ background: 'oklch(12% 0.02 280)', border: '1px solid oklch(22% 0.03 280)', color: 'oklch(45% 0.02 280)' }}>
          Scroll para zoom · Arrastar para mover · Clique fullscreen para explorar
        </div>
      )}

      {/* SVG viewport */}
      <div
        ref={svgContainerRef}
        className="w-full h-full select-none"
        style={{
          cursor: isPanning ? 'grabbing' : 'grab',
          overflow: 'hidden',
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          <div
            className="[&_svg]:max-w-none [&_svg]:max-h-none"
            style={{ padding: '40px' }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        </div>
      </div>
    </div>
  );

  return viewerContent;
}

function ToolbarButton({ icon: Icon, onClick, title }: { icon: React.ComponentType<{ className?: string }>; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
      style={{ color: 'oklch(62% 0.02 280)' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'oklch(22% 0.04 285)';
        e.currentTarget.style.color = 'oklch(82% 0.08 285)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'oklch(62% 0.02 280)';
      }}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
