/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { InlineMath, BlockMath } from 'react-katex';
import {
  PenTool,
  Highlighter,
  Eraser,
  MousePointer2,
  Hand,
  Type,
  ArrowUpRight,
  Sparkles,
  LayoutGrid,
  SlidersHorizontal,
  FileText,
  Save,
  Maximize2,
  Minimize2,
  Cloud,
  CloudOff,
  Check,
  Loader2,
  X,
} from 'lucide-react';

export type SolutionTargetType = 'problem' | 'olympiad_paper' | 'scratchpad';

interface SolutionWhiteboardProps {
  apiUrl: string;
  token: string | null;
  targetType: SolutionTargetType;
  targetId: string;
  defaultTitle: string;
  editableTitle?: boolean;
  fillHeight?: boolean;
  onRequireAuth: () => void;
  onClose?: () => void;
  onSaved?: (meta: { updatedAt: string; elementCount: number; titleOverride: string }) => void;
}

interface Pt {
  x: number;
  y: number;
}

type RecognizedShape =
  | { kind: 'line'; x: number; y: number; points: [number, number][]; width: number; height: number }
  | { kind: 'ellipse'; x: number; y: number; width: number; height: number }
  | { kind: 'rectangle'; x: number; y: number; width: number; height: number }
  | { kind: 'triangle'; x: number; y: number; points: [number, number][]; width: number; height: number };

const PEN_COLORS = [
  { hex: '#f8fafc', label: 'Branco' },
  { hex: '#38bdf8', label: 'Azul' },
  { hex: '#f43f5e', label: 'Vermelho' },
  { hex: '#facc15', label: 'Amarelo' },
  { hex: '#34d399', label: 'Verde' },
  { hex: '#c084fc', label: 'Roxo' },
];

