import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'GaussLeague — Competitive Physics & SymPy Judge',
  description: 'Plataforma competitiva de resolução de problemas do Irodov e NOIC com julgamento simbólico.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#0b0f19] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
