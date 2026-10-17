import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import PalpitesPage from './components/PalpitesPage';
import LeaderboardPage from './components/LeaderboardPage';
import AdminPage from './components/AdminPage';
import HistoricoRodadas from './components/HistoricoRodadas';
import { sortRoundsChronologically, formatDateTimeDisplay, isTuesdayMatchday } from './utils/dateUtils';
import { Check, Trophy, Sparkles, History, Shield } from 'lucide-react';
import { UclLogo, UclAtmosphereBackground, UclStarball, UclTrophy } from './components/UclAssets';

export default function App() {
  const [activeTab, setActiveTab] = useState<'palpites' | 'historico' | 'classificacao' | 'admin'>('palpites');
  const [schedulerLog, setSchedulerLog] = useState<string>('');

  // Background Round Closing Monitor
  // Fecha a rodada aberta estritamente quando o horário limite (13:00) for ultrapassado
  useEffect(() => {
    async function monitorRoundSchedules() {
      try {
        const now = new Date();
        const nowStr = now.toISOString();
        const snap = await getDocs(collection(db, 'rodadas'));
        
        const rounds: any[] = [];
        snap.forEach(docObj => {
          rounds.push({ id: docObj.id, ...docObj.data() });
        });

        // 1. Encerramento automático de rodadas expiradas (fechamento às 13:00)
        const expiredRounds = rounds.filter(r => r.status === 'aberta' && r.fechamento && nowStr >= r.fechamento && !r.is_test);

        for (const r of expiredRounds) {
          const closingDayName = new Date(r.fechamento).getDay() === 3 ? 'quarta-feira às 13:00' : 'terça-feira às 13:00';
          console.log(`Scheduler: Prazo de 13h atingido para "${r.nome}". Encerrando mercado...`);
          
          await updateDoc(doc(db, 'rodadas', r.id), {
            status: 'encerrada'
          });

          setSchedulerLog(`Mercado da "${r.nome}" encerrado pontualmente às 13:00 (${closingDayName}). Aguardando apuração dos resultados.`);
        }
      } catch (err) {
        console.error("Erro no monitor de fechamento de rodadas:", err);
      }
    }

    monitorRoundSchedules();
    const timer = setInterval(monitorRoundSchedules, 60000); // 60 segundos
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#030719] text-slate-100 font-sans flex flex-col relative selection:bg-cyan-500 selection:text-black">
      {/* UEFA Champions League Starlight Atmosphere */}
      <UclAtmosphereBackground />

      {/* Dynamic automatic scheduler alert banner */}
      {schedulerLog && (
        <div className="relative z-50 bg-[#070e30] border-b border-cyan-500/30 text-cyan-300 text-xs px-4 py-2 font-mono flex items-center justify-between text-center shadow-md">
          <span className="mx-auto flex items-center gap-1.5 justify-center">
            <UclStarball className="w-3.5 h-3.5 text-cyan-400" />
            {schedulerLog}
          </span>
          <button type="button" onClick={() => setSchedulerLog('')} className="hover:text-white font-bold px-1.5 cursor-pointer">✕</button>
        </div>
      )}

      {/* Main navigation header - Champions League Broadcast Grade */}
      <header className="relative z-40 bg-[#050b28]/95 backdrop-blur-md border-b border-cyan-500/20 shadow-xl shadow-black/50 sticky top-0 shrink-0 w-full overflow-hidden">
        {/* Glow Line Top */}
        <div className="h-[2px] w-full bg-gradient-to-r from-blue-700 via-cyan-400 to-indigo-600" />

        <div className="max-w-6xl mx-auto px-2 sm:px-6 w-full">
          <div className="flex flex-col md:flex-row items-center justify-between py-2 sm:py-2.5 md:py-0 md:h-20 gap-2 sm:gap-3 w-full">
            {/* Logo area */}
            <div className="w-full md:w-auto flex justify-center md:justify-start">
              <UclLogo size="md" />
            </div>

            {/* Navigation Tabs Bar */}
            <nav className="flex items-center gap-1 sm:gap-2 bg-[#040822] p-1 sm:p-1.5 rounded-2xl border border-cyan-500/20 shadow-inner w-full md:w-auto justify-center">
              <button
                type="button"
                onClick={() => setActiveTab('palpites')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm font-display tracking-wider transition-all duration-300 cursor-pointer ${
                  activeTab === 'palpites'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Palpites</span>
                <span className="sm:hidden truncate">Palpites</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('classificacao')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm font-display tracking-wider transition-all duration-300 cursor-pointer ${
                  activeTab === 'classificacao'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Classificação Geral</span>
                <span className="sm:hidden truncate">Ranking</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('historico')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm font-display tracking-wider transition-all duration-300 cursor-pointer ${
                  activeTab === 'historico'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Histórico</span>
                <span className="sm:hidden truncate">Histórico</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm font-display tracking-wider transition-all duration-300 cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Painel ADM</span>
                <span className="sm:hidden truncate">ADM</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content body */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-2 sm:px-4 py-4 sm:py-6 relative z-10">
        <div className="bg-[#050b28]/60 backdrop-blur-md rounded-2xl sm:rounded-3xl border border-cyan-500/15 p-2 sm:p-5 sm:shadow-2xl sm:shadow-cyan-950/40">
          {activeTab === 'palpites' && <PalpitesPage onSuggestName={() => {}} />}
          {activeTab === 'classificacao' && <LeaderboardPage />}
          {activeTab === 'historico' && <HistoricoRodadas />}
          {activeTab === 'admin' && <AdminPage />}
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="mt-auto border-t border-cyan-500/10 py-4 text-center text-xs text-slate-300/80 font-mono tracking-wider">
        <p className="flex items-center justify-center gap-1.5 flex-wrap">
          <UclStarball className="w-3 h-3 text-cyan-400 inline" />
          <span>Bolão Oficial dos Amigos</span>
          <span>•</span>
          <span>Campeonato por Pontos Corridos</span>
        </p>
      </footer>
    </div>
  );
}
