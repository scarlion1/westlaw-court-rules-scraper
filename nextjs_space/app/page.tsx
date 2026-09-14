import { Scale } from 'lucide-react';
import HomeClient from '@/components/home-client';
import ThemeToggle from '@/components/theme-toggle';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Arizona Court Rules <span className="text-amber-500">Scraper</span>
            </h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed">
            Browse and download Arizona court rules from WestLaw as structured JSON.
            Select a rule set below to scrape its complete content with metadata and hierarchical structure preserved.
          </p>
        </div>

        <HomeClient />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
          Data sourced from Thomson Reuters WestLaw • For educational and research purposes
        </div>
      </footer>
    </div>
  );
}
