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
    <div className="min-h-screen bg-[#fcfcfc] text-neutral-900 font-sans flex flex-col">
      {/* Dynamic automatic scheduler alert banner */}
      {schedulerLog && (
        <div className="bg-neutral-900 text-white text-xs px-4 py-2 font-mono flex items-center justify-between text-center">
          <span className="mx-auto flex items-center gap-1.5 justify-center">
            <Check className="w-4 h-4 text-emerald-400" />
            {schedulerLog}
          </span>
          <button onClick={() => setSchedulerLog('')} className="hover:text-neutral-400 font-bold px-1.5">✕</button>
        </div>
      )}

      {/* Main navigation header */}
      <header className="bg-white/95 border-b-2 border-[#009739] sticky top-0 z-50 shadow-sm shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo area */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white text-base shadow-sm">
                🏆
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-black tracking-tight text-green-800 uppercase block leading-tight text-lg">
                    Copa dos Palpites
                  </span>
                  <span className="bg-[#009739] text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Novo Campeonato
                  </span>
                </div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block font-bold">
                  Competição Oficial • 36 Times • 50 Rodadas
                </span>
              </div>
            </div>

            {/* Navigation buttons */}
            <nav className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('palpites')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-md font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'palpites'
                    ? 'bg-white text-green-700 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                PALPITES
              </button>
              <button
                onClick={() => setActiveTab('historico')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-md font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                  activeTab === 'historico'
                    ? 'bg-white text-green-700 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                RODADAS ANTERIORES
              </button>
              <button
                onClick={() => setActiveTab('classificacao')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-md font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'classificacao'
                    ? 'bg-white text-green-700 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                CLASSIFICAÇÃO
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-md font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-white text-green-700 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                ADMINISTRAÇÃO
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Container Stage */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {seedingActive ? (
          <div className="py-24 text-center font-mono text-neutral-400 text-sm">
            Iniciando Novo Campeonato e conectando ao banco de dados...
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

      {/* Simple Footer */}
      <footer className="bg-white border-t border-neutral-200 px-8 py-4 flex flex-col sm:flex-row justify-between items-center text-[11px] text-neutral-400 font-bold tracking-wide uppercase mt-auto">
        <p>&copy; 2026 COPA DOS PALPITES • NOVO CAMPEONATO OFICIAL</p>
        <div className="flex gap-4 items-center mt-2 sm:mt-0 font-bold">
          <span>SISTEMA AUTOMÁTICO DE PLACARES</span>
        </div>
      </footer>
    </div>
  );
}
