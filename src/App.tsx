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
import { getNextTuesday13h, getNextWednesday13h, shouldAutoOpenWednesdayMidnight, formatDateTimeDisplay, getRoundNumber, isTuesdayMatchday } from './utils/dateUtils';
import { REAL_UCL_FIXTURES } from './constants/uclFixtures';
import { Check, Trophy, Sparkles, History, Shield } from 'lucide-react';

import { UclLogo, UclAtmosphereBackground, UclStarball, UclTrophy } from './components/UclAssets';

export default function App() {
  const [activeTab, setActiveTab] = useState<'palpites' | 'historico' | 'classificacao' | 'admin'>('palpites');
  const [schedulerLog, setSchedulerLog] = useState<string>('');

  // 1. Initial Seeding and New Tournament Check (runs silently in background)
  useEffect(() => {
    async function initTournament() {
      try {
        await checkAndEnsureNewTournament();
      } catch (err) {
        console.error("Error during initTournament", err);
      }
    }
    initTournament();
  }, []);

  // 2. Background Round Closing & Market Opening Scheduler
  // - Fecha na terça-feira às 13:00 (jogos de terça)
  // - Fecha na quarta-feira às 13:00 (jogos de quarta)
  // - Abre na quinta-feira à meia-noite (00:00) automaticamente se o ADM não tiver atualizado nada
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
        rounds.sort((a, b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));

        // 0. Auto-reconciliação de integridade do ciclo Champions League:
        // Se hoje for quarta-feira e houver rodada aberta de quarta com fechamento incorreto (> 1 dia, ex: apontando para terça que vem):
        if (now.getDay() === 3) {
          const wedDeadline = getNextWednesday13h(now);
          for (const r of rounds) {
            if (r.status === 'aberta' && !r.is_test) {
              const isWedRound = !isTuesdayMatchday(r) || r.id === 'round-1' || r.id === 'round-1-quarta';
              if (isWedRound) {
                const diffDays = Math.abs(new Date(r.fechamento).getTime() - wedDeadline.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays >= 1) {
                  console.log(`Scheduler: Corrigindo prazo da ${r.nome} para fechar hoje (quarta-feira) às 13:00.`);
                  await updateDoc(doc(db, 'rodadas', r.id), {
                    fechamento: wedDeadline.toISOString()
                  });
                  r.fechamento = wedDeadline.toISOString();
                }
              }
            }
          }
        } else if (now.getDay() === 2) {
          const tueDeadline = getNextTuesday13h(now);
          for (const r of rounds) {
            if (r.status === 'aberta' && !r.is_test && isTuesdayMatchday(r)) {
              const diffDays = Math.abs(new Date(r.fechamento).getTime() - tueDeadline.getTime()) / (1000 * 60 * 60 * 24);
              if (diffDays >= 1) {
                console.log(`Scheduler: Corrigindo prazo da ${r.nome} para fechar hoje (terça-feira) às 13:00.`);
                await updateDoc(doc(db, 'rodadas', r.id), {
                  fechamento: tueDeadline.toISOString()
                });
                r.fechamento = tueDeadline.toISOString();
              }
            }
          }
        }

        // 1. Encerramento automático ao atingir o fechamento (terças ou quartas às 13:00)
        const lateRounds = rounds.filter(r => r.status === 'aberta' && r.fechamento <= nowStr && !r.is_test);

        for (const r of lateRounds) {
          const closingDayName = new Date(r.fechamento).getDay() === 3 ? 'quarta-feira às 13:00' : 'terça-feira às 13:00';
          console.log(`Scheduler: fechamento atingido para ${r.nome} (${closingDayName}). Fechando mercado...`);
          
          await updateDoc(doc(db, 'rodadas', r.id), {
            status: 'encerrada'
          });

          setSchedulerLog(`Mercado da "${r.nome}" encerrado pontualmente (${closingDayName}). Aguardando apuração dos resultados oficiais.`);
        }

        // 2. Reabertura automática na meia-noite da quarta-feira (00:00) se o ADM não atualizou na terça:
        // "Se não houver atualização do administrador, à meia-noite da quarta-feira ele já é reaberto e de 13 horas da quarta-feira é fechado novamente."
        if (shouldAutoOpenWednesdayMidnight(rounds, now)) {
          const roundToOpen = rounds.find(r => !r.is_test && r.id !== 'rodada-teste' && !r.apurada && r.status !== 'aberta');
          
          if (roundToOpen) {
            const wedDeadline = getNextWednesday13h(now);
            const matches = REAL_UCL_FIXTURES['21/10'] || REAL_UCL_FIXTURES['20/10'];

            await updateDoc(doc(db, 'rodadas', roundToOpen.id), {
              status: 'aberta',
              abertura: nowStr,
              fechamento: wedDeadline.toISOString(),
              data_jogos: '21/10',
              jogos_disponiveis: matches
            });

            console.log(`Scheduler: Mercado reaberto automaticamente na meia-noite de quarta para ${roundToOpen.nome}!`);
            setSchedulerLog(`Mercado da "${roundToOpen.nome}" REABERTO AUTOMATICAMENTE na meia-noite de quarta! Fechamento hoje às 13:00 (${formatDateTimeDisplay(wedDeadline.toISOString())}).`);
          }
        }
      } catch (err) {
        console.error("Error running scheduler monitor", err);
      }
    }

    monitorRoundSchedules();
    // Executar verificação a cada 30 segundos
    const timer = setInterval(monitorRoundSchedules, 30000);
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
          <button onClick={() => setSchedulerLog('')} className="hover:text-white font-bold px-1.5 cursor-pointer">✕</button>
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

            {/* Navigation tabs - UEFA Segmented Match Center (grid on mobile, flex on desktop) */}
            <nav className="w-full md:w-auto grid grid-cols-4 md:flex gap-1 bg-[#091136]/90 p-1 rounded-xl border border-cyan-500/25 shadow-inner">
              <button
                onClick={() => setActiveTab('palpites')}
                className={`py-2 px-1 sm:px-3.5 rounded-lg font-bold text-[11px] sm:text-xs transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'palpites'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <UclStarball className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'palpites' ? 'text-white' : 'text-cyan-400'}`} />
                <span className="truncate">Palpites</span>
              </button>
              <button
                onClick={() => setActiveTab('historico')}
                className={`py-2 px-1 sm:px-3.5 rounded-lg font-bold text-[11px] sm:text-xs transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'historico'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="sm:hidden truncate">Histórico</span>
                <span className="hidden sm:inline truncate">Anteriores</span>
              </button>
              <button
                onClick={() => setActiveTab('classificacao')}
                className={`py-2 px-1 sm:px-3.5 rounded-lg font-bold text-[11px] sm:text-xs transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'classificacao'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <UclTrophy className="w-3.5 h-3.5 text-cyan-200 shrink-0" />
                <span className="sm:hidden truncate">Ranking</span>
                <span className="hidden sm:inline truncate">Classificação</span>
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className={`py-2 px-1 sm:px-3.5 rounded-lg font-bold text-[11px] sm:text-xs transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'admin'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">Admin</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Container Stage - Instant Zero-Delay Opening */}
      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-2 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
        <div className="transition-all duration-300 w-full max-w-full overflow-x-hidden">
          {activeTab === 'palpites' && <PalpitesPage />}
          {activeTab === 'historico' && <HistoricoRodadas />}
          {activeTab === 'classificacao' && <LeaderboardPage />}
          {activeTab === 'admin' && <AdminPage />}
        </div>
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
