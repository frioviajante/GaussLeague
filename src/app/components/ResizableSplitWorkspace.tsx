'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  GripVertical,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface ResizableSplitWorkspaceProps {
  left: React.ReactNode;
  right: React.ReactNode;
  headerSummary?: React.ReactNode;
  defaultLeftPercent?: number;
}

export default function ResizableSplitWorkspace({
  left,
  right,
  headerSummary,
  defaultLeftPercent = 38,
}: ResizableSplitWorkspaceProps) {
  const [leftPercent, setLeftPercent] = useState(defaultLeftPercent);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPercent(Math.max(22, Math.min(68, Math.round(pct))));
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  const wrapperClass = focusMode
    ? 'fixed inset-0 z-40 bg-[#0b0f19] p-2 flex flex-col gap-2'
    : 'flex flex-col gap-2 h-[calc(100vh-6.25rem)] min-h-[620px]';

  return (
    <div className={wrapperClass}>
      {/* Barra fina de controle do split-screen */}
      <div className="px-3 py-1.5 rounded-xl bg-[#111827] border border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setLeftCollapsed((p) => !p)}
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition flex items-center gap-1.5 shrink-0"
            title={leftCollapsed ? 'Mostrar enunciado / PDF' : 'Recolher enunciado e maximizar lousa'}
          >
            {leftCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{leftCollapsed ? 'Mostrar Enunciado' : 'Ocultar Enunciado'}</span>
          </button>

          {headerSummary && <div className="min-w-0 truncate">{headerSummary}</div>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!leftCollapsed && (
            <div className="hidden lg:inline-flex items-center rounded-lg bg-[#0b0f19] p-0.5 border border-slate-800 text-[11px] font-mono">
              {[
                { label: '30/70', val: 30 },
                { label: '40/60', val: 40 },
                { label: '50/50', val: 50 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setLeftPercent(preset.val)}
                  className={`px-2 py-0.5 rounded transition ${
                    Math.abs(leftPercent - preset.val) <= 3
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setFocusMode((p) => !p)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 border ${
              focusMode
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Expande o espaço dividido para 100% da tela (oculta o cabeçalho do site)"
          >
            {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {focusMode ? 'Sair do Modo Foco' : 'Tela Ampla'}
          </button>
        </div>
      </div>

      {/* Área dividida */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2 lg:gap-0 relative"
      >
        {/* Escudo invisível durante o arrasto para o iframe do PDF não roubar o ponteiro */}
        {isDragging && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

        {!leftCollapsed && (
          <>
            <div
              className="min-h-0 h-full overflow-y-auto pr-0 lg:pr-1.5 shrink-0"
              style={{ flexBasis: `${leftPercent}%` }}
            >
              {left}
            </div>

            {/* Divisória arrastável (desktop) */}
            <div
              role="separator"
              aria-orientation="vertical"
              onPointerDown={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              className="hidden lg:flex w-3 shrink-0 cursor-col-resize items-center justify-center group select-none"
              title="Arraste para redimensionar"
            >
              <div className="w-1 h-16 rounded-full bg-slate-700 group-hover:bg-indigo-400 group-hover:h-24 transition-all flex items-center justify-center">
                <GripVertical className="w-3 h-3 text-slate-400 group-hover:text-white" />
              </div>
            </div>
          </>
        )}

        <div className="flex-1 min-w-0 min-h-0 h-full">{right}</div>
      </div>
    </div>
  );
}
