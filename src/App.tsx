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
import { checkAndEnsureNewTournament } from './utils/tournamentReset';
import { Check, Trophy, Sparkles, History } from 'lucide-react';

import { UclLogo, UclAtmosphereBackground, UclStarball, UclTrophy } from './components/UclAssets';

export default function App() {
  const [activeTab, setActiveTab] = useState<'palpites' | 'historico' | 'classificacao' | 'admin'>('palpites');
  const [seedingActive, setSeedingActive] = useState(true);
  const [schedulerLog, setSchedulerLog] = useState<string>('');

  // 1. Initial Seeding and New Tournament Check
  useEffect(() => {
    async function initTournament() {
      try {
        setSeedingActive(true);
        // Guarantee points are zeroed and new tournament is active from today
        await checkAndEnsureNewTournament();
      } catch (err) {
        console.error("Error during initTournament", err);
      } finally {
        setSeedingActive(false);
      }
    }
    initTournament();
  }, []);

  // 2. Background Round Closing Scheduler
  useEffect(() => {
    async function monitorRoundSchedules() {
      try {
        const nowStr = new Date().toISOString();
        const snap = await getDocs(collection(db, 'rodadas'));
        
        const rounds: any[] = [];
        snap.forEach(docObj => {
          rounds.push({ id: docObj.id, ...docObj.data() });
        });

        // Find active open rounds that have passed their fechamento deadline (Tuesday 13h)
        const lateRounds = rounds.filter(r => r.status === 'aberta' && r.fechamento <= nowStr);

        for (const r of lateRounds) {
          console.log(`Scheduler: fechamento atingido para ${r.nome} (terça-feira às 13:00). Fechando mercado...`);
          
          await updateDoc(doc(db, 'rodadas', r.id), {
            status: 'encerrada'
          });

          setSchedulerLog(`Mercado da "${r.nome}" foi encerrado (terça-feira às 13:00). Aguardando atualização dos placares para abrir a próxima rodada.`);
        }
      } catch (err) {
        console.error("Error running scheduler monitor", err);
      }
    }

    if (!seedingActive) {
      monitorRoundSchedules();
      const timerId = setInterval(monitorRoundSchedules, 15000);
      return () => clearInterval(timerId);
    }
  }, [seedingActive]);

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
          <button onClick={() => setSchedulerLog('')} className="hover:text-white font-bold px-1.5 cursor-pointer">✕</button>
        </div>
      )}

      {/* Main navigation header - Champions League Broadcast Grade */}
      <header className="relative z-40 bg-[#050b28]/95 backdrop-blur-md border-b border-cyan-500/20 shadow-xl shadow-black/50 sticky top-0 shrink-0">
        {/* Glow Line Top */}
        <div className="h-[2px] w-full bg-gradient-to-r from-blue-700 via-cyan-400 to-indigo-600" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between py-2.5 md:py-0 md:h-20 gap-3">
            {/* Logo area */}
            <UclLogo size="md" />

            {/* Navigation tabs - UEFA Segmented Match Center */}
            <nav className="flex gap-1 bg-[#091136]/90 p-1 rounded-xl border border-cyan-500/25 shadow-inner">
              <button
                onClick={() => setActiveTab('palpites')}
                className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'palpites'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <UclStarball className={`w-3.5 h-3.5 ${activeTab === 'palpites' ? 'text-white' : 'text-cyan-400'}`} />
                PALPITES
              </button>
              <button
                onClick={() => setActiveTab('historico')}
                className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'historico'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <History className="w-3.5 h-3.5 text-cyan-400" />
                RODADAS ANTERIORES
              </button>
              <button
                onClick={() => setActiveTab('classificacao')}
                className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'classificacao'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <UclTrophy className="w-4 h-4 text-cyan-200" />
                CLASSIFICAÇÃO
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-3 sm:px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'admin'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                ADMINISTRAÇÃO
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Container Stage */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {seedingActive ? (
          <div className="py-24 text-center font-mono text-cyan-300 text-sm flex flex-col items-center justify-center gap-3">
            <UclStarball className="w-10 h-10 animate-spin text-cyan-400" glow />
            <span>Carregando a Noite de UEFA Champions League...</span>
          </div>
        ) : (
          <div className="transition-all duration-300">
            {activeTab === 'palpites' && <PalpitesPage />}
            {activeTab === 'historico' && <HistoricoRodadas />}
            {activeTab === 'classificacao' && <LeaderboardPage />}
            {activeTab === 'admin' && <AdminPage />}
          </div>
        )}
      </main>

      {/* Champions League Official Broadcast Footer */}
      <footer className="relative z-20 bg-[#040822] border-t border-cyan-500/20 px-6 sm:px-10 py-5 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-400 font-bold tracking-wider uppercase mt-auto gap-3">
        <div className="flex items-center gap-2">
          <UclStarball className="w-5 h-5 text-cyan-400" glow />
          <p className="font-mono text-slate-300">&copy; 2026 UEFA CHAMPIONS LEAGUE • COPA DOS PALPITES</p>
        </div>
        <div className="flex gap-4 items-center text-[10px] font-mono text-slate-400">
          <span className="text-cyan-400 font-black">THE CHAMPIONS</span>
          <span>·</span>
          <span>36 CLUBES EUROPEUS</span>
          <span>·</span>
          <span>50 RODADAS OFICIAIS</span>
        </div>
      </footer>
    </div>
  );
}
