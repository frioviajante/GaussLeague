import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'NOIC League — Competitive Physics & SymPy Judge',
  description: 'Plataforma competitiva de resolução de problemas do Irodov e NOIC com julgamento simbólico.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#0b0f19] text-slate-100 antialiased min-h-screen flex flex-col">
        <div className="flex-1">{children}</div>

        <footer className="w-full border-t border-slate-800/80 py-6 text-center text-sm text-slate-400">
          <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="font-semibold text-slate-300">Gauss League</span>
            <p>
              Feito por{' '}
              <span className="font-medium text-slate-200">Caio Yamashita Risseto</span>{' '}
              (Medalhista EuPhO), com auxílio do Gemini.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
