import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'IrodovArena — Competitive Physics & PhysElo',
  description: 'Plataforma competitiva de física com problemas do Irodov, correção simbólica via SymPy e rating dinâmico.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#0b0f19] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
