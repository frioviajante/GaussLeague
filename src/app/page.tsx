'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Flame,
  BarChart3,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Award,
} from 'lucide-react';

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

interface Olympiad {
  id: string;
  competition: string;
  year: number;
  title: string;
  duration_minutes: number;
}

interface Problem {
  id: string;
  irodov_code: string;
  title: string;
  category: string;
  difficulty_rating: number;
  statement_latex: string;
  svg_diagram?: string;
  figure_url?: string | null;
  answer_type: 'numeric' | 'algebraic';
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
    code: 'BIOPh',
    name: 'Brazilian International Olympiad of Physics',
    duration: '5h',
    badge: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  },
  {
    code: 'OBF',
    name: 'Olimpíada Brasileira de Física',
    duration: '4h',
    badge: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
];

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

function formatTimer(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
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

function MathText({ content }: { content: string }) {
  const parts = (content || '').split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  return (
    <div className="leading-relaxed text-slate-200 space-y-2">
      {parts.map((part, idx) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          return <BlockMath key={idx} math={part.slice(2, -2)} />;
        }
        if (part.startsWith('$') && part.endsWith('$')) {
          return <InlineMath key={idx} math={part.slice(1, -1)} />;
        }
        return <span key={idx}>{part}</span>;
      })}
    </div>
  );
}