const STROKE_WIDTHS = [
  { value: 1, label: 'Fina' },
  { value: 2, label: 'Média' },
  { value: 4, label: 'Grossa' },
];

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function getElementBounds(el: any): { minX: number; minY: number; maxX: number; maxY: number } {
  if (Array.isArray(el.points) && el.points.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of el.points) {
      const px = el.x + p[0];
      const py = el.y + p[1];
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return { minX, minY, maxX, maxY };
  }
  const x1 = el.x ?? 0;
  const y1 = el.y ?? 0;
  const x2 = x1 + (el.width ?? 0);
  const y2 = y1 + (el.height ?? 0);
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

/**
 * Reconhecedor geométrico (Ink-to-Shape) calibrado para física:
 * converte linhas retas, círculos/elipses, retângulos/quadrados e triângulos,
 * preservando escrita manual pequena (letras, expoentes, símbolos gregos).
 */
function recognizeHandDrawnShape(el: any): RecognizedShape | null {
  if (!el || el.type !== 'freedraw' || el.isDeleted) return null;
  if (!Array.isArray(el.points) || el.points.length < 5) return null;
  // Ignora traços de marca-texto (baixa opacidade)
  if (typeof el.opacity === 'number' && el.opacity < 70) return null;

  const pts: Pt[] = el.points.map((p: number[]) => ({
    x: el.x + p[0],
    y: el.y + p[1],
  }));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let pathLen = 0;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (i > 0) {
      pathLen += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    }
  }

  if (pathLen < 55) return null;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const dse = Math.hypot(last.x - first.x, last.y - first.y);
  const w = maxX - minX;
  const h = maxY - minY;
  const diag = Math.hypot(w, h);

  // 1. Linha reta (com snap horizontal/vertical para eixos e diagramas)
  if (dse >= 65 && dse / pathLen >= 0.94) {
    let maxDev = 0;
    for (const p of pts) {
      const d = distToSegment(p, first, last);
      if (d > maxDev) maxDev = d;
    }
    if (maxDev <= Math.max(9, 0.055 * dse)) {
      let endX = last.x;
      let endY = last.y;
      const angle = Math.atan2(endY - first.y, endX - first.x);
      if (Math.abs(Math.sin(angle)) < 0.08) {
        endY = first.y;
      } else if (Math.abs(Math.cos(angle)) < 0.08) {
        endX = first.x;
      }
      const dx = endX - first.x;
      const dy = endY - first.y;
      return {
        kind: 'line',
        x: first.x,
        y: first.y,
        points: [
          [0, 0],
          [dx, dy],
        ],
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
    }
  }

  // 2. Formas fechadas (tamanho mínimo protege letras 'o', '0', 'θ', 'Δ')
  if (Math.min(w, h) < 42 || Math.max(w, h) < 52) return null;
  const isClosed = dse <= Math.max(32, 0.34 * diag) && pathLen >= 1.25 * (w + h) && pathLen <= 2.9 * (w + h);
  if (!isClosed) return null;

  let areaSum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    areaSum += a.x * b.y - b.x * a.y;
  }
  const polyArea = Math.abs(areaSum) / 2;
  const areaRatio = polyArea / (w * h);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = w / 2;
  const ry = h / 2;

  // 2A. Círculo perfeito / Elipse
  let radialErrSum = 0;
  let maxRadialErr = 0;
  const octants = new Set<number>();
  for (const p of pts) {
    const rn = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
    const err = Math.abs(rn - 1);
    radialErrSum += err;
    if (err > maxRadialErr) maxRadialErr = err;
    const oct = Math.floor(((Math.atan2(p.y - cy, p.x - cx) + Math.PI) / (2 * Math.PI)) * 8) % 8;
    octants.add(oct);
  }
  const meanRadialErr = radialErrSum / pts.length;

  if (meanRadialErr < 0.145 && maxRadialErr < 0.36 && octants.size >= 7 && areaRatio >= 0.62 && areaRatio <= 0.90) {
    if (Math.min(w, h) / Math.max(w, h) >= 0.80) {
      const size = (w + h) / 2;
      return { kind: 'ellipse', x: cx - size / 2, y: cy - size / 2, width: size, height: size };
    }
    return { kind: 'ellipse', x: minX, y: minY, width: w, height: h };
  }

  // 2B. Retângulo / Quadrado
  const minDim = Math.min(w, h);
  const edgeThresh = 0.17 * minDim;
  let edgeDistSum = 0;
  let hitL = false;
  let hitR = false;
  let hitT = false;
  let hitB = false;

  for (const p of pts) {
    const dL = p.x - minX;
    const dR = maxX - p.x;
    const dT = p.y - minY;
    const dB = maxY - p.y;
    if (dL < edgeThresh) hitL = true;
    if (dR < edgeThresh) hitR = true;
    if (dT < edgeThresh) hitT = true;
    if (dB < edgeThresh) hitB = true;
    edgeDistSum += Math.min(dL, dR, dT, dB);
  }
  const meanEdgeErr = edgeDistSum / pts.length / minDim;

  if (areaRatio >= 0.78 && areaRatio <= 1.05 && meanEdgeErr < 0.09 && hitL && hitR && hitT && hitB) {
    if (Math.min(w, h) / Math.max(w, h) >= 0.84) {
      const size = (w + h) / 2;
      return { kind: 'rectangle', x: cx - size / 2, y: cy - size / 2, width: size, height: size };
    }
    return { kind: 'rectangle', x: minX, y: minY, width: w, height: h };
  }

  // 2C. Triângulo
  if (areaRatio >= 0.32 && areaRatio <= 0.68) {
    let v1 = pts[0];
    let bestD1 = -1;
    for (const p of pts) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d > bestD1) {
        bestD1 = d;
        v1 = p;
      }
    }
    let v2 = pts[0];
    let bestD2 = -1;
    for (const p of pts) {
      const d = Math.hypot(p.x - v1.x, p.y - v1.y);
      if (d > bestD2) {
        bestD2 = d;
        v2 = p;
      }
    }
    let v3 = pts[0];
    let triArea = -1;
    for (const p of pts) {
      const a = Math.abs((v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x)) / 2;
      if (a > triArea) {
        triArea = a;
        v3 = p;
      }
    }

    if (triArea > 0.25 * w * h && Math.abs(triArea - polyArea) / triArea < 0.28) {
      let triDistSum = 0;
      let hit12 = false;
      let hit23 = false;
      let hit31 = false;
      const tThresh = 0.1 * diag;

      for (const p of pts) {
        const d12 = distToSegment(p, v1, v2);
        const d23 = distToSegment(p, v2, v3);
        const d31 = distToSegment(p, v3, v1);
        if (d12 < tThresh) hit12 = true;
        if (d23 < tThresh) hit23 = true;
        if (d31 < tThresh) hit31 = true;
        triDistSum += Math.min(d12, d23, d31);
      }

      if (triDistSum / pts.length / diag < 0.055 && hit12 && hit23 && hit31) {
        const relPoints: [number, number][] = [
          [0, 0],
          [v2.x - v1.x, v2.y - v1.y],
          [v3.x - v1.x, v3.y - v1.y],
          [0, 0],
        ];
        const xs = [v1.x, v2.x, v3.x];
        const ys = [v1.y, v2.y, v3.y];
        return {
          kind: 'triangle',
          x: v1.x,
          y: v1.y,
          points: relPoints,
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        };
      }
    }
  }

  return null;
}

