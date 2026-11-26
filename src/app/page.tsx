'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { InlineMath, BlockMath } from 'react-katex';
import {
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  BookOpen,
  Code2,
  Send,
  LogIn,
  LogOut,
  BarChart3,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Award,
  Tag,
  Search,
  User,
  TrendingUp,
  FileText,
  ExternalLink,
  PenTool,
  FolderOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import noicLogo from './noic.png';

const SolutionWhiteboard = dynamic(() => import('./components/SolutionWhiteboard'), {
  ssr: false,
  loading: () => (
    <div className="bg-[#111827] border border-slate-800 rounded-xl h-[78vh] min-h-[580px] flex items-center justify-center text-sm text-slate-400">
      Inicializando mesa digital (Excalidraw)...
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type ProblemSource = 'irodov' | 'noic';

interface UserProfile {
  id: string;
  username: string;
  email?: string;
  rating: number;
  max_rating: number;
  solved_count: number;
}

interface RatingPoint {
  id: string;
  old_rating: number;
  new_rating: number;
  delta: number;
  created_at: string;
  problem_code?: string | null;
  problem_title?: string | null;
}

interface CategoryStat {
  category: string;
  count: number;
}

interface ProfileSubmission {
  id: string;
  problem_id: string;
  verdict: 'AC' | 'WA' | 'PE';
  created_at: string;
  problem_code: string;
  problem_title: string;
  category: string;
  difficulty_rating: number;
  source?: string;
  olympiad_id?: string | null;
}

interface PublicProfileData {
  user: UserProfile;
  rating_history: RatingPoint[];
  category_stats: CategoryStat[];
  recent_submissions: ProfileSubmission[];
}

interface Olympiad {
  id: string;
  competition: string;
  year: number;
  title: string;
  duration_minutes: number;
}

interface OlympiadPaper {
  id: string;
  olympiad_id: string;
  tab_order: number;
  tab_label: string;
  title?: string | null;
  exam_pdf_url: string;
  solution_pdf_url?: string | null;
}

interface Problem {
  id: string;
  irodov_code: string;
  title: string;
  category: string;
  raw_category?: string;
  difficulty_rating: number;
  statement_latex: string;
  svg_diagram?: string;
  figure_url?: string | null;
  answer_type: 'numeric' | 'algebraic' | 'self_graded';
  unit?: string;
  variables_hint?: string;
  source?: string;
  olympiad_id?: string | null;
}

interface Submission {
  id: string;
  problem_id: string;
  submitted_answer: string;
  verdict: 'AC' | 'WA' | 'PE';
  created_at: string;
}

interface DriveSolutionItem {
  id: string;
  target_type: 'problem' | 'olympiad_paper' | 'scratchpad';
  target_id: string;
  title_override?: string | null;
  element_count: number;
  has_notes: boolean;
  has_board: boolean;
  created_at: string;
  updated_at: string;
  problem_code?: string | null;
  problem_title?: string | null;
  problem_source?: string | null;
  problem_rating?: number | null;
  paper_olympiad_id?: string | null;
  paper_tab_label?: string | null;
  paper_title?: string | null;
  olympiad_competition?: string | null;
  olympiad_year?: number | null;
  olympiad_title?: string | null;
  olympiad_duration?: number | null;
}

const RATING_PRESETS = [
  { label: 'Qualquer', min: '', max: '' },
  { label: '≤ 1400', min: '', max: '1400' },
  { label: '1400–1700', min: '1400', max: '1700' },
  { label: '1700–2000', min: '1700', max: '2000' },
  { label: '2000–2400', min: '2000', max: '2400' },
  { label: '2400+', min: '2400', max: '' },
];

const OLYMPIAD_CATALOG = [
  {
    code: 'IPhO',
    name: 'International Physics Olympiad',
    duration: '5h',
    badge: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  {
    code: 'EuPhO',
    name: 'European Physics Olympiad',
    duration: '5h',
    badge: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  },
  {
    code: 'APhO',
    name: 'Asian Physics Olympiad',
    duration: '5h',
    badge: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  },
  {
    code: 'RMPH',
    name: 'Romanian Master of Physics',
    duration: '5h',
    badge: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  },
  {
    code: 'NBPhO',
    name: 'Nordic-Baltic Physics Olympiad',
    duration: '5h',
    badge: 'text-sky-400 border-sky-500/30 bg-sky-500/10',
  },
  {
    code: 'OIbF',
    name: 'Olimpíada Ibero-Americana de Física',
    duration: '5h',
    badge: 'text-lime-400 border-lime-500/30 bg-lime-500/10',
  },
  {
    code: 'WoPhO',
    name: 'World Physics Olympiad',
    duration: '5h',
    badge: 'text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10',
  },
  {
    code: 'GPhO',
    name: 'Gulf Physics Olympiad',
    duration: '5h',
    badge: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  },
  {
    code: 'IZhO',
    name: 'International Zhautykov Olympiad',
    duration: '5h',
    badge: 'text-teal-400 border-teal-500/30 bg-teal-500/10',
  },
  {
    code: 'ISPhO',
    name: 'International Scientific Physics Olympiad',
    duration: '5h',
    badge: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  },
  {
    code: 'BIOPh',
    name: 'Brazilian International Olympiad of Physics',
    duration: '4h',
    badge: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  },
  {
    code: 'OBF',
    name: 'Olimpíada Brasileira de Física (3ª Fase N3)',
    duration: '4h',
    badge: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  {
    code: 'SOIF',
    name: 'Seletiva Brasileira para Olimpíadas Internacionais',
    duration: '5h',
    badge: 'text-green-400 border-green-500/30 bg-green-500/10',
  },
  {
    code: 'USAPhO',
    name: 'USA Physics Olympiad',
    duration: '3h',
    badge: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  },
  {
    code: 'USA TST',
    name: 'USA Physics Team Selection Test',
    duration: '4h',
    badge: 'text-blue-300 border-blue-400/30 bg-blue-400/10',
  },
  {
    code: 'CPhO',
    name: 'Chinese Physics Olympiad (Finals)',
    duration: '3h',
    badge: 'text-red-400 border-red-500/30 bg-red-500/10',
  },
  {
    code: 'VsOSh',
    name: 'All-Russian Physics Olympiad (VsOSh)',
    duration: '5h',
    badge: 'text-pink-400 border-pink-500/30 bg-pink-500/10',
  },
  {
    code: 'Russia TST',
    name: 'Russian IPhO Team Selection Test',
    duration: '5h',
    badge: 'text-rose-300 border-rose-400/30 bg-rose-400/10',
  },
  {
    code: 'BPhO',
    name: 'British Physics Olympiad',
    duration: '3h',
    badge: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  },
];

const RANK_BANDS = [
  { min: 0, max: 1200, fill: 'rgba(148, 163, 184, 0.08)', stroke: '#94a3b8' },
  { min: 1200, max: 1400, fill: 'rgba(16, 185, 129, 0.09)', stroke: '#34d399' },
  { min: 1400, max: 1600, fill: 'rgba(6, 182, 212, 0.09)', stroke: '#22d3ee' },
  { min: 1600, max: 1900, fill: 'rgba(59, 130, 246, 0.10)', stroke: '#60a5fa' },
  { min: 1900, max: 2100, fill: 'rgba(168, 85, 247, 0.10)', stroke: '#c084fc' },
  { min: 2100, max: 2400, fill: 'rgba(245, 158, 11, 0.10)', stroke: '#fbbf24' },
  { min: 2400, max: 4000, fill: 'rgba(244, 63, 94, 0.10)', stroke: '#fb7185' },
];

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getRankInfo(rating: number) {
  if (rating < 1200) return { title: 'Newbie', color: 'text-gray-400', badge: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
  if (rating < 1400) return { title: 'Pupil', color: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
  if (rating < 1600) return { title: 'Specialist', color: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
  if (rating < 1900) return { title: 'Expert', color: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  if (rating < 2100) return { title: 'Candidate Master', color: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
  if (rating < 2400) return { title: 'Master', color: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
  return { title: 'Grandmaster', color: 'text-rose-500', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
}

function compareProblemCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function buildPdfViewerUrl(rawUrl: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  if (clean.startsWith('/') || clean.startsWith(API_URL)) {
    return `${clean}#view=FitH`;
  }
  return `${API_URL}/pdf-proxy?url=${encodeURIComponent(clean)}#view=FitH`;
}

function formatTimer(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toPreviewLatex(expr: string): string {
  if (!expr.trim()) return '';
  return expr
    .replace(/\*/g, ' \\cdot ')
    .replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}')
    .replace(/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)/g, '\\frac{$1}{$2}')
    .replace(/\b(alpha|beta|gamma|theta|omega|mu|rho|sigma|pi|Delta)\b/g, '\\$1')
    .replace(/_([a-zA-Z0-9]+)/g, '_{$1}')
    .replace(/\^([a-zA-Z0-9-]+)/g, '^{$1}');
}

function normalizeLatexText(raw: string): string {
  if (!raw) return '';
  const text = raw
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`)
    .replace(
      /\\\\(?=(?:mu|nu|alpha|beta|gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|vartheta|Theta|iota|kappa|lambda|Lambda|xi|pi|Pi|rho|sigma|Sigma|tau|phi|varphi|Phi|chi|psi|Psi|omega|Omega|frac|dfrac|sqrt|cdot|times|pm|mp|approx|leq|geq|neq|equiv|propto|infty|partial|nabla|vec|hat|bar|dot|ddot|sin|cos|tan|cot|sec|csc|ln|log|exp|text|mathrm|mathbf|left|right|sum|int|lim|to|rightarrow|degree)\b)/g,
      '\\'
    );

  const segments = text.split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$)/g);
  return segments
    .map((seg) => {
      if ((seg.startsWith('$$') && seg.endsWith('$$')) || (seg.startsWith('$') && seg.endsWith('$'))) {
        return seg;
      }
      return seg.replace(
        /\\(?:mu|nu|alpha|beta|gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|vartheta|Theta|iota|kappa|lambda|Lambda|xi|pi|Pi|rho|sigma|Sigma|tau|phi|varphi|Phi|chi|psi|Psi|omega|Omega|pm|mp|times|cdot|approx|leq|geq|neq|infty|propto|degree)\b(?:_\{[^}]+\}|_[a-zA-Z0-9]+|\^\{[^}]+\}|\^[a-zA-Z0-9]+)?/g,
        (match) => `$${match}$`
      );
    })
    .join('');
}

function MathText({ content }: { content: string }) {
  const normalized = useMemo(() => normalizeLatexText(content || ''), [content]);
  const parts = normalized.split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$)/g);

  return (
    <div className="leading-relaxed text-slate-200 space-y-2 whitespace-pre-line">
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

function RatingChart({ history, currentRating }: { history: RatingPoint[]; currentRating: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const points: RatingPoint[] = useMemo(() => {
    if (history.length > 0) return history;
    return [
      {
        id: 'initial',
        old_rating: currentRating,
        new_rating: currentRating,
        delta: 0,
        created_at: new Date().toISOString(),
        problem_code: null,
        problem_title: 'Rating inicial',
      },
    ];
  }, [history, currentRating]);

  const width = 760;
  const height = 270;
  const pad = { top: 20, right: 24, bottom: 34, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const ratings = points.map((p) => p.new_rating);
  const rawMin = Math.min(...ratings, 1100);
  const rawMax = Math.max(...ratings, 1450);
  const minY = Math.floor((rawMin - 100) / 100) * 100;
  const maxY = Math.ceil((rawMax + 100) / 100) * 100;
  const rangeY = Math.max(maxY - minY, 200);

  const toX = (idx: number) =>
    points.length === 1 ? pad.left + plotW / 2 : pad.left + (idx / (points.length - 1)) * plotW;
  const toY = (val: number) => pad.top + ((maxY - val) / rangeY) * plotH;

  const thresholds = [1200, 1400, 1600, 1900, 2100, 2400].filter((t) => t > minY && t < maxY);
  const polylinePoints = points.map((p, idx) => `${toX(idx)},${toY(p.new_rating)}`).join(' ');
  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : points[points.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#0b0f19] border border-slate-800 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-white text-sm">{activePoint.new_rating}</span>
          {activePoint.delta !== 0 && (
            <span
              className={`font-mono font-semibold ${
                activePoint.delta > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {activePoint.delta > 0 ? `+${activePoint.delta}` : activePoint.delta}
            </span>
          )}
          <span className="text-slate-300">
            {activePoint.problem_code
              ? `${activePoint.problem_code} — ${activePoint.problem_title || ''}`
              : activePoint.problem_title || 'Marco inicial'}
          </span>
        </div>
        <span className="font-mono text-slate-500">{formatFullDate(activePoint.created_at)}</span>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[520px] select-none">
          {RANK_BANDS.map((band) => {
            const topVal = Math.min(band.max, maxY);
            const botVal = Math.max(band.min, minY);
            if (topVal <= botVal) return null;
            const y = toY(topVal);
            const h = toY(botVal) - y;
            return (
              <rect
                key={band.min}
                x={pad.left}
                y={y}
                width={plotW}
                height={h}
                fill={band.fill}
              />
            );
          })}

          {thresholds.map((t) => {
            const y = toY(t);
            return (
              <g key={t}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={width - pad.right}
                  y2={y}
                  stroke="#334155"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8" fontFamily="monospace">
                  {t}
                </text>
              </g>
            );
          })}

          {points.map((p, idx) => {
            const step = Math.max(1, Math.ceil(points.length / 6));
            if (idx % step !== 0 && idx !== points.length - 1) return null;
            return (
              <text
                key={`x-${p.id}-${idx}`}
                x={toX(idx)}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fill="#64748b"
                fontFamily="monospace"
              >
                {formatShortDate(p.created_at)}
              </text>
            );
          })}

          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylinePoints}
            />
          )}

          {points.map((p, idx) => {
            const cx = toX(idx);
            const cy = toY(p.new_rating);
            const isActive = hoveredIdx === idx || (hoveredIdx === null && idx === points.length - 1);
            return (
              <g
                key={`${p.id}-${idx}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                <circle cx={cx} cy={cy} r={12} fill="transparent" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 5.5 : 3.5}
                  fill={isActive ? '#fbbf24' : '#0f172a'}
                  stroke="#f59e0b"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function NoicLeaguePage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<
    'problem' | 'tags' | 'editorial' | 'standings' | 'olympiads' | 'drive' | 'profile'
  >('problem');
  const [selectedSource, setSelectedSource] = useState<ProblemSource>('irodov');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [editorialContent, setEditorialContent] = useState<string | null>(null);
  const [editorialError, setEditorialError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Estados da Lousa (Whiteboard) e Meu Drive
  const [problemBoardOpen, setProblemBoardOpen] = useState(false);
  const [olympiadBoardOpen, setOlympiadBoardOpen] = useState(false);
  const [driveItems, setDriveItems] = useState<DriveSolutionItem[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [driveFilter, setDriveFilter] = useState<'all' | 'irodov' | 'noic' | 'olympiad_paper' | 'scratchpad'>('all');
  const [driveSearch, setDriveSearch] = useState('');
  const [activeScratchpad, setActiveScratchpad] = useState<{ id: string; title: string } | null>(null);

  // Estados da aba Tags & Rating
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [tagProblems, setTagProblems] = useState<Problem[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [activeTag, setActiveTag] = useState<string>('all');
  const [tagSourceFilter, setTagSourceFilter] = useState<string>('all');
  const [tagSearch, setTagSearch] = useState('');
  const [minRatingInput, setMinRatingInput] = useState('');
  const [maxRatingInput, setMaxRatingInput] = useState('');
  const [tagSort, setTagSort] = useState<'rating_asc' | 'rating_desc' | 'code'>('rating_asc');
  const [tagStatusFilter, setTagStatusFilter] = useState<'all' | 'solved' | 'unsolved'>('all');

  // Estados da aba Perfil Público
  const [profileData, setProfileData] = useState<PublicProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSearchInput, setProfileSearchInput] = useState('');

  // Estados das Olimpíadas (Modo PDF com abas por questão)
  const [olympiads, setOlympiads] = useState<Olympiad[]>([]);
  const [loadingOlympiads, setLoadingOlympiads] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<string | null>(null);
  const [activeOlympiad, setActiveOlympiad] = useState<Olympiad | null>(null);
  const [olympiadPapers, setOlympiadPapers] = useState<OlympiadPaper[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [paperViewMode, setPaperViewMode] = useState<'exam' | 'solution'>('exam');
  const [paperScores, setPaperScores] = useState<Record<string, string>>({});
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  const [answerInput, setAnswerInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<{
    verdict: 'AC' | 'WA';
    message: string;
    ratingDelta?: number;
    unrated?: boolean;
  } | null>(null);

  // Estados da Autoavaliação (self_graded)
  const [selfGradeEditorial, setSelfGradeEditorial] = useState<string | null>(null);
  const [selfGradeLoading, setSelfGradeLoading] = useState(false);
  const [selfGradeError, setSelfGradeError] = useState<string | null>(null);

  useEffect(() => {
    setSelfGradeEditorial(null);
    setSelfGradeError(null);
  }, [selectedProblem?.id]);

  useEffect(() => {
    const savedToken = localStorage.getItem('irodov_token');
    if (savedToken) {
      setToken(savedToken);
      fetchMe(savedToken);
      fetchUserSubmissions(savedToken);
      fetchDriveItems(savedToken);
    }
    fetchLeaderboard();
    fetchOlympiads();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!activeOlympiad) {
      fetchProblems(selectedSource, true);
    }
  }, [selectedSource]);

  useEffect(() => {
    if (activeTab === 'tags') {
      fetchFilteredProblemset({
        category: activeTag,
        source: tagSourceFilter,
        search: tagSearch,
        minRating: minRatingInput,
        maxRating: maxRatingInput,
        sort: tagSort,
      });
    }
  }, [activeTab, activeTag, tagSourceFilter, tagSort]);

  useEffect(() => {
    if (activeTab === 'drive' && token) {
      fetchDriveItems(token);
    }
  }, [activeTab, token]);

  useEffect(() => {
    if (!timerRunning || timeLeftSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timeLeftSeconds]);

  async function fetchMe(authToken: string) {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setUser(await res.json());
      } else {
        localStorage.removeItem('irodov_token');
        setToken(null);
      }
    } catch {}
  }

  async function fetchDriveItems(authToken: string) {
    setLoadingDrive(true);
    try {
      const res = await fetch(`${API_URL}/solutions/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setDriveItems(await res.json());
      }
    } catch {
    } finally {
      setLoadingDrive(false);
    }
  }

  async function deleteDriveItem(item: DriveSolutionItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!token) return;
    if (!window.confirm('Apagar esta resolução/lousa do seu Drive?')) return;

    try {
      const res = await fetch(`${API_URL}/solutions/${item.target_type}/${item.target_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDriveItems((prev) => prev.filter((x) => x.id !== item.id));
        if (activeScratchpad?.id === item.target_id) {
          setActiveScratchpad(null);
        }
      }
    } catch {}
  }

  function createNewScratchpad() {
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    const newId = generateUuid();
    const label = `Lousa Livre ${new Date().toLocaleDateString('pt-BR')}`;
    setActiveScratchpad({ id: newId, title: label });
    setActiveTab('drive');
  }

  async function openDriveItem(item: DriveSolutionItem) {
    if (item.target_type === 'scratchpad') {
      setActiveScratchpad({
        id: item.target_id,
        title: item.title_override || 'Lousa Livre',
      });
      setActiveTab('drive');
      return;
    }

    if (item.target_type === 'olympiad_paper' && item.paper_olympiad_id) {
      const matched = olympiads.find((o) => o.id === item.paper_olympiad_id) || {
        id: item.paper_olympiad_id,
        competition: item.olympiad_competition || 'Olimpíada',
        year: item.olympiad_year || new Date().getFullYear(),
        title: item.olympiad_title || `${item.olympiad_competition || 'Olimpíada'} ${item.olympiad_year || ''}`.trim(),
        duration_minutes: item.olympiad_duration || 300,
      };
      setOlympiadBoardOpen(true);
      await startOlympiadSimulation(matched, item.target_id);
      return;
    }

    if (item.target_type === 'problem') {
      try {
        const res = await fetch(`${API_URL}/problems/${item.target_id}`);
        if (res.ok) {
          const prob: Problem = await res.json();
          setActiveOlympiad(null);
          setOlympiadPapers([]);
          setActivePaperId(null);
          setTimerRunning(false);
          setSelectedProblem(prob);
          setLastFeedback(null);
          setAnswerInput('');
          setProblemBoardOpen(true);
          setActiveTab('problem');
        }
      } catch {}
    }
  }

  async function fetchProblems(source: ProblemSource = selectedSource, resetSelection = false) {
    setLoadingData(true);
    try {
      const res = await fetch(`${API_URL}/problems?source=${source}`);
      if (res.ok) {
        const rawData: Problem[] = await res.json();
        const data = [...rawData].sort((a, b) => compareProblemCodes(a.irodov_code, b.irodov_code));
        setProblems(data);
        if (resetSelection) {
          setSelectedProblem(data.length > 0 ? data[0] : null);
          setLastFeedback(null);
          setAnswerInput('');
          if (activeTab === 'editorial') setActiveTab('problem');
        } else if (data.length > 0 && !selectedProblem) {
          setSelectedProblem(data[0]);
        }
      }
    } finally {
      setLoadingData(false);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch(`${API_URL}/categories`);
      if (res.ok) {
        setCategories(await res.json());
      }
    } catch {}
  }

  async function fetchFilteredProblemset(opts: {
    category: string;
    source: string;
    search: string;
    minRating: string;
    maxRating: string;
    sort: string;
  }) {
    setLoadingTags(true);
    try {
      const params = new URLSearchParams();
      if (opts.category && opts.category !== 'all') params.set('category', opts.category);
      if (opts.source && opts.source !== 'all') params.set('source', opts.source);
      if (opts.search.trim()) params.set('search', opts.search.trim());
      if (opts.minRating.trim() && !Number.isNaN(Number(opts.minRating))) {
        params.set('min_rating', String(Math.floor(Number(opts.minRating))));
      }
      if (opts.maxRating.trim() && !Number.isNaN(Number(opts.maxRating))) {
        params.set('max_rating', String(Math.floor(Number(opts.maxRating))));
      }
      if (opts.sort) params.set('sort', opts.sort);

      const res = await fetch(`${API_URL}/problemset?${params.toString()}`);
      if (res.ok) {
        setTagProblems(await res.json());
      }
    } catch {
      setTagProblems([]);
    } finally {
      setLoadingTags(false);
    }
  }

  function applyRatingPreset(min: string, max: string) {
    setMinRatingInput(min);
    setMaxRatingInput(max);
    fetchFilteredProblemset({
      category: activeTag,
      source: tagSourceFilter,
      search: tagSearch,
      minRating: min,
      maxRating: max,
      sort: tagSort,
    });
  }

  function resetAllTagFilters() {
    setActiveTag('all');
    setTagSourceFilter('all');
    setTagSearch('');
    setMinRatingInput('');
    setMaxRatingInput('');
    setTagSort('rating_asc');
    setTagStatusFilter('all');
    fetchFilteredProblemset({
      category: 'all',
      source: 'all',
      search: '',
      minRating: '',
      maxRating: '',
      sort: 'rating_asc',
    });
  }

  async function openUserProfile(targetUsername: string) {
    const clean = targetUsername.trim();
    if (!clean) return;
    setActiveTab('profile');
    setProfileLoading(true);
    setProfileError(null);
    setProfileSearchInput(clean);

    try {
      const res = await fetch(`${API_URL}/users/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        setProfileData(null);
        setProfileError(data.detail || 'Competidor não encontrado.');
      } else {
        setProfileData(data);
      }
    } catch {
      setProfileData(null);
      setProfileError('Erro ao carregar perfil do competidor.');
    } finally {
      setProfileLoading(false);
    }
  }

  function openProblemFromTagList(prob: Problem) {
    setActiveOlympiad(null);
    setOlympiadPapers([]);
    setActivePaperId(null);
    setPaperViewMode('exam');
    setTimerRunning(false);
    setSelectedProblem(prob);
    setLastFeedback(null);
    setAnswerInput('');
    setActiveTab('problem');
  }

  async function fetchOlympiads() {
    setLoadingOlympiads(true);
    try {
      const res = await fetch(`${API_URL}/olympiads`);
      if (res.ok) {
        setOlympiads(await res.json());
      }
    } catch {
    } finally {
      setLoadingOlympiads(false);
    }
  }

  async function startOlympiadSimulation(oly: Olympiad, initialPaperId?: string) {
    setLoadingPapers(true);
    setPapersError(null);
    setActiveOlympiad(oly);
    setOlympiadPapers([]);
    setActivePaperId(null);
    setPaperViewMode('exam');
    setTimeLeftSeconds((oly.duration_minutes || 300) * 60);
    setTimerRunning(true);
    setActiveTab('problem');
    setLastFeedback(null);
    setAnswerInput('');

    try {
      const savedScores = localStorage.getItem(`noic_oly_scores_${oly.id}`);
      setPaperScores(savedScores ? JSON.parse(savedScores) : {});
    } catch {
      setPaperScores({});
    }

    try {
      const res = await fetch(`${API_URL}/olympiads/${oly.id}/papers`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Não foi possível carregar os PDFs desta olimpíada.');
      }
      const rawPapers: OlympiadPaper[] = await res.json();
      const sorted = [...rawPapers].sort((a, b) => a.tab_order - b.tab_order);
      setOlympiadPapers(sorted);
      if (initialPaperId && sorted.some((p) => p.id === initialPaperId)) {
        setActivePaperId(initialPaperId);
      } else {
        setActivePaperId(sorted.length > 0 ? sorted[0].id : null);
      }
    } catch (err: any) {
      setPapersError(err.message || 'Erro ao carregar os PDFs desta prova.');
    } finally {
      setLoadingPapers(false);
    }
  }

  function updatePaperScore(paperId: string, rawValue: string) {
    if (!activeOlympiad) return;
    if (rawValue !== '') {
      const num = Number(rawValue);
      if (Number.isNaN(num) || num < 0 || num > 10) return;
    }
    setPaperScores((prev) => {
      const next = { ...prev, [paperId]: rawValue };
      try {
        localStorage.setItem(`noic_oly_scores_${activeOlympiad.id}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function exitOlympiadSimulation(goToTab: 'olympiads' | 'problem' = 'olympiads') {
    setActiveOlympiad(null);
    setOlympiadPapers([]);
    setActivePaperId(null);
    setPaperViewMode('exam');
    setPapersError(null);
    setTimerRunning(false);
    setTimeLeftSeconds(0);
    setLastFeedback(null);
    setAnswerInput('');
    setActiveTab(goToTab);
    if (goToTab === 'problem') {
      fetchProblems(selectedSource, true);
    }
  }

  async function fetchUserSubmissions(authToken: string) {
    try {
      const res = await fetch(`${API_URL}/submissions/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        setSubmissions(await res.json());
      }
    } catch {}
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch(`${API_URL}/leaderboard`);
      if (res.ok) {
        setLeaderboard(await res.json());
      }
    } catch {}
  }

  async function openEditorialTab() {
    if (activeOlympiad) {
      exitOlympiadSimulation('problem');
    }
    setActiveTab('editorial');
    setEditorialContent(null);
    setEditorialError(null);

    if (!token || !selectedProblem) {
      setEditorialError('Faça login e resolva o problema para desbloquear o editorial.');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/problems/${selectedProblem.id}/editorial`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setEditorialError(data.detail || 'Editorial bloqueado.');
      } else {
        setEditorialContent(data.editorial_latex);
      }
    } catch {
      setEditorialError('Erro ao carregar o editorial.');
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const endpoint = authMode === 'signup' ? '/auth/signup' : '/auth/login';
      const payload = authMode === 'signup' ? { username, email, password } : { email, password };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro na autenticação.');

      localStorage.setItem('irodov_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setAuthModalOpen(false);
      setEmail('');
      setPassword('');
      setUsername('');
      fetchUserSubmissions(data.token);
      fetchDriveItems(data.token);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('irodov_token');
    setToken(null);
    setUser(null);
    setSubmissions([]);
    setDriveItems([]);
    setActiveScratchpad(null);
  }

  async function handleSubmitSolution(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !user) {
      setAuthModalOpen(true);
      return;
    }
    if (!selectedProblem || !answerInput.trim()) return;

    setSubmitting(true);
    setLastFeedback(null);
    const oldRating = user.rating;
    const isUnrated = Boolean(
      selectedProblem.olympiad_id || selectedProblem.answer_type === 'self_graded'
    );

    try {
      const res = await fetch(`${API_URL}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          problem_id: selectedProblem.id,
          answer: answerInput.trim(),
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || 'Erro ao julgar submissão.');

      const isAC = result.verdict === 'AC';
      const delta = isUnrated ? 0 : result.new_rating - oldRating;

      setUser((prev) =>
        prev
          ? {
              ...prev,
              rating: result.new_rating,
              max_rating: Math.max(prev.max_rating, result.new_rating),
              solved_count:
                !isUnrated && isAC && !solvedProblemIds.has(selectedProblem.id)
                  ? prev.solved_count + 1
                  : prev.solved_count,
            }
          : null
      );

      setLastFeedback({
        verdict: result.verdict,
        message: isAC
          ? 'Accepted! Expressão equivalente ao gabarito oficial.'
          : 'Wrong Answer. Verifique os sinais, fatores numéricos ou dimensões.',
        ratingDelta: delta,
        unrated: isUnrated,
      });

      await Promise.all([
        fetchUserSubmissions(token),
        fetchLeaderboard(),
        fetchProblems(selectedSource, false),
      ]);
      if (isAC) setAnswerInput('');
    } catch (err: any) {
      setLastFeedback({ verdict: 'WA', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevealSelfGradeSolution() {
    if (!token || !user) {
      setAuthModalOpen(true);
      return;
    }
    if (!selectedProblem) return;

    setSelfGradeLoading(true);
    setSelfGradeError(null);
    try {
      const res = await fetch(`${API_URL}/problems/${selectedProblem.id}/editorial`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao carregar solução oficial.');
      setSelfGradeEditorial(data.editorial_latex || 'Solução oficial não disponível.');
    } catch (err: any) {
      setSelfGradeError(err.message);
    } finally {
      setSelfGradeLoading(false);
    }
  }

  async function handleSelfGradeSubmit(verdictChoice: 'AC' | 'WA') {
    if (!token || !user) {
      setAuthModalOpen(true);
      return;
    }
    if (!selectedProblem) return;

    setSubmitting(true);
    setLastFeedback(null);
    try {
      const res = await fetch(`${API_URL}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          problem_id: selectedProblem.id,
          answer: '',
          self_verdict: verdictChoice,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || 'Erro ao registrar autoavaliação.');

      setLastFeedback({
        verdict: result.verdict,
        message:
          verdictChoice === 'AC'
            ? 'Autoavaliação registrada como AC (Unrated).'
            : 'Autoavaliação registrada como WA. Revise o editorial e tente novamente.',
        ratingDelta: 0,
        unrated: true,
      });

      await fetchUserSubmissions(token);
    } catch (err: any) {
      setLastFeedback({ verdict: 'WA', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const solvedProblemIds = useMemo(() => {
    return new Set(submissions.filter((s) => s.verdict === 'AC').map((s) => s.problem_id));
  }, [submissions]);

  const visibleTagProblems = useMemo(() => {
    return tagProblems.filter((p) => {
      if (tagStatusFilter === 'solved') return solvedProblemIds.has(p.id);
      if (tagStatusFilter === 'unsolved') return !solvedProblemIds.has(p.id);
      return true;
    });
  }, [tagProblems, tagStatusFilter, solvedProblemIds]);

  const filteredDriveItems = useMemo(() => {
    const q = driveSearch.trim().toLowerCase();
    return driveItems.filter((item) => {
      if (driveFilter === 'irodov' && !(item.target_type === 'problem' && item.problem_source !== 'noic')) {
        return false;
      }
      if (driveFilter === 'noic' && !(item.target_type === 'problem' && item.problem_source === 'noic')) {
        return false;
      }
      if (driveFilter === 'olympiad_paper' && item.target_type !== 'olympiad_paper') {
        return false;
      }
      if (driveFilter === 'scratchpad' && item.target_type !== 'scratchpad') {
        return false;
      }
      if (!q) return true;
      const haystack = [
        item.title_override,
        item.problem_code,
        item.problem_title,
        item.olympiad_title,
        item.paper_tab_label,
        item.paper_title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [driveItems, driveFilter, driveSearch]);

  const activePaper = useMemo(() => {
    if (!olympiadPapers.length) return null;
    return olympiadPapers.find((p) => p.id === activePaperId) || olympiadPapers[0];
  }, [olympiadPapers, activePaperId]);

  const totalOlympiadScore = useMemo(() => {
    return olympiadPapers.reduce((acc, paper) => {
      const val = parseFloat(paperScores[paper.id] || '');
      return Number.isNaN(val) ? acc : acc + val;
    }, 0);
  }, [olympiadPapers, paperScores]);

  const maxOlympiadScore = olympiadPapers.length * 10;

  const activeRawPdfUrl = useMemo(() => {
    if (!activePaper) return '';
    if (paperViewMode === 'solution' && activePaper.solution_pdf_url) {
      return activePaper.solution_pdf_url;
    }
    return activePaper.exam_pdf_url;
  }, [activePaper, paperViewMode]);

  const filteredOlympiads = useMemo(() => {
    if (!selectedCompetition) return [];
    return olympiads
      .filter((o) => o.competition.toLowerCase() === selectedCompetition.toLowerCase())
      .sort((a, b) => b.year - a.year);
  }, [olympiads, selectedCompetition]);

  const rank = getRankInfo(user?.rating ?? 1200);
  const currentProblemIsUnrated = Boolean(
    selectedProblem?.olympiad_id || selectedProblem?.answer_type === 'self_graded'
  );
  const sourceLabel = selectedProblem?.source
    ? selectedProblem.source.toUpperCase()
    : selectedSource === 'noic'
    ? 'NOIC'
    : 'Irodov';

  const isWideWorkspace =
    (activeTab === 'problem' && Boolean(activeOlympiad) && olympiadBoardOpen) ||
    (activeTab === 'problem' && !activeOlympiad && problemBoardOpen) ||
    (activeTab === 'drive' && Boolean(activeScratchpad));

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-[#0f1629]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <div className="flex items-center gap-2.5 shrink-0">
              <img
                src={noicLogo.src}
                alt="Logo NOIC"
                className="w-9 h-9 rounded-lg object-contain bg-white/95 p-1 shadow-lg shadow-indigo-600/20"
              />
              <div>
                <span className="font-bold text-lg tracking-tight text-white">NOIC</span>{' '}
                <span className="font-bold text-lg tracking-tight text-indigo-400">League</span>
              </div>
            </div>

            <nav className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => {
                  if (activeOlympiad) {
                    exitOlympiadSimulation('problem');
                  } else {
                    setActiveTab('problem');
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${
                  activeTab === 'problem' && !activeOlympiad
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Problemas
              </button>
              <button
                onClick={() => {
                  setActiveTab('tags');
                  fetchCategories();
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  activeTab === 'tags' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Tag className="w-3.5 h-3.5" /> Tags & Rating
              </button>
              <button
                onClick={openEditorialTab}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${
                  activeTab === 'editorial' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Editorial
              </button>
              <button
                onClick={() => setActiveTab('standings')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${
                  activeTab === 'standings' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Ranking
              </button>
              <button
                onClick={() => {
                  setActiveTab('olympiads');
                  fetchOlympiads();
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition ${
                  activeTab === 'olympiads' || (activeTab === 'problem' && activeOlympiad)
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Olimpíadas
              </button>
              <button
                onClick={() => {
                  setActiveTab('drive');
                  setActiveScratchpad(null);
                  if (token) fetchDriveItems(token);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
                  activeTab === 'drive' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" /> Meu Drive
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openUserProfile(user.username)}
                  className="text-right hidden sm:block hover:opacity-85 transition"
                  title="Ver meu perfil e gráfico de rating"
                >
                  <div className={`text-sm font-bold ${rank.color}`}>{user.username}</div>
                  <div className="text-xs text-slate-400">
                    Rating: <span className={`font-mono font-semibold ${rank.color}`}>{user.rating}</span> ({rank.title})
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => openUserProfile(user.username)}
                  title="Meu Perfil"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition sm:hidden"
                >
                  <User className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLogout}
                  title="Sair"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthMode('login');
                  setAuthModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition"
              >
                <LogIn className="w-4 h-4" />
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`${isWideWorkspace ? 'max-w-[1640px]' : 'max-w-7xl'} mx-auto px-4 py-6 transition-all`}>
        {activeTab === 'drive' ? (
          /* ================= ABA MEU DRIVE (CADERNO & LOUSAS SALVAS) ================= */
          <div className="space-y-6">
            {!user || !token ? (
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center space-y-4">
                <FolderOpen className="w-10 h-10 text-indigo-400 mx-auto" />
                <h2 className="text-xl font-bold text-white">Seu Drive de Resoluções & Mesa Digital</h2>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Faça login para salvar automaticamente suas lousas do Excalidraw e anotações em LaTeX para cada questão do Irodov, NOIC e Olimpíadas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthModalOpen(true);
                  }}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition inline-flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" /> Entrar na minha conta
                </button>
              </div>
            ) : activeScratchpad ? (
              <div className="space-y-4">
                <div className="bg-[#111827] border border-slate-800 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveScratchpad(null);
                      fetchDriveItems(token);
                    }}
                    className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar para Meu Drive
                  </button>
                  <span className="text-xs font-mono text-slate-400">
                    Lousa Livre • Auto-save ativo na sua conta
                  </span>
                </div>

                <SolutionWhiteboard
                  apiUrl={API_URL}
                  token={token}
                  targetType="scratchpad"
                  targetId={activeScratchpad.id}
                  defaultTitle={activeScratchpad.title}
                  editableTitle
                  onRequireAuth={() => setAuthModalOpen(true)}
                  onSaved={(meta) => {
                    if (meta.titleOverride) {
                      setActiveScratchpad((prev) =>
                        prev ? { ...prev, title: meta.titleOverride } : prev
                      );
                    }
                  }}
                />
              </div>
            ) : (
              <>
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-indigo-400" />
                        Meu Drive de Resoluções
                      </h2>
                      <p className="text-sm text-slate-400 mt-1">
                        Todas as suas lousas vetoriais e anotações em LaTeX sincronizadas na nuvem.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fetchDriveItems(token)}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingDrive ? 'animate-spin' : ''}`} />
                        Atualizar
                      </button>
                      <button
                        type="button"
                        onClick={createNewScratchpad}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Nova Lousa Livre
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { key: 'all', label: 'Tudo' },
                        { key: 'olympiad_paper', label: 'Olimpíadas' },
                        { key: 'irodov', label: 'Irodov' },
                        { key: 'noic', label: 'NOIC' },
                        { key: 'scratchpad', label: 'Lousas Livres' },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setDriveFilter(tab.key as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            driveFilter === tab.key
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800/80 text-slate-400 hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={driveSearch}
                        onChange={(e) => setDriveSearch(e.target.value)}
                        placeholder="Buscar no Drive..."
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#0b0f19] border border-slate-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {loadingDrive ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-sm text-slate-400">
                    Carregando seu Drive...
                  </div>
                ) : filteredDriveItems.length === 0 ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center space-y-3">
                    <p className="text-sm text-slate-400">
                      Nenhuma resolução encontrada nesta pasta ainda.
                    </p>
                    <p className="text-xs text-slate-500">
                      Abra qualquer questão ou PDF de olimpíada e clique em <strong className="text-indigo-400">Abrir Lousa</strong>, ou crie uma Lousa Livre acima.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDriveItems.map((item) => {
                      const isOly = item.target_type === 'olympiad_paper';
                      const isScratch = item.target_type === 'scratchpad';
                      const isNoic = item.target_type === 'problem' && item.problem_source === 'noic';

                      const badgeText = isOly
                        ? `${item.olympiad_competition || 'Olimpíada'} ${item.olympiad_year || ''}`.trim()
                        : isScratch
                        ? 'LOUSA LIVRE'
                        : isNoic
                        ? `NOIC ${item.problem_code || ''}`.trim()
                        : `IRODOV ${item.problem_code || ''}`.trim();

                      const badgeClass = isOly
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : isScratch
                        ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        : isNoic
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';

                      const displayTitle = isScratch
                        ? item.title_override || 'Lousa Livre sem título'
                        : isOly
                        ? `${item.paper_tab_label || 'Caderno'}${item.paper_title ? ` — ${item.paper_title}` : ''}`
                        : item.problem_title || item.title_override || 'Questão';

                      return (
                        <div
                          key={item.id}
                          onClick={() => openDriveItem(item)}
                          className="bg-[#111827] border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 flex flex-col justify-between gap-4 cursor-pointer transition group"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${badgeClass}`}>
                                {badgeText}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => deleteDriveItem(item, e)}
                                className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                title="Apagar do Drive"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <h3 className="font-bold text-white text-sm group-hover:text-indigo-300 transition line-clamp-2">
                              {displayTitle}
                            </h3>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {item.has_board && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                                  Lousa ({item.element_count} elem.)
                                </span>
                              )}
                              {item.has_notes && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-indigo-300 border border-slate-700">
                                  Notas LaTeX
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
                            <span className="font-mono">{formatFullDate(item.updated_at)}</span>
                            <span className="text-indigo-400 font-semibold group-hover:underline">
                              Abrir →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        ) : activeTab === 'tags' ? (
          <div className="space-y-6">
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Tag className="w-5 h-5 text-indigo-400" />
                    Filtrar Questões por Tag e Rating
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Filtre por grande área de física, faixa de dificuldade (PhysElo) e acervo.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetAllTagFilters}
                  className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 transition"
                >
                  Limpar filtros
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchFilteredProblemset({
                    category: activeTag,
                    source: tagSourceFilter,
                    search: tagSearch,
                    minRating: minRatingInput,
                    maxRating: maxRatingInput,
                    sort: tagSort,
                  });
                }}
                className="grid grid-cols-1 md:grid-cols-12 gap-3"
              >
                <div className="relative md:col-span-5">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Buscar título, código ou subtópico (ex: cinemática)..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0b0f19] border border-slate-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-4 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={4000}
                    step={50}
                    value={minRatingInput}
                    onChange={(e) => setMinRatingInput(e.target.value)}
                    placeholder="Rating mín."
                    className="w-full px-3 py-2 rounded-lg bg-[#0b0f19] border border-slate-700 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <span className="text-slate-500 text-xs">—</span>
                  <input
                    type="number"
                    min={0}
                    max={4000}
                    step={50}
                    value={maxRatingInput}
                    onChange={(e) => setMaxRatingInput(e.target.value)}
                    placeholder="Rating máx."
                    className="w-full px-3 py-2 rounded-lg bg-[#0b0f19] border border-slate-700 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-3 flex items-center gap-2">
                  <select
                    value={tagSort}
                    onChange={(e) => setTagSort(e.target.value as 'rating_asc' | 'rating_desc' | 'code')}
                    className="flex-1 px-2.5 py-2 rounded-lg bg-[#0b0f19] border border-slate-700 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="rating_asc">Rating ↑</option>
                    <option value="rating_desc">Rating ↓</option>
                    <option value="code">Código</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shrink-0"
                  >
                    Filtrar
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 mr-1">Faixa de rating:</span>
                {RATING_PRESETS.map((preset) => {
                  const isActive = minRatingInput === preset.min && maxRatingInput === preset.max;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyRatingPreset(preset.min, preset.max)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono transition border ${
                        isActive
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-[#0b0f19] text-slate-400 border-slate-800 hover:border-slate-600 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { key: 'all', label: 'Todas as fontes' },
                    { key: 'irodov', label: 'Irodov' },
                    { key: 'noic', label: 'NOIC' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setTagSourceFilter(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        tagSourceFilter === opt.key
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800/80 text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  {[
                    { key: 'all', label: 'Todas' },
                    { key: 'unsolved', label: 'Não resolvidas' },
                    { key: 'solved', label: 'Resolvidas' },
                  ].map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      onClick={() => setTagStatusFilter(st.key as 'all' | 'solved' | 'unsolved')}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                        tagStatusFilter === st.key
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTag('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    activeTag === 'all'
                      ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/50'
                      : 'bg-[#0b0f19] text-slate-400 border-slate-800 hover:border-slate-600 hover:text-white'
                  }`}
                >
                  Todas as áreas
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() => setActiveTag(cat.category)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      activeTag === cat.category
                        ? 'bg-indigo-600/25 text-indigo-200 border-indigo-500/50'
                        : 'bg-[#0b0f19] text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    {cat.category}{' '}
                    <span className="font-mono text-[11px] text-slate-500 ml-1">({cat.count})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Exibindo <strong className="text-white">{visibleTagProblems.length}</strong> questão(ões)
                  {activeTag !== 'all' && (
                    <>
                      {' '}
                      em <strong className="text-indigo-400">{activeTag}</strong>
                    </>
                  )}
                  {(minRatingInput || maxRatingInput) && (
                    <>
                      {' '}
                      • Rating{' '}
                      <strong className="text-amber-400 font-mono">
                        {minRatingInput || '0'}–{maxRatingInput || '∞'}
                      </strong>
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    fetchFilteredProblemset({
                      category: activeTag,
                      source: tagSourceFilter,
                      search: tagSearch,
                      minRating: minRatingInput,
                      maxRating: maxRatingInput,
                      sort: tagSort,
                    })
                  }
                  className="hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTags ? 'animate-spin' : ''}`} /> Atualizar
                </button>
              </div>

              {loadingTags ? (
                <div className="p-10 text-center text-sm text-slate-400">Carregando questões...</div>
              ) : visibleTagProblems.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">
                  Nenhuma questão encontrada para esses filtros.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-900/50">
                        <th className="py-3 px-4 w-10"></th>
                        <th className="py-3 px-4">Código</th>
                        <th className="py-3 px-4">Título</th>
                        <th className="py-3 px-4">Área</th>
                        <th className="py-3 px-4">Fonte</th>
                        <th className="py-3 px-4 text-right">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 text-sm">
                      {visibleTagProblems.map((prob) => {
                        const isSolved = solvedProblemIds.has(prob.id);
                        const isProbUnrated = Boolean(prob.olympiad_id || prob.answer_type === 'self_graded');
                        const showSub =
                          prob.raw_category &&
                          prob.raw_category.trim().toLowerCase() !== prob.category.trim().toLowerCase();

                        return (
                          <tr
                            key={prob.id}
                            onClick={() => openProblemFromTagList(prob)}
                            className="hover:bg-slate-800/40 cursor-pointer transition"
                          >
                            <td className="py-3 px-4">
                              {isSolved ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-700" />
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-indigo-400 whitespace-nowrap">
                              {prob.irodov_code}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-200">
                              <span>{prob.title}</span>
                              {prob.answer_type === 'self_graded' && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Discursiva
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-200 border border-slate-700">
                                {prob.category}
                              </span>
                              {showSub && (
                                <span className="ml-2 text-[11px] text-slate-500">{prob.raw_category}</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase ${
                                  prob.source === 'noic'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-indigo-500/15 text-indigo-300'
                                }`}
                              >
                                {prob.source || 'irodov'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs whitespace-nowrap">
                              <span className="text-amber-400 font-semibold">*{prob.difficulty_rating}</span>
                              {isProbUnrated && (
                                <span className="ml-1.5 text-[10px] text-slate-500">(Unrated)</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'profile' ? (
          <div className="space-y-6">
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('standings')}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar ao Ranking
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openUserProfile(profileSearchInput);
                }}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={profileSearchInput}
                    onChange={(e) => setProfileSearchInput(e.target.value)}
                    placeholder="Acessar perfil por handle..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#0b0f19] border border-slate-700 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition"
                >
                  Abrir Perfil
                </button>
              </form>
            </div>

            {profileLoading ? (
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                Carregando estatísticas e histórico de rating...
              </div>
            ) : profileError || !profileData ? (
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                {profileError || 'Selecione um competidor no Ranking ou pesquise um handle acima.'}
              </div>
            ) : (
              (() => {
                const pUser = profileData.user;
                const pRank = getRankInfo(pUser.rating);
                const maxRank = getRankInfo(pUser.max_rating);
                const maxCatCount = Math.max(...profileData.category_stats.map((c) => c.count), 1);

                return (
                  <div className="space-y-6">
                    <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                          <User className={`w-7 h-7 ${pRank.color}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h2 className={`text-2xl font-bold ${pRank.color}`}>{pUser.username}</h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs border ${pRank.badge}`}>
                              {pRank.title}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Máximo histórico:{' '}
                            <span className={`font-mono font-bold ${maxRank.color}`}>
                              {pUser.max_rating} ({maxRank.title})
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="px-4 py-2.5 rounded-lg bg-[#0b0f19] border border-slate-800">
                          <div className={`text-xl font-mono font-bold ${pRank.color}`}>{pUser.rating}</div>
                          <div className="text-[11px] text-slate-400">PhysElo Atual</div>
                        </div>
                        <div className="px-4 py-2.5 rounded-lg bg-[#0b0f19] border border-slate-800">
                          <div className={`text-xl font-mono font-bold ${maxRank.color}`}>{pUser.max_rating}</div>
                          <div className="text-[11px] text-slate-400">Pico de Rating</div>
                        </div>
                        <div className="px-4 py-2.5 rounded-lg bg-[#0b0f19] border border-slate-800">
                          <div className="text-xl font-mono font-bold text-emerald-400">{pUser.solved_count}</div>
                          <div className="text-[11px] text-slate-400">Resolvidos</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-white flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-amber-400" />
                          Evolução do Rating (PhysElo)
                        </h3>
                        <span className="text-xs font-mono text-slate-500">
                          {profileData.rating_history.length} registro(s)
                        </span>
                      </div>

                      <RatingChart history={profileData.rating_history} currentRating={pUser.rating} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
                        <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                          <Tag className="w-4 h-4 text-indigo-400" />
                          Domínio por Área (Questões AC)
                        </h3>

                        {profileData.category_stats.length === 0 ? (
                          <p className="text-xs text-slate-400">Nenhuma questão resolvida ainda.</p>
                        ) : (
                          <div className="space-y-3">
                            {profileData.category_stats.map((stat) => (
                              <div key={stat.category} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="text-slate-200">{stat.category}</span>
                                  <span className="font-mono text-slate-400">{stat.count}</span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full"
                                    style={{ width: `${Math.round((stat.count / maxCatCount) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                          <h3 className="font-bold text-white text-sm flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-400" />
                            Submissões Recentes
                          </h3>
                        </div>

                        {profileData.recent_submissions.length === 0 ? (
                          <div className="p-8 text-center text-xs text-slate-400">
                            Nenhuma submissão registrada ainda.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-800/70 max-h-80 overflow-y-auto text-xs">
                            {profileData.recent_submissions.map((sub) => (
                              <div key={sub.id} className="px-5 py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-indigo-400">{sub.problem_code}</span>
                                    <span className="text-slate-200 font-medium truncate">{sub.problem_title}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {sub.category} • {formatFullDate(sub.created_at)}
                                  </div>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-bold shrink-0 ${
                                    sub.verdict === 'AC'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-rose-500/20 text-rose-400'
                                  }`}
                                >
                                  {sub.verdict}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        ) : activeTab === 'olympiads' ? (
          <div className="space-y-6">
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h2 className="text-xl font-bold text-white">Simulador de Olimpíadas</h2>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    UNRATED
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Simule provas teóricas originais em PDF organizadas em abas por questão, com cronômetro, gabarito oficial e mesa digital integrada.
                </p>
              </div>

              <button
                type="button"
                onClick={fetchOlympiads}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOlympiads ? 'animate-spin' : ''}`} />
                Atualizar acervo
              </button>
            </div>

            {selectedCompetition ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setSelectedCompetition(null)}
                    className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar para todas as competições
                  </button>
                  <span className="text-sm font-mono text-slate-400">
                    {selectedCompetition} — {filteredOlympiads.length} edição(ões) disponível(is)
                  </span>
                </div>

                {filteredOlympiads.length === 0 ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-10 text-center text-slate-400 text-sm">
                    Nenhuma edição de <strong className="text-white">{selectedCompetition}</strong> cadastrada ainda no banco de dados.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredOlympiads.map((oly) => (
                      <div
                        key={oly.id}
                        className="bg-[#111827] border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 flex flex-col justify-between transition"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                              {oly.competition} {oly.year}
                            </span>
                            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> {Math.round((oly.duration_minutes || 300) / 60)}h
                            </span>
                          </div>
                          <h3 className="font-bold text-white text-base">{oly.title}</h3>
                          <p className="text-xs text-slate-400 mt-1">PDFs originais em abas • Lousa integrada</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => startOlympiadSimulation(oly)}
                          className="mt-5 w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" /> Iniciar Simulado
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {OLYMPIAD_CATALOG.map((oly) => {
                  const count = olympiads.filter(
                    (item) => item.competition.toLowerCase() === oly.code.toLowerCase()
                  ).length;

                  return (
                    <div
                      key={oly.code}
                      className="bg-[#111827] border border-slate-800 hover:border-indigo-500/50 rounded-xl p-5 flex flex-col justify-between transition"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold border ${oly.badge}`}>
                            {oly.code}
                          </span>
                          <span className="text-xs font-mono text-slate-500">Tempo: {oly.duration}</span>
                        </div>
                        <h3 className="font-bold text-white text-base">{oly.name}</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          {count > 0
                            ? `${count} edição(ões) disponível(is) para simular.`
                            : 'Provas antigas em breve no acervo.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedCompetition(oly.code)}
                        className="mt-5 w-full py-2 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs font-semibold text-slate-200 hover:text-white transition"
                      >
                        {count > 0 ? `Explorar edições (${count})` : 'Explorar edições'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'standings' ? (
          <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h2 className="font-bold text-lg">Classificação Global — PhysElo</h2>
              </div>

              <div className="flex items-center gap-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    openUserProfile(profileSearchInput);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={profileSearchInput}
                    onChange={(e) => setProfileSearchInput(e.target.value)}
                    placeholder="Buscar perfil..."
                    className="px-3 py-1.5 rounded-lg bg-[#0b0f19] border border-slate-700 text-xs text-white w-36 sm:w-44 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-xs text-slate-200 transition"
                  >
                    Ver
                  </button>
                </form>

                <button
                  onClick={fetchLeaderboard}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase text-slate-400 bg-slate-900/50">
                    <th className="py-3 px-6">#</th>
                    <th className="py-3 px-6">Competidor</th>
                    <th className="py-3 px-6">Patente</th>
                    <th className="py-3 px-6 text-right">Resolvidos</th>
                    <th className="py-3 px-6 text-right">Rating Atual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-sm">
                  {leaderboard.map((u, index) => {
                    const userRank = getRankInfo(u.rating);
                    return (
                      <tr
                        key={u.id}
                        onClick={() => openUserProfile(u.username)}
                        className="hover:bg-slate-800/40 cursor-pointer transition"
                      >
                        <td className="py-3.5 px-6 font-mono text-slate-400">{index + 1}</td>
                        <td className={`py-3.5 px-6 font-bold hover:underline ${userRank.color}`}>{u.username}</td>
                        <td className="py-3.5 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs border ${userRank.badge}`}>
                            {userRank.title}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono text-slate-300">{u.solved_count}</td>
                        <td className={`py-3.5 px-6 text-right font-mono font-bold ${userRank.color}`}>
                          {u.rating}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeOlympiad ? (
          /* ================= MODO SIMULADOR DE OLIMPÍADA EM PDF + LOUSA ================= */
          <div className="space-y-5">
            <div className="bg-[#111827] border border-amber-500/30 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => exitOlympiadSimulation('olympiads')}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Sair do simulado"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-base">{activeOlympiad.title}</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      UNRATED
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {olympiadPapers.length} caderno(s) em PDF
                    {maxOlympiadScore > 0 && (
                      <>
                        {' '}
                        • Auto-pontuação:{' '}
                        <strong className="text-emerald-400 font-mono">
                          {Number.isInteger(totalOlympiadScore)
                            ? totalOlympiadScore
                            : totalOlympiadScore.toFixed(1)}{' '}
                          / {maxOlympiadScore} pts
                        </strong>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setOlympiadBoardOpen((prev) => !prev)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                    olympiadBoardOpen
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  {olympiadBoardOpen ? 'Fechar Lousa' : 'Abrir Lousa'}
                </button>

                <div
                  className={`px-3.5 py-1.5 rounded-lg font-mono text-base font-bold border ${
                    timeLeftSeconds < 600
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      : 'bg-[#0b0f19] text-amber-300 border-slate-700'
                  }`}
                >
                  {formatTimer(timeLeftSeconds)}
                </div>
                <button
                  type="button"
                  onClick={() => setTimerRunning((prev) => !prev)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title={timerRunning ? 'Pausar cronômetro' : 'Retomar cronômetro'}
                >
                  {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimerRunning(false);
                    setTimeLeftSeconds((activeOlympiad.duration_minutes || 300) * 60);
                  }}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title="Reiniciar cronômetro"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {olympiadPapers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 bg-[#111827] border border-slate-800 rounded-xl p-2.5">
                {olympiadPapers.map((paper) => {
                  const isActive = activePaper?.id === paper.id;
                  const savedScore = paperScores[paper.id];
                  const hasScore = savedScore !== undefined && savedScore !== '';

                  return (
                    <button
                      key={paper.id}
                      type="button"
                      onClick={() => {
                        setActivePaperId(paper.id);
                        setPaperViewMode('exam');
                      }}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 border ${
                        isActive
                          ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                          : 'bg-[#0b0f19] text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{paper.tab_label}</span>
                      {hasScore && (
                        <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-emerald-500/20 text-emerald-300">
                          {savedScore}/10
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {loadingPapers ? (
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                Carregando PDFs de {activeOlympiad.title}...
              </div>
            ) : papersError ? (
              <div className="bg-[#111827] border border-rose-500/30 rounded-xl p-8 text-center text-rose-300 text-sm space-y-2">
                <AlertCircle className="w-6 h-6 mx-auto text-rose-400" />
                <p>{papersError}</p>
              </div>
            ) : !activePaper ? (
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-sm">
                Nenhum PDF cadastrado para <strong className="text-white">{activeOlympiad.title}</strong> na tabela{' '}
                <code className="text-indigo-400">olympiad_papers</code>.
              </div>
            ) : (
              <div className={olympiadBoardOpen ? 'grid grid-cols-1 xl:grid-cols-12 gap-5 items-start' : ''}>
                <div
                  className={`${
                    olympiadBoardOpen ? 'xl:col-span-6' : ''
                  } bg-[#111827] border border-slate-800 rounded-xl overflow-hidden`}
                >
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0">
                        {activePaper.tab_label}
                      </span>
                      {activePaper.title && (
                        <span className="text-sm font-semibold text-white truncate">{activePaper.title}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-lg bg-[#0b0f19] p-1 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPaperViewMode('exam')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
                            paperViewMode === 'exam'
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" /> Enunciado
                        </button>
                        <button
                          type="button"
                          disabled={!activePaper.solution_pdf_url}
                          onClick={() => setPaperViewMode('solution')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                            paperViewMode === 'solution'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <BookOpen className="w-3.5 h-3.5" /> Solução
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 bg-[#0b0f19] border border-slate-800 rounded-lg px-2 py-1">
                        <label className="text-[11px] text-slate-400 whitespace-nowrap">Nota:</label>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={paperScores[activePaper.id] ?? ''}
                          onChange={(e) => updatePaperScore(activePaper.id, e.target.value)}
                          placeholder="0–10"
                          className="w-12 bg-transparent text-xs font-mono text-emerald-300 focus:outline-none text-right"
                        />
                        <span className="text-[11px] font-mono text-slate-500">/10</span>
                      </div>

                      {activeRawPdfUrl && (
                        <a
                          href={activeRawPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Nova aba
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#0b0f19] p-2 sm:p-3">
                    <iframe
                      key={`${activePaper.id}-${paperViewMode}`}
                      src={buildPdfViewerUrl(activeRawPdfUrl)}
                      title={`${activeOlympiad.title} — ${activePaper.tab_label} (${
                        paperViewMode === 'solution' ? 'Solução' : 'Enunciado'
                      })`}
                      className="w-full h-[78vh] min-h-[580px] rounded-lg border border-slate-800 bg-slate-950"
                    />
                  </div>
                </div>

                {olympiadBoardOpen && (
                  <div className="xl:col-span-6">
                    <SolutionWhiteboard
                      apiUrl={API_URL}
                      token={token}
                      targetType="olympiad_paper"
                      targetId={activePaper.id}
                      defaultTitle={`${activeOlympiad.title} — ${activePaper.tab_label}`}
                      onRequireAuth={() => setAuthModalOpen(true)}
                      onClose={() => setOlympiadBoardOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ================= MODO PROBLEMAS (IRODOV / NOIC) + LOUSA ================= */
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className={`${problemBoardOpen ? 'lg:col-span-6' : 'lg:col-span-8'} space-y-6`}>
                {loadingData ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                    Conectando à API e carregando acervo {sourceLabel}...
                  </div>
                ) : !selectedProblem ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                    {selectedSource === 'noic' ? (
                      <>
                        Nenhuma questão encontrada no acervo <strong className="text-indigo-400">NOIC</strong>. Rode o script <code className="text-indigo-400">seed_noic.py</code> para popular este banco.
                      </>
                    ) : (
                      <>
                        Nenhuma questão encontrada. Execute o arquivo <code className="text-indigo-400">database/schema_neon.sql</code> no SQL Editor do Neon.
                      </>
                    )}
                  </div>
                ) : activeTab === 'editorial' ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                      <div>
                        <span className="text-xs font-mono text-indigo-400">Editorial Oficial ({sourceLabel})</span>
                        <h2 className="text-xl font-bold text-white">
                          {selectedProblem.irodov_code} — {selectedProblem.title}
                        </h2>
                      </div>
                      <button
                        onClick={() => setActiveTab('problem')}
                        className="text-sm text-indigo-400 hover:underline"
                      >
                        Voltar ao problema
                      </button>
                    </div>

                    {editorialContent ? (
                      <div className="prose prose-invert max-w-none">
                        <MathText content={editorialContent} />
                      </div>
                    ) : (
                      <div className="p-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                        <div>
                          <p className="font-semibold">Editorial bloqueado</p>
                          <p className="text-amber-200/80 mt-1">
                            {editorialError || 'Resolva o problema primeiro para desbloquear a solução comentada.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                currentProblemIsUnrated
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : selectedProblem.source === 'noic'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-indigo-300'
                              }`}
                            >
                              {currentProblemIsUnrated ? selectedProblem.irodov_code : `${sourceLabel} ${selectedProblem.irodov_code}`}
                            </span>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTag(selectedProblem.category);
                                setActiveTab('tags');
                              }}
                              className="hover:text-indigo-400 transition"
                              title="Filtrar mais questões desta área"
                            >
                              {selectedProblem.category}
                              {selectedProblem.raw_category &&
                                selectedProblem.raw_category.trim().toLowerCase() !==
                                  selectedProblem.category.trim().toLowerCase() && (
                                  <span className="text-slate-500"> · {selectedProblem.raw_category}</span>
                                )}
                            </button>
                          </div>
                          <h1 className="text-2xl font-bold text-white">{selectedProblem.title}</h1>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setProblemBoardOpen((prev) => !prev)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 border ${
                              problemBoardOpen
                                ? 'bg-indigo-600 text-white border-indigo-500'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                            }`}
                          >
                            <PenTool className="w-3.5 h-3.5" />
                            {problemBoardOpen ? 'Fechar Lousa' : 'Abrir Lousa'}
                          </button>

                          {solvedProblemIds.has(selectedProblem.id) && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Resolvido
                            </span>
                          )}
                          <span className="px-3 py-1 rounded-md bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700">
                            {currentProblemIsUnrated ? (
                              <>
                                <strong className="text-amber-400">*{selectedProblem.difficulty_rating}</strong>{' '}
                                <span className="text-slate-400">(Unrated)</span>
                              </>
                            ) : (
                              <>
                                Rating: <strong className="text-amber-400">*{selectedProblem.difficulty_rating}</strong>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="text-base">
                        <MathText content={selectedProblem.statement_latex} />
                      </div>

                      {selectedProblem.figure_url && (
                        <div className="my-4 flex justify-center rounded-xl border border-slate-800/80 bg-[#0b0f19] p-4">
                          <img
                            src={selectedProblem.figure_url}
                            alt={`Figura da questão ${selectedProblem.irodov_code}`}
                            className="max-h-72 w-auto object-contain invert mix-blend-screen contrast-125"
                          />
                        </div>
                      )}

                      {selectedProblem.svg_diagram && (
                        <div
                          className="p-4 rounded-lg bg-[#0b0f19] border border-slate-800 flex justify-center"
                          dangerouslySetInnerHTML={{ __html: selectedProblem.svg_diagram }}
                        />
                      )}

                      <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-4">
                        <div>
                          <span className="font-semibold text-indigo-400">Formato esperado: </span>
                          {selectedProblem.answer_type === 'self_graded'
                            ? 'Demonstração / Gráfico / Discursiva (Autoavaliação — Unrated)'
                            : selectedProblem.answer_type === 'algebraic'
                            ? `Expressão simbólica (${selectedProblem.variables_hint || 'use g, m, R, v_0, alpha...'})`
                            : `Valor numérico ${selectedProblem.unit ? `em [${selectedProblem.unit}]` : ''}`}
                        </div>
                        <span className="font-mono text-slate-500 shrink-0">
                          Motor: {selectedProblem.answer_type === 'self_graded' ? 'Autoavaliação' : 'SymPy'}
                        </span>
                      </div>
                    </div>

                    {selectedProblem.answer_type === 'self_graded' ? (
                      <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-amber-400" />
                            Autoavaliação (Discursiva / Demonstração)
                          </div>
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            UNRATED
                          </span>
                        </div>

                        {selfGradeEditorial === null ? (
                          <div className="space-y-3">
                            <p className="text-xs text-slate-400">
                              Resolva este item no papel ou na Lousa ao lado. Quando terminar, revele a solução oficial para se autoavaliar.
                            </p>
                            {selfGradeError && (
                              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                                {selfGradeError}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={handleRevealSelfGradeSolution}
                              disabled={selfGradeLoading}
                              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
                            >
                              <BookOpen className="w-4 h-4" />
                              {selfGradeLoading ? 'Carregando solução...' : 'Revelar Solução Oficial e Autoavaliar'}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-[#0b0f19] border border-slate-800 space-y-2">
                              <div className="text-xs font-mono uppercase text-indigo-400">Solução Oficial</div>
                              <div className="prose prose-invert max-w-none text-sm">
                                <MathText content={selfGradeEditorial} />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleSelfGradeSubmit('AC')}
                                className="py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Acertei (Marcar AC)
                              </button>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleSelfGradeSubmit('WA')}
                                className="py-2.5 px-4 rounded-lg bg-rose-600/80 hover:bg-rose-600 disabled:opacity-50 text-sm font-semibold text-white transition flex items-center justify-center gap-2"
                              >
                                <XCircle className="w-4 h-4" />
                                Errei / Revisar (Marcar WA)
                              </button>
                            </div>
                          </div>
                        )}

                        {lastFeedback && (
                          <div
                            className={`p-4 rounded-lg border flex items-center justify-between text-sm ${
                              lastFeedback.verdict === 'AC'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {lastFeedback.verdict === 'AC' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                              )}
                              <span>{lastFeedback.message}</span>
                            </div>
                            <span className="font-mono text-xs text-slate-400">Unrated</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <form
                        onSubmit={handleSubmitSolution}
                        className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                            <Code2 className="w-4 h-4 text-indigo-400" />
                            Sua Resposta ({selectedProblem.answer_type === 'algebraic' ? 'Algébrica' : 'Numérica'})
                          </label>
                          <span className="text-xs text-slate-500">
                            {selectedProblem.answer_type === 'algebraic'
                              ? 'Ex: sqrt(2*g*h) ou 2*R/3'
                              : 'Ex: 0.1, 10 cm/s ou 0.36 km/h'}
                          </span>
                        </div>

                        <input
                          type="text"
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          placeholder={
                            selectedProblem.answer_type === 'algebraic'
                              ? 'Digite a expressão em sintaxe Python/SymPy...'
                              : 'Digite o valor com ou sem unidade (ex: 0.1, 10 cm/s ou 0.36 km/h)...'
                          }
                          className="w-full px-4 py-3 rounded-lg bg-[#0b0f19] border border-slate-700 focus:border-indigo-500 focus:outline-none font-mono text-sm text-white"
                        />

                        {answerInput.trim() && (
                          <div className="p-3 rounded-lg bg-[#0b0f19]/80 border border-slate-800 flex items-center justify-between">
                            <span className="text-xs text-slate-500">Preview matemático:</span>
                            <div className="text-indigo-300">
                              <InlineMath math={toPreviewLatex(answerInput)} />
                            </div>
                          </div>
                        )}

                        {lastFeedback && (
                          <div
                            className={`p-4 rounded-lg border flex items-center justify-between text-sm ${
                              lastFeedback.verdict === 'AC'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {lastFeedback.verdict === 'AC' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                              ) : (
                                <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                              )}
                              <span>{lastFeedback.message}</span>
                            </div>
                            {lastFeedback.unrated ? (
                              <span className="font-mono text-xs text-slate-400">Unrated</span>
                            ) : (
                              typeof lastFeedback.ratingDelta === 'number' &&
                              lastFeedback.ratingDelta !== 0 && (
                                <span className="font-mono font-bold">
                                  {lastFeedback.ratingDelta > 0
                                    ? `+${lastFeedback.ratingDelta}`
                                    : lastFeedback.ratingDelta}{' '}
                                  Elo
                                </span>
                              )
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                          <button
                            type="button"
                            onClick={openEditorialTab}
                            className="text-xs text-slate-400 hover:text-indigo-400 flex items-center gap-1.5 transition"
                          >
                            <BookOpen className="w-4 h-4" /> Ver Editorial
                          </button>

                          <button
                            type="submit"
                            disabled={submitting || !answerInput.trim()}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition"
                          >
                            <Send className="w-4 h-4" />
                            {submitting ? 'Julgando...' : 'Submeter Solução'}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>

              {problemBoardOpen && selectedProblem ? (
                <div className="lg:col-span-6 space-y-6">
                  <SolutionWhiteboard
                    apiUrl={API_URL}
                    token={token}
                    targetType="problem"
                    targetId={selectedProblem.id}
                    defaultTitle={`${sourceLabel} ${selectedProblem.irodov_code} — ${selectedProblem.title}`}
                    onRequireAuth={() => setAuthModalOpen(true)}
                    onClose={() => setProblemBoardOpen(false)}
                  />
                </div>
              ) : (
                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                    <div className="p-2 bg-slate-900/80 border-b border-slate-800 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedSource('irodov')}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
                          selectedSource === 'irodov'
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        Acervo Irodov
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedSource('noic')}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
                          selectedSource === 'noic'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        Acervo NOIC
                      </button>
                    </div>

                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white flex items-center gap-2 truncate">
                        <BarChart3
                          className={`w-4 h-4 shrink-0 ${
                            selectedSource === 'noic' ? 'text-emerald-400' : 'text-indigo-400'
                          }`}
                        />
                        <span className="truncate">Acervo {selectedSource === 'noic' ? 'NOIC' : 'Irodov'}</span>
                      </span>
                      <span className="text-xs text-slate-400 shrink-0">{problems.length} itens</span>
                    </div>
                    <div className="divide-y divide-slate-800/70 max-h-80 overflow-y-auto">
                      {problems.map((prob) => {
                        const isSelected = selectedProblem?.id === prob.id;
                        const isSolved = solvedProblemIds.has(prob.id);
                        return (
                          <button
                            key={prob.id}
                            onClick={() => {
                              setSelectedProblem(prob);
                              setActiveTab('problem');
                              setLastFeedback(null);
                            }}
                            className={`w-full px-4 py-3 text-left flex items-center justify-between transition ${
                              isSelected
                                ? selectedSource === 'noic'
                                  ? 'bg-emerald-600/15'
                                  : 'bg-indigo-600/15'
                                : 'hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isSolved ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-600 shrink-0" />
                              )}
                              <div className="truncate">
                                <div
                                  className={`text-xs font-mono ${
                                    selectedSource === 'noic' ? 'text-emerald-400' : 'text-indigo-400'
                                  }`}
                                >
                                  {prob.irodov_code}
                                </div>
                                <div className="text-sm font-medium text-slate-200 truncate">{prob.title}</div>
                              </div>
                            </div>
                            <span className="text-xs font-mono text-slate-400 ml-2">*{prob.difficulty_rating}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-sm font-bold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-400" />
                        Suas Submissões
                      </span>
                    </div>
                    {!user ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Faça login para registrar seu histórico e evoluir seu rating.
                      </div>
                    ) : submissions.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Nenhuma submissão enviada ainda.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/70 max-h-64 overflow-y-auto text-xs">
                        {submissions.map((sub) => (
                          <div key={sub.id} className="px-4 py-2.5 flex items-center justify-between">
                            <span className="font-mono text-slate-300 truncate max-w-[180px]">
                              {sub.submitted_answer}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-bold ${
                                sub.verdict === 'AC'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {sub.verdict}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {authMode === 'login' ? 'Entrar na NOIC League' : 'Criar Conta de Competidor'}
              </h3>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Handle (Nome de usuário)</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex: fisica_noic"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#0b0f19] border border-slate-700 text-sm text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0b0f19] border border-slate-700 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Senha</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0b0f19] border border-slate-700 text-sm text-white"
                />
              </div>

              {authError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition"
              >
                {authLoading ? 'Processando...' : authMode === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            </form>

            <div className="text-center text-xs text-slate-400">
              {authMode === 'login' ? (
                <>
                  Ainda não tem conta?{' '}
                  <button
                    onClick={() => setAuthMode('signup')}
                    className="text-indigo-400 hover:underline font-medium"
                  >
                    Criar agora
                  </button>
                </>
              ) : (
                <>
                  Já possui conta?{' '}
                  <button
                    onClick={() => setAuthMode('login')}
                    className="text-indigo-400 hover:underline font-medium"
                  >
                    Fazer login
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
