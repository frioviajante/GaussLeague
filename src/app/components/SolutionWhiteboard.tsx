'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { InlineMath, BlockMath } from 'react-katex';
import {
  PenTool,
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
  onRequireAuth: () => void;
  onClose?: () => void;
  onSaved?: (meta: { updatedAt: string; elementCount: number; titleOverride: string }) => void;
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
  onRequireAuth,
  onClose,
  onSaved,
}: SolutionWhiteboardProps) {
  const [innerTab, setInnerTab] = useState<'board' | 'notes'>('board');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const [titleValue, setTitleValue] = useState(defaultTitle);
  const [notesValue, setNotesValue] = useState('');
  const [initialBoardData, setInitialBoardData] = useState<{ elements: any[]; appState: any } | null>(null);
  const [boardRevision, setBoardRevision] = useState(0);

  const latestElementsRef = useRef<any[]>([]);
  const latestAppStateRef = useRef<{ viewBackgroundColor?: string; gridSize?: number | null }>({
    viewBackgroundColor: '#0b0f19',
    gridSize: 20,
  });
  const lastSignatureRef = useRef<string>('');
  const titleRef = useRef(defaultTitle);
  const notesRef = useRef('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

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
        setInitialBoardData({
          elements: emptyElements,
          appState: { viewBackgroundColor: '#0b0f19', gridSize: 20 },
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
        const loadedAppState = {
          viewBackgroundColor: data.board_json?.appState?.viewBackgroundColor || '#0b0f19',
          gridSize: data.board_json?.appState?.gridSize ?? 20,
        };
        const loadedNotes = data.notes_markdown || '';
        const loadedTitle = data.title_override || defaultTitle;

        latestElementsRef.current = loadedElements;
        latestAppStateRef.current = loadedAppState;
        lastSignatureRef.current = computeElementsSignature(loadedElements);

        setTitleValue(loadedTitle);
        titleRef.current = loadedTitle;
        setNotesValue(loadedNotes);
        notesRef.current = loadedNotes;
        setLastSavedAt(data.updated_at || null);
        setInitialBoardData({ elements: loadedElements, appState: loadedAppState });
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
            gridSize: latestAppStateRef.current.gridSize ?? 20,
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
        gridSize: appState?.gridSize ?? 20,
      };

      if (!hydratedRef.current) {
        lastSignatureRef.current = sig;
        return;
      }

      if (sig !== lastSignatureRef.current) {
        lastSignatureRef.current = sig;
        scheduleAutoSave();
      }
    },
    [scheduleAutoSave]
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

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#0b0f19] flex flex-col'
          : 'bg-[#111827] border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[78vh] min-h-[580px]'
      }
    >
      {/* Barra superior da Lousa */}
      <div className="px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="inline-flex rounded-lg bg-[#0b0f19] p-0.5 border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setInnerTab('board')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                innerTab === 'board' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" /> Lousa
            </button>
            <button
              type="button"
              onClick={() => setInnerTab('notes')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                innerTab === 'notes' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Notas LaTeX
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
              className="px-2.5 py-1 rounded-md bg-[#0b0f19] border border-slate-700 text-xs font-semibold text-white min-w-[140px] max-w-[260px] focus:border-indigo-500 focus:outline-none"
            />
          ) : (
            <span className="text-xs font-medium text-slate-300 truncate hidden sm:inline">
              {titleValue}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Indicador de salvamento na nuvem */}
          {!token ? (
            <button
              type="button"
              onClick={onRequireAuth}
              className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 transition flex items-center gap-1"
            >
              <CloudOff className="w-3.5 h-3.5" /> Entrar para salvar
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              {saveStatus === 'saving' && (
                <span className="text-indigo-300 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-400 flex items-center gap-1" title={lastSavedAt || ''}>
                  <Check className="w-3.5 h-3.5" /> Salvo no Drive
                </span>
              )}
              {saveStatus === 'dirty' && (
                <span className="text-amber-300 flex items-center gap-1">
                  <Cloud className="w-3.5 h-3.5" /> Alterações pendentes
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-rose-400" title={saveError || ''}>
                  Erro ao salvar
                </span>
              )}
            </div>
          )}

          {token && (
            <button
              type="button"
              onClick={persistToCloud}
              disabled={saveStatus === 'saving'}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs font-semibold text-slate-200 hover:text-white transition flex items-center gap-1 disabled:opacity-50"
              title="Salvar agora no Drive"
            >
              <Save className="w-3.5 h-3.5" /> Salvar
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            title={isFullscreen ? 'Sair da tela cheia (ESC)' : 'Expandir tela cheia'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onClose && !isFullscreen && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              title="Fechar painel da lousa"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/30 text-xs text-rose-300 shrink-0">
          {saveError}
        </div>
      )}

      {/* Área principal */}
      <div className="flex-1 min-h-0 relative bg-[#0b0f19]">
        {loading || !initialBoardData ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            Carregando sua lousa do Drive...
          </div>
        ) : innerTab === 'board' ? (
          <div className="w-full h-full">
            <Excalidraw
              key={`${targetType}-${targetId}-${boardRevision}`}
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