function buildExcalidrawShapeFromFreehand(sourceEl: any, shape: RecognizedShape): any | null {
  const baseStyle = {
    strokeColor: sourceEl.strokeColor || '#f8fafc',
    backgroundColor: 'transparent',
    strokeWidth: sourceEl.strokeWidth || 2,
    strokeStyle: sourceEl.strokeStyle || 'solid',
    roughness: 0,
    opacity: sourceEl.opacity ?? 100,
  };

  if (shape.kind === 'ellipse' || shape.kind === 'rectangle') {
    const [converted] = convertToExcalidrawElements([
      {
        type: shape.kind,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        ...baseStyle,
      } as any,
    ]);
    return converted || null;
  }

  const endPt = shape.points[1] || [shape.width, shape.height];
  const [converted] = convertToExcalidrawElements([
    {
      type: 'line',
      x: shape.x,
      y: shape.y,
      width: endPt[0],
      height: endPt[1],
      ...baseStyle,
    } as any,
  ]);
  if (!converted) return null;

  return {
    ...converted,
    x: shape.x,
    y: shape.y,
    points: shape.points,
    width: shape.width,
    height: shape.height,
    roundness: null,
  };
}

function NotesMathPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <p className="text-xs text-slate-500 italic">
        Use $...$ para fórmulas inline e $$...$$ para equações em bloco.
      </p>
    );
  }
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$)/g);
  return (
    <div className="leading-relaxed text-slate-200 space-y-2 text-sm whitespace-pre-line">
      {parts.map((part, idx) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return (
            <BlockMath
              key={idx}
              math={part.slice(2, -2).trim()}
              renderError={() => <code className="text-amber-300 text-xs">{part}</code>}
            />
          );
        }
        if (part.startsWith('$') && part.endsWith('$')) {
          return (
            <InlineMath
              key={idx}
              math={part.slice(1, -1).trim()}
              renderError={() => <code className="text-amber-300 text-xs">{part}</code>}
            />
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </div>
  );
}

function computeElementsSignature(elements: readonly any[]): string {
  if (!elements || elements.length === 0) return '';
  return elements.map((el) => `${el.id}:${el.version}:${el.isDeleted ? 1 : 0}`).join('|');
}

export default function SolutionWhiteboard({
  apiUrl,
  token,
  targetType,
  targetId,
  defaultTitle,
  editableTitle = false,
  fillHeight = false,
  onRequireAuth,
  onClose,
  onSaved,
}: SolutionWhiteboardProps) {
  const [innerTab, setInnerTab] = useState<'board' | 'notes'>('board');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modos estilo Microsoft Whiteboard
  const [minimalUi, setMinimalUi] = useState(true);
  const [inkToShape, setInkToShape] = useState(true);
  const [penSideSelect, setPenSideSelect] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // Estado visual do dock inferior
  const [activeTool, setActiveTool] = useState<string>('freedraw');
  const [isHighlighter, setIsHighlighter] = useState(false);
  const [penColor, setPenColor] = useState('#f8fafc');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Caixa de seleção ao segurar o botão lateral da caneta
  const [sideDragBox, setSideDragBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [titleValue, setTitleValue] = useState(defaultTitle);
  const [notesValue, setNotesValue] = useState('');
  const [initialBoardData, setInitialBoardData] = useState<{ elements: any[]; appState: any } | null>(null);
  const [boardRevision, setBoardRevision] = useState(0);

  const excalidrawAPIRef = useRef<any>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const latestElementsRef = useRef<any[]>([]);
  const latestAppStateRef = useRef<{ viewBackgroundColor?: string; gridSize?: number | null }>({
    viewBackgroundColor: '#0b0f19',
    gridSize: 20,
  });
  const lastSignatureRef = useRef<string>('');
  const lastDrawToolRef = useRef<string>('freedraw');
  const processedStrokeIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(defaultTitle);
  const notesRef = useRef('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 1500);
  }, []);

  useEffect(() => {
    titleRef.current = titleValue;
  }, [titleValue]);

  useEffect(() => {
    notesRef.current = notesValue;
  }, [notesValue]);

  // Carrega a resolução salva do Neon ao trocar de questão/PDF
  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    processedStrokeIdsRef.current.clear();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    setSaveStatus('idle');
    setSaveError(null);
    setLastSavedAt(null);
    setTitleValue(defaultTitle);
    titleRef.current = defaultTitle;

    async function loadSolution() {
      if (!token) {
        const emptyElements: any[] = [];
        latestElementsRef.current = emptyElements;
        latestAppStateRef.current = { viewBackgroundColor: '#0b0f19', gridSize: 20 };
        lastSignatureRef.current = '';
        setNotesValue('');
        notesRef.current = '';
        setShowGrid(true);
        setInitialBoardData({
          elements: emptyElements,
          appState: {
            viewBackgroundColor: '#0b0f19',
            gridSize: 20,
            currentItemStrokeColor: '#f8fafc',
            currentItemStrokeWidth: 2,
            currentItemRoughness: 0,
            activeTool: { type: 'freedraw', locked: true },
          },
        });
        setBoardRevision((r) => r + 1);
        hydratedRef.current = true;
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${apiUrl}/solutions/${targetType}/${targetId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Não foi possível carregar sua resolução salva.');
        const data = await res.json();
        if (cancelled) return;

        const loadedElements = Array.isArray(data.board_json?.elements) ? data.board_json.elements : [];
        for (const el of loadedElements) {
          if (el?.id) processedStrokeIdsRef.current.add(el.id);
        }

        const loadedGrid = data.board_json?.appState?.gridSize ?? 20;
        const loadedAppState = {
          viewBackgroundColor: data.board_json?.appState?.viewBackgroundColor || '#0b0f19',
          gridSize: loadedGrid,
        };
        const loadedNotes = data.notes_markdown || '';
        const loadedTitle = data.title_override || defaultTitle;

        latestElementsRef.current = loadedElements;
        latestAppStateRef.current = loadedAppState;
        lastSignatureRef.current = computeElementsSignature(loadedElements);

        setShowGrid(Boolean(loadedGrid));
        setTitleValue(loadedTitle);
        titleRef.current = loadedTitle;
        setNotesValue(loadedNotes);
        notesRef.current = loadedNotes;
        setLastSavedAt(data.updated_at || null);
        setInitialBoardData({
          elements: loadedElements,
          appState: {
            ...loadedAppState,
            currentItemStrokeColor: '#f8fafc',
            currentItemStrokeWidth: 2,
            currentItemRoughness: 0,
            activeTool: { type: 'freedraw', locked: true },
          },
        });
        setBoardRevision((r) => r + 1);
        if (data.exists) setSaveStatus('saved');
      } catch (err: any) {
        if (!cancelled) {
          setSaveError(err.message || 'Erro ao carregar lousa.');
          setInitialBoardData({
            elements: [],
            appState: { viewBackgroundColor: '#0b0f19', gridSize: 20 },
          });
          setBoardRevision((r) => r + 1);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTimeout(() => {
            hydratedRef.current = true;
          }, 250);
        }
      }
    }

    loadSolution();

    return () => {
      cancelled = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [apiUrl, token, targetType, targetId, defaultTitle]);

  const persistToCloud = useCallback(async () => {
    if (!token) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    setSaveStatus('saving');
    setSaveError(null);

    try {
      const payload = {
        title_override: titleRef.current.trim(),
        notes_markdown: notesRef.current,
        board_json: {
          elements: latestElementsRef.current,
          appState: {
            viewBackgroundColor: latestAppStateRef.current.viewBackgroundColor || '#0b0f19',
            gridSize: latestAppStateRef.current.gridSize ?? null,
          },
        },
      };

      const res = await fetch(`${apiUrl}/solutions/${targetType}/${targetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Falha ao salvar na nuvem.');

      setSaveStatus('saved');
      setLastSavedAt(data.updated_at || new Date().toISOString());
      onSaved?.({
        updatedAt: data.updated_at || new Date().toISOString(),
        elementCount: data.element_count ?? 0,
        titleOverride: data.title_override ?? titleRef.current.trim(),
      });
    } catch (err: any) {
      setSaveStatus('error');
      setSaveError(err.message || 'Erro ao salvar.');
    }
  }, [apiUrl, token, targetType, targetId, onSaved]);

  const scheduleAutoSave = useCallback(() => {
    if (!token || !hydratedRef.current) return;
    setSaveStatus('dirty');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      persistToCloud();
    }, 2200);
  }, [token, persistToCloud]);

  const handleBoardChange = useCallback(
    (elements: readonly any[], appState: any) => {
      const sig = computeElementsSignature(elements);
      latestElementsRef.current = [...elements];
      latestAppStateRef.current = {
        viewBackgroundColor: appState?.viewBackgroundColor || '#0b0f19',
        gridSize: appState?.gridSize ?? null,
      };

      const currentType = appState?.activeTool?.type;
      if (currentType && currentType !== activeTool) {
        setActiveTool(currentType);
        if (currentType !== 'selection' && currentType !== 'hand') {
          lastDrawToolRef.current = currentType;
        }
      }

      if (!hydratedRef.current) {
        lastSignatureRef.current = sig;
        return;
      }

      if (sig !== lastSignatureRef.current) {
        lastSignatureRef.current = sig;
        scheduleAutoSave();
      }
    },
    [activeTool, scheduleAutoSave]
  );

  // Aciona Ink-to-Shape ao levantar a caneta/mouse após finalizar um traço livre
  const tryConvertLatestFreehand = useCallback(() => {
    if (!inkToShape) return;
    const api = excalidrawAPIRef.current;
    if (!api) return;

    const appState = api.getAppState?.();
    if (appState?.activeTool?.type !== 'freedraw') return;

    const elements: any[] = api.getSceneElements?.() || [];
    if (!elements.length) return;

    // Pega o último traço livre ativo ainda não analisado
    let candidate: any = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el.isDeleted && el.type === 'freedraw') {
        candidate = el;
        break;
      }
    }
    if (!candidate || processedStrokeIdsRef.current.has(candidate.id)) return;
    processedStrokeIdsRef.current.add(candidate.id);

    const shape = recognizeHandDrawnShape(candidate);
    if (!shape) return;

    const newElement = buildExcalidrawShapeFromFreehand(candidate, shape);
    if (!newElement) return;

    processedStrokeIdsRef.current.add(newElement.id);
    const updatedElements = elements.map((el) => (el.id === candidate.id ? newElement : el));

    api.updateScene({
      elements: updatedElements,
    });

    const labels: Record<RecognizedShape['kind'], string> = {
      ellipse: 'Círculo / Elipse ajustado',
      rectangle: 'Retângulo ajustado',
      line: 'Linha reta ajustada',
      triangle: 'Triângulo ajustado',
    };
    showToast(labels[shape.kind]);
  }, [inkToShape, showToast]);

  const handleCanvasPointerUp = useCallback(() => {
    if (!inkToShape) return;
    // Aguarda um frame para o Excalidraw finalizar o elemento freedraw no scene
    setTimeout(() => {
      tryConvertLatestFreehand();
    }, 35);
  }, [inkToShape, tryConvertLatestFreehand]);

  // Ferramentas do dock estilo Microsoft Whiteboard
  const selectPen = useCallback(
    (color = penColor, width = strokeWidth) => {
      const api = excalidrawAPIRef.current;
      setIsHighlighter(false);
      setPenColor(color);
      setStrokeWidth(width);
      setActiveTool('freedraw');
      lastDrawToolRef.current = 'freedraw';
      if (!api) return;
      api.setActiveTool({ type: 'freedraw', locked: true });
      api.updateScene({
        appState: {
          currentItemStrokeColor: color,
          currentItemStrokeWidth: width,
          currentItemOpacity: 100,
          currentItemRoughness: 0,
        },
      });
    },
    [penColor, strokeWidth]
  );

  const selectHighlighter = useCallback(() => {
    const api = excalidrawAPIRef.current;
    setIsHighlighter(true);
    setActiveTool('freedraw');
    lastDrawToolRef.current = 'freedraw';
    if (!api) return;
    api.setActiveTool({ type: 'freedraw', locked: true });
    api.updateScene({
      appState: {
        currentItemStrokeColor: '#facc15',
        currentItemStrokeWidth: 4,
        currentItemOpacity: 35,
        currentItemRoughness: 0,
      },
    });
  }, []);

  const selectTool = useCallback((toolType: string, lock = false) => {
    const api = excalidrawAPIRef.current;
    setIsHighlighter(false);
    setActiveTool(toolType);
    if (toolType !== 'selection' && toolType !== 'hand') {
      lastDrawToolRef.current = toolType;
    }
    if (!api) return;
    api.setActiveTool({ type: toolType, locked: lock });
  }, []);

  const toggleGrid = useCallback(() => {
    const api = excalidrawAPIRef.current;
    setShowGrid((prev) => {
      const next = !prev;
      const gridVal = next ? 20 : null;
      latestAppStateRef.current.gridSize = gridVal;
      if (api) {
        api.updateScene({ appState: { gridSize: gridVal } });
      }
      scheduleAutoSave();
      return next;
    });
  }, [scheduleAutoSave]);

  // Botão lateral da caneta: clique alterna Selecionar <-> Caneta; segurar + arrastar seleciona área
  const handlePointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!penSideSelect || innerTab !== 'board') return;
      if (e.shiftKey) return; // Shift + botão direito preserva menu de contexto

      const isSideButton =
        e.button === 2 ||
        e.button === 5 ||
        (e.pointerType === 'pen' && ((e.buttons & 2) !== 0 || (e.buttons & 32) !== 0));

      if (!isSideButton) return;

      // Não intercepta cliques nos botões do nosso próprio dock flutuante
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-wb-dock="true"]')) return;

      e.preventDefault();
      e.stopPropagation();

      const host = canvasHostRef.current;
      const api = excalidrawAPIRef.current;
      if (!host || !api) return;

      const hostRect = host.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      let isDragging = false;
      let curX = startX;
      let curY = startY;

      const onMove = (ev: PointerEvent) => {
        curX = ev.clientX;
        curY = ev.clientY;
        if (!isDragging && Math.hypot(curX - startX, curY - startY) >= 8) {
          isDragging = true;
        }
        if (isDragging) {
          const left = Math.min(startX, curX) - hostRect.left;
          const top = Math.min(startY, curY) - hostRect.top;
          const width = Math.abs(curX - startX);
          const height = Math.abs(curY - startY);
          setSideDragBox({ left, top, width, height });
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        setSideDragBox(null);

        if (!isDragging) {
          // Clique rápido no botão lateral: alterna Selecionar <-> última ferramenta de desenho
          const curTool = api.getAppState?.()?.activeTool?.type;
          if (curTool === 'selection') {
            const backTool = lastDrawToolRef.current || 'freedraw';
            api.setActiveTool({ type: backTool, locked: backTool === 'freedraw' });
            setActiveTool(backTool);
            showToast(backTool === 'freedraw' ? 'Modo Caneta' : `Ferramenta: ${backTool}`);
          } else {
            api.setActiveTool({ type: 'selection', locked: false });
            setActiveTool('selection');
            setIsHighlighter(false);
            showToast('Modo Seleção (botão lateral)');
          }
          return;
        }

        // Arrastou segurando o botão lateral: seleciona todos os elementos na caixa
        const appState = api.getAppState?.();
        const zoom = appState?.zoom?.value || 1;
        const offsetLeft = typeof appState?.offsetLeft === 'number' ? appState.offsetLeft : hostRect.left;
        const offsetTop = typeof appState?.offsetTop === 'number' ? appState.offsetTop : hostRect.top;
        const scrollX = appState?.scrollX || 0;
        const scrollY = appState?.scrollY || 0;

        const sx1 = (Math.min(startX, curX) - offsetLeft) / zoom - scrollX;
        const sy1 = (Math.min(startY, curY) - offsetTop) / zoom - scrollY;
        const sx2 = (Math.max(startX, curX) - offsetLeft) / zoom - scrollX;
        const sy2 = (Math.max(startY, curY) - offsetTop) / zoom - scrollY;

        const elements: any[] = api.getSceneElements?.() || [];
        const selectedElementIds: Record<string, true> = {};
        let count = 0;

        for (const el of elements) {
          if (el.isDeleted) continue;
          const b = getElementBounds(el);
          const intersects = b.maxX >= sx1 && b.minX <= sx2 && b.maxY >= sy1 && b.minY <= sy2;
          if (intersects) {
            selectedElementIds[el.id] = true;
            count++;
          }
        }

        api.setActiveTool({ type: 'selection', locked: false });
        setActiveTool('selection');
        setIsHighlighter(false);
        api.updateScene({
          appState: { selectedElementIds },
        });
        showToast(count > 0 ? `${count} item(ns) selecionado(s)` : 'Modo Seleção');
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    },
    [penSideSelect, innerTab, showToast]
  );

  // Atalho ESC para sair da tela cheia
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const rootClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-[#0b0f19] flex flex-col'
    : fillHeight
    ? 'bg-[#111827] border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full min-h-0'
    : 'bg-[#111827] border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[78vh] min-h-[580px]';

  return (
    <div className={rootClass}>
      {/* CSS escopado para ocultar barras redundantes do Excalidraw no modo limpo MS Whiteboard */}
      <style jsx global>{`
        .noic-wb-minimal .excalidraw .App-menu_top,
        .noic-wb-minimal .excalidraw .App-menu_left,
        .noic-wb-minimal .excalidraw .App-menu__left,
        .noic-wb-minimal .excalidraw .App-toolbar-container,
        .noic-wb-minimal .excalidraw .layer-ui__wrapper__top-right,
        .noic-wb-minimal .excalidraw .layer-ui__wrapper__footer-right,
        .noic-wb-minimal .excalidraw .HintViewer {
          display: none !important;
        }
        .noic-wb-minimal .excalidraw .layer-ui__wrapper__footer-left {
          opacity: 0.72;
          transform: scale(0.9);
          transform-origin: bottom left;
        }
        .noic-wb-minimal .excalidraw .layer-ui__wrapper__footer-left:hover {
          opacity: 1;
        }
      `}</style>

      {/* Barra superior ultra-compacta */}
      <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="inline-flex rounded-lg bg-[#0b0f19] p-0.5 border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setInnerTab('board')}
              className={`px-2 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
                innerTab === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" /> Lousa
            </button>
            <button
              type="button"
              onClick={() => setInnerTab('notes')}
              className={`px-2 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
                innerTab === 'notes' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> LaTeX
            </button>
          </div>

          {editableTitle ? (
            <input
              type="text"
              value={titleValue}
              onChange={(e) => {
                setTitleValue(e.target.value);
                titleRef.current = e.target.value;
                scheduleAutoSave();
              }}
              placeholder="Título da lousa..."
              className="px-2 py-1 rounded-md bg-[#0b0f19] border border-slate-700 text-xs font-semibold text-white min-w-[120px] max-w-[240px] focus:border-indigo-500 focus:outline-none"
            />
          ) : (
            <span className="text-xs font-medium text-slate-400 truncate hidden md:inline">
              {titleValue}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {innerTab === 'board' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setInkToShape((prev) => {
                    showToast(!prev ? 'Ink-to-Shape ativado' : 'Ink-to-Shape desativado');
                    return !prev;
                  });
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition flex items-center gap-1 border ${
                  inkToShape
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    : 'bg-[#0b0f19] text-slate-400 border-slate-800 hover:text-white'
                }`}
                title="Converte círculos, linhas, retângulos e triângulos desenhados à mão em formas perfeitas"
              >
                <Sparkles className="w-3 h-3" />
                <span className="hidden sm:inline">Formas</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPenSideSelect((prev) => {
                    showToast(
                      !prev
                        ? 'Botão lateral da caneta → Selecionar'
                        : 'Botão lateral restaurado (menu padrão)'
                    );
                    return !prev;
                  });
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition flex items-center gap-1 border ${
                  penSideSelect
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
                    : 'bg-[#0b0f19] text-slate-400 border-slate-800 hover:text-white'
                }`}
                title="Clique no botão lateral alterna Selecionar/Caneta; segurar e arrastar seleciona uma área"
              >
                <MousePointer2 className="w-3 h-3" />
                <span className="hidden xl:inline">Botão Lateral</span>
              </button>

              <button
                type="button"
                onClick={() => setMinimalUi((prev) => !prev)}
                className={`p-1.5 rounded-md transition border ${
                  !minimalUi
                    ? 'bg-indigo-600/25 text-indigo-300 border-indigo-500/40'
                    : 'bg-[#0b0f19] text-slate-400 border-slate-800 hover:text-white'
                }`}
                title={
                  minimalUi
                    ? 'Mostrar menu completo do Excalidraw (exportar PNG, propriedades, etc.)'
                    : 'Voltar para o modo limpo Microsoft Whiteboard'
                }
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {!token ? (
            <button
              type="button"
              onClick={onRequireAuth}
              className="px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 transition flex items-center gap-1"
            >
              <CloudOff className="w-3.5 h-3.5" /> Entrar
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-mono px-1">
              {saveStatus === 'saving' && (
                <span className="text-indigo-300 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-400 flex items-center gap-1" title={lastSavedAt || 'Salvo'}>
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
              {saveStatus === 'dirty' && (
                <span className="text-amber-300 flex items-center gap-1" title="Alterações pendentes">
                  <Cloud className="w-3.5 h-3.5" />
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-rose-400" title={saveError || 'Erro ao salvar'}>
                  !
                </span>
              )}
            </div>
          )}

          {token && (
            <button
              type="button"
              onClick={persistToCloud}
              disabled={saveStatus === 'saving'}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white transition disabled:opacity-50"
              title="Salvar agora no Drive"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title={isFullscreen ? 'Sair da tela cheia (ESC)' : 'Lousa em tela cheia'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {onClose && !isFullscreen && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              title="Fechar painel da lousa"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="px-3 py-1.5 bg-rose-500/10 border-b border-rose-500/30 text-xs text-rose-300 shrink-0">
          {saveError}
        </div>
      )}

      {/* Área principal */}
      <div
        ref={canvasHostRef}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerUp={handleCanvasPointerUp}
        onContextMenu={(e) => {
          if (penSideSelect && innerTab === 'board' && !e.shiftKey) {
            e.preventDefault();
          }
        }}
        className={`flex-1 min-h-0 relative bg-[#0b0f19] ${minimalUi ? 'noic-wb-minimal' : ''}`}
      >
        {loading || !initialBoardData ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            Carregando sua lousa do Drive...
          </div>
        ) : innerTab === 'board' ? (
          <>
            <div className="w-full h-full">
              <Excalidraw
                key={`${targetType}-${targetId}-${boardRevision}`}
                excalidrawAPI={(api) => {
                  excalidrawAPIRef.current = api;
                }}
                theme="dark"
                langCode="pt-BR"
                initialData={{
                  elements: initialBoardData.elements,
                  appState: {
                    ...initialBoardData.appState,
                    theme: 'dark',
                  },
                }}
                onChange={handleBoardChange}
                UIOptions={{
                  canvasActions: {
                    loadScene: false,
                    saveToActiveFile: false,
                    toggleTheme: true,
                    export: { saveFileToDisk: true },
                  },
                }}
              />
            </div>

            {/* Caixa de seleção ao segurar o botão lateral da caneta */}
            {sideDragBox && (
              <div
                className="pointer-events-none absolute z-30 border-2 border-cyan-400 bg-cyan-400/15 rounded-sm"
                style={{
                  left: sideDragBox.left,
                  top: sideDragBox.top,
                  width: sideDragBox.width,
                  height: sideDragBox.height,
                }}
              />
            )}

            {/* Feedback discreto de forma reconhecida / troca de ferramenta */}
            {toastMsg && (
              <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700 text-[11px] font-medium text-slate-200 shadow-lg backdrop-blur">
                {toastMsg}
              </div>
            )}

            {/* Dock flutuante estilo Microsoft Whiteboard */}
            {minimalUi && (
              <div
                data-wb-dock="true"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[96%] overflow-x-auto bg-[#0f172a]/92 backdrop-blur-md border border-slate-700/80 rounded-2xl px-2.5 py-1.5 shadow-2xl shadow-black/50 flex items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => selectTool('selection', false)}
                  className={`p-2 rounded-xl transition ${
                    activeTool === 'selection'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Selecionar (V ou botão lateral da caneta)"
                >
                  <MousePointer2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => selectPen(penColor, strokeWidth)}
                  className={`p-2 rounded-xl transition ${
                    activeTool === 'freedraw' && !isHighlighter
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Caneta (P)"
                >
                  <PenTool className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={selectHighlighter}
                  className={`p-2 rounded-xl transition ${
                    activeTool === 'freedraw' && isHighlighter
                      ? 'bg-amber-500/25 text-amber-300 ring-1 ring-amber-400/50'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Marca-texto"
                >
                  <Highlighter className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('eraser', true)}
                  className={`p-2 rounded-xl transition ${
                    activeTool === 'eraser'
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Borracha (E)"
                >
                  <Eraser className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('arrow', false)}
                  className={`p-2 rounded-xl transition ${
                    activeTool === 'arrow'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Seta / Vetor (A)"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('text', false)}
                  className={`p-2 rounded-xl transition ${
                    activeTool === 'text'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Texto (T)"
                >
                  <Type className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => selectTool('hand', false)}
                  className={`p-2 rounded-xl transition ${
                    activeTool === 'hand'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title="Mover lousa (H ou Espaço)"
                >
                  <Hand className="w-4 h-4" />
                </button>

                <div className="w-px h-6 bg-slate-700/80 mx-0.5 shrink-0" />

                {/* Cores rápidas */}
                <div className="flex items-center gap-1 px-0.5">
                  {PEN_COLORS.map((c) => {
                    const selected = !isHighlighter && penColor === c.hex && activeTool === 'freedraw';
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => selectPen(c.hex, strokeWidth)}
                        title={c.label}
                        className={`w-5 h-5 rounded-full transition-transform ${
                          selected
                            ? 'scale-115 ring-2 ring-white ring-offset-2 ring-offset-[#0f172a]'
                            : 'hover:scale-110 opacity-85 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
                </div>

                <div className="w-px h-6 bg-slate-700/80 mx-0.5 shrink-0" />

                {/* Espessuras */}
                <div className="flex items-center gap-0.5">
                  {STROKE_WIDTHS.map((sw) => (
                    <button
                      key={sw.value}
                      type="button"
                      onClick={() => selectPen(penColor, sw.value)}
                      title={`Traço ${sw.label}`}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                        !isHighlighter && strokeWidth === sw.value
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <span
                        className="rounded-full bg-current block"
                        style={{
                          width: sw.value === 1 ? 4 : sw.value === 2 ? 7 : 10,
                          height: sw.value === 1 ? 4 : sw.value === 2 ? 7 : 10,
                        }}
                      />
                    </button>
                  ))}
                </div>

                <div className="w-px h-6 bg-slate-700/80 mx-0.5 shrink-0" />

                <button
                  type="button"
                  onClick={toggleGrid}
                  className={`p-2 rounded-xl transition ${
                    showGrid
                      ? 'bg-slate-800 text-indigo-300'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={showGrid ? 'Ocultar grade' : 'Mostrar grade'}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-hidden">
            <div className="flex flex-col h-full p-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 mb-2">
                Anotações em Markdown / LaTeX
              </div>
              <textarea
                value={notesValue}
                onChange={(e) => {
                  setNotesValue(e.target.value);
                  notesRef.current = e.target.value;
                  scheduleAutoSave();
                }}
                placeholder="Anote sua dedução, equações-chave (ex: $$F = m\ddot{x}$$) ou pontos de revisão..."
                className="flex-1 w-full resize-none rounded-lg bg-[#111827] border border-slate-800 p-3 text-sm font-mono text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col h-full p-4 overflow-y-auto bg-[#0f1629]/40">
              <div className="text-[11px] font-mono uppercase text-indigo-400 mb-2">
                Preview Renderizado (KaTeX)
              </div>
              <NotesMathPreview content={notesValue} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