export default function GaussLeaguePage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'problem' | 'editorial' | 'standings' | 'olympiads'>('problem');
  const [selectedSource, setSelectedSource] = useState<ProblemSource>('irodov');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [editorialContent, setEditorialContent] = useState<string | null>(null);
  const [editorialError, setEditorialError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Estados das Olimpíadas (modo Unrated)
  const [olympiads, setOlympiads] = useState<Olympiad[]>([]);
  const [loadingOlympiads, setLoadingOlympiads] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<string | null>(null);
  const [activeOlympiad, setActiveOlympiad] = useState<Olympiad | null>(null);
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

  useEffect(() => {
    const savedToken = localStorage.getItem('irodov_token');
    if (savedToken) {
      setToken(savedToken);
      fetchMe(savedToken);
      fetchUserSubmissions(savedToken);
    }
    fetchLeaderboard();
    fetchOlympiads();
  }, []);

  useEffect(() => {
    if (!activeOlympiad) {
      fetchProblems(selectedSource, true);
    }
  }, [selectedSource]);

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

  async function fetchOlympiads() {
    setLoadingOlympiads(true);
    try {
      const res = await fetch(`${API_URL}/olympiads`);
      if (res.ok) {
        setOlympiads(await res.json());
      }
    } catch {
      // Backend ainda sem endpoint /olympiads
    } finally {
      setLoadingOlympiads(false);
    }
  }

  async function startOlympiadSimulation(oly: Olympiad) {
    setLoadingData(true);
    setActiveOlympiad(oly);
    setTimeLeftSeconds((oly.duration_minutes || 300) * 60);
    setTimerRunning(true);
    setActiveTab('problem');
    setLastFeedback(null);
    setAnswerInput('');

    try {
      const res = await fetch(`${API_URL}/olympiads/${oly.id}/problems`);
      if (res.ok) {
        const rawData: Problem[] = await res.json();
        const data = [...rawData].sort((a, b) => compareProblemCodes(a.irodov_code, b.irodov_code));
        setProblems(data);
        setSelectedProblem(data.length > 0 ? data[0] : null);
      }
    } finally {
      setLoadingData(false);
    }
  }

  function exitOlympiadSimulation(goToTab: 'olympiads' | 'problem' = 'olympiads') {
    setActiveOlympiad(null);
    setTimerRunning(false);
    setTimeLeftSeconds(0);
    setLastFeedback(null);
    setAnswerInput('');
    setActiveTab(goToTab);
    fetchProblems(selectedSource, true);
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
    const isUnrated = Boolean(activeOlympiad || selectedProblem.olympiad_id);

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
              solved_count: isAC && !solvedProblemIds.has(selectedProblem.id) ? prev.solved_count + 1 : prev.solved_count,
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

      const refreshTasks: Promise<void>[] = [fetchUserSubmissions(token), fetchLeaderboard()];
      if (!activeOlympiad) {
        refreshTasks.push(fetchProblems(selectedSource, false));
      }
      await Promise.all(refreshTasks);
      if (isAC) setAnswerInput('');
    } catch (err: any) {
      setLastFeedback({ verdict: 'WA', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const solvedProblemIds = useMemo(() => {
    return new Set(submissions.filter((s) => s.verdict === 'AC').map((s) => s.problem_id));
  }, [submissions]);

  const olympiadSolvedCount = useMemo(() => {
    if (!activeOlympiad) return 0;
    return problems.filter((p) => solvedProblemIds.has(p.id)).length;
  }, [activeOlympiad, problems, solvedProblemIds]);

  const filteredOlympiads = useMemo(() => {
    if (!selectedCompetition) return [];
    return olympiads
      .filter((o) => o.competition.toLowerCase() === selectedCompetition.toLowerCase())
      .sort((a, b) => b.year - a.year);
  }, [olympiads, selectedCompetition]);

  const rank = getRankInfo(user?.rating ?? 1200);
  const sourceLabel = activeOlympiad ? activeOlympiad.competition : selectedSource === 'noic' ? 'NOIC' : 'Irodov';

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-[#0f1629]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-white">Gauss</span>
                <span className="font-bold text-lg tracking-tight text-indigo-400">League</span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => {
                  if (activeOlympiad) {
                    exitOlympiadSimulation('problem');
                  } else {
                    setActiveTab('problem');
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === 'problem' && !activeOlympiad
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Problemas
              </button>
              <button
                onClick={openEditorialTab}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === 'editorial' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Editorial
              </button>
              <button
                onClick={() => setActiveTab('standings')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === 'standings' ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                Ranking (Rating)
              </button>
              <button
                onClick={() => {
                  setActiveTab('olympiads');
                  fetchOlympiads();
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  activeTab === 'olympiads' || (activeTab === 'problem' && activeOlympiad)
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Olimpíadas
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className={`text-sm font-bold ${rank.color}`}>{user.username}</div>
                  <div className="text-xs text-slate-400">
                    Rating: <span className={`font-mono font-semibold ${rank.color}`}>{user.rating}</span> ({rank.title})
                  </div>
                </div>
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
                Entrar / Criar Conta
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'olympiads' ? (
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
                  Escolha uma competição para simular provas antigas com cronômetro e correção automática via SymPy, sem alterar seu PhysElo global.
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
                          <p className="text-xs text-slate-400 mt-1">Simulado virtual • Não altera o PhysElo global</p>
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
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h2 className="font-bold text-lg">Classificação Global — PhysElo</h2>
              </div>
              <button
                onClick={fetchLeaderboard}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar
              </button>
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
                      <tr key={u.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-6 font-mono text-slate-400">{index + 1}</td>
                        <td className={`py-3.5 px-6 font-bold ${userRank.color}`}>{u.username}</td>
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
        ) : (
          <div className="space-y-6">
            {activeOlympiad && (
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
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-base">{activeOlympiad.title}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        UNRATED
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Progresso: <strong className="text-emerald-400">{olympiadSolvedCount}</strong> / {problems.length} itens resolvidos
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
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
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                {loadingData ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                    Conectando à API e carregando acervo {sourceLabel}...
                  </div>
                ) : !selectedProblem ? (
                  <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                    {activeOlympiad ? (
                      <>Nenhuma questão encontrada para <strong className="text-white">{activeOlympiad.title}</strong>.</>
                    ) : selectedSource === 'noic' ? (
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
                                activeOlympiad
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : selectedSource === 'noic'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-800 text-indigo-300'
                              }`}
                            >
                              {activeOlympiad ? selectedProblem.irodov_code : `${sourceLabel} ${selectedProblem.irodov_code}`}
                            </span>
                            <span>•</span>
                            <span>{selectedProblem.category}</span>
                          </div>
                          <h1 className="text-2xl font-bold text-white">{selectedProblem.title}</h1>
                        </div>

                        <div className="flex items-center gap-2">
                          {solvedProblemIds.has(selectedProblem.id) && (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Resolvido
                            </span>
                          )}
                          <span className="px-3 py-1 rounded-md bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700">
                            {activeOlympiad ? (
                              <strong className="text-amber-400">Unrated</strong>
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

                      <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-indigo-400">Formato esperado: </span>
                          {selectedProblem.answer_type === 'algebraic'
                            ? `Expressão simbólica (${selectedProblem.variables_hint || 'use g, m, R, v_0, alpha...'})`
                            : `Valor numérico ${selectedProblem.unit ? `em [${selectedProblem.unit}]` : ''}`}
                        </div>
                        <span className="font-mono text-slate-500">Motor: SymPy</span>
                      </div>
                    </div>

                    <form
                      onSubmit={handleSubmitSolution}
                      className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                          <Code2 className="w-4 h-4 text-indigo-400" />
                          Sua Resposta ({selectedProblem.answer_type === 'algebraic' ? 'Algébrica' : 'Numérica'})
                        </label>
                        <span className="text-xs text-slate-500">Ex: sqrt(2*g*h) ou 2*R/3</span>
                      </div>

                      <input
                        type="text"
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        placeholder={
                          selectedProblem.answer_type === 'algebraic'
                            ? 'Digite a expressão em sintaxe Python/SymPy...'
                            : 'Digite o valor numérico (ex: 4.9 ou 1.5e-3)...'
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
                  </>
                )}
              </div>

              <div className="lg:col-span-4 space-y-6">
                <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                  {!activeOlympiad && (
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
                  )}

                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      <BarChart3
                        className={`w-4 h-4 ${
                          activeOlympiad
                            ? 'text-amber-400'
                            : selectedSource === 'noic'
                            ? 'text-emerald-400'
                            : 'text-indigo-400'
                        }`}
                      />
                      {activeOlympiad ? activeOlympiad.title : `Acervo ${sourceLabel}`}
                    </span>
                    <span className="text-xs text-slate-400">{problems.length} itens</span>
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
                              ? activeOlympiad
                                ? 'bg-amber-500/15'
                                : selectedSource === 'noic'
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
                                  activeOlympiad
                                    ? 'text-amber-400'
                                    : selectedSource === 'noic'
                                    ? 'text-emerald-400'
                                    : 'text-indigo-400'
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
            </div>
          </div>
        )}
      </main>

      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {authMode === 'login' ? 'Entrar na Gauss League' : 'Criar Conta de Competidor'}
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
                    placeholder="ex: gauss_br"
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
