import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  updateDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import PalpitesPage from './components/PalpitesPage';
import LeaderboardPage from './components/LeaderboardPage';
import AdminPage from './components/AdminPage';
import { Award, Trophy, ShieldAlert, KeyRound, Check, Calendar, Star, HelpCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'palpites' | 'classificacao' | 'admin'>('palpites');
  const [seedingActive, setSeedingActive] = useState(false);
  const [schedulerLog, setSchedulerLog] = useState<string>('');

  // 1. Initial Seeding Check on Bootstrap
  useEffect(() => {
    async function checkAndSeed() {
      try {
        setSeedingActive(true);
        const roundsSnap = await getDocs(collection(db, 'rodadas'));
        
        if (roundsSnap.empty) {
          console.log("Database is empty. Seeding Initial Data for Copa dos Palpites...");
          const now = new Date();
          
          // Rodada 1: Encerrada (past) - fechamento was yesterday
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
          
          // Rodada 2: Aberta (active) - closing in 3 days
          const targetCloseDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

          // Seed Rodada 1
          await setDoc(doc(db, 'rodadas', 'round-1'), {
            nome: 'Rodada 1 (Grupos)',
            abertura: twoDaysAgo.toISOString(),
            fechamento: yesterday.toISOString(),
            status: 'encerrada'
          });

          // Seed Rodada 2
          await setDoc(doc(db, 'rodadas', 'round-2'), {
            nome: 'Rodada 2 (Oitavas)',
            abertura: yesterday.toISOString(),
            fechamento: targetCloseDate.toISOString(),
            status: 'aberta'
          });

          // Seed Participants
          await setDoc(doc(db, 'participantes', 'joao'), { nome: 'João Silva', pontos: 35 });
          await setDoc(doc(db, 'participantes', 'carlos'), { nome: 'Carlos Souza', pontos: 31 });
          await setDoc(doc(db, 'participantes', 'ana'), { nome: 'Ana Santos', pontos: 27 });

          // Seed Initial Scores logs
          await setDoc(doc(db, 'pontuacoes', 'p-log-1'), {
            participante: 'João Silva',
            pontos: 35,
            motivo: 'Avaliação: Rodada 1 (Grupos) • Acertos Múltiplos',
            data_hora: yesterday.toISOString()
          });
          await setDoc(doc(db, 'pontuacoes', 'p-log-2'), {
            participante: 'Carlos Souza',
            pontos: 31,
            motivo: 'Avaliação: Rodada 1 (Grupos) • Acertou Placar Brasil',
            data_hora: yesterday.toISOString()
          });
          await setDoc(doc(db, 'pontuacoes', 'p-log-3'), {
            participante: 'Ana Santos',
            pontos: 27,
            motivo: 'Avaliação: Rodada 1 (Grupos)',
            data_hora: yesterday.toISOString()
          });

          // Seed guesses for Rodada 1 (closed)
          // João (2 submittals, 2nd is valid)
          // 1st submission
          await setDoc(doc(db, 'palpites', 'g-1-1'), {
            participante: 'João Silva',
            rodada: 'round-1',
            palpite: 'Brasil 1x1 Argentina',
            capitao: 'Messi',
            data_hora_envio: twoDaysAgo.toISOString(),
            envio_numero: 1
          });
          // 2nd submission (valid)
          await setDoc(doc(db, 'palpites', 'g-1-2'), {
            participante: 'João Silva',
            rodada: 'round-1',
            palpite: 'Brasil 2x1 Argentina',
            capitao: 'Neymar',
            data_hora_envio: new Date(twoDaysAgo.getTime() + 60*60*1000).toISOString(),
            envio_numero: 2
          });

          // Carlos
          await setDoc(doc(db, 'palpites', 'g-2-1'), {
            participante: 'Carlos Souza',
            rodada: 'round-1',
            palpite: 'Alemanha 0x1 França',
            capitao: 'Mbappé',
            data_hora_envio: twoDaysAgo.toISOString(),
            envio_numero: 1
          });

          // Ana
          await setDoc(doc(db, 'palpites', 'g-3-1'), {
            participante: 'Ana Santos',
            rodada: 'round-1',
            palpite: 'Croácia 0x0 Marrocos',
            capitao: 'Modric',
            data_hora_envio: twoDaysAgo.toISOString(),
            envio_numero: 1
          });

          // Seed default administrative username and pw
          await setDoc(doc(db, 'admins', 'master'), {
            login: 'admincopa',
            senha_hash: '1234'
          });

          console.log("Database seeded successfully!");
        }

        // ENFORCE USER INTEREST TIMING UNCONDITIONALLY ON EVERY BOOT:
        // Rodada de teste: June 9, 2026 to June 10, 2026 at 12:00 BRT (15:00 UTC).
        // Rodada 1 starts June 10, 2026 at 12:00 BRT (15:00 UTC) until June 11, 2026 at 12:00 BRT (15:00 UTC).
        // Each successive round starts when the previous one ends, for 50 days (rounds 1 to 50).
        const now = new Date();
        const nowISO = now.toISOString();

        // Get currently stored list of rounds to prevent resetting their status
        const existingRoundsMap = new Map<string, string>();
        const allRoundsSnapInitial = await getDocs(collection(db, 'rodadas'));
        allRoundsSnapInitial.forEach((docSnap) => {
          existingRoundsMap.set(docSnap.id, docSnap.data().status || 'aberta');
        });

        const testAbertura = '2026-06-09T15:00:00Z'; // June 9, 12:00 BRT
        const testFechamento = '2026-06-10T15:00:00Z'; // June 10, 12:00 BRT

        // Create or update the Rodada de Teste
        let testStatus = existingRoundsMap.get('round-teste') || 'aberta';
        if (new Date(testFechamento).getTime() <= now.getTime()) {
          testStatus = 'encerrada';
        }
        await setDoc(doc(db, 'rodadas', 'round-teste'), {
          nome: 'Rodada de Teste',
          abertura: testAbertura,
          fechamento: testFechamento,
          status: testStatus
        });

        // Loop to create 50 official rounds starting June 10, 2026 at 15:00 UTC
        const baseStartMs = Date.UTC(2026, 5, 10, 15, 0, 0); // June 10 at 12:00 BRT
        const officialRoundPromises = [];
        const keepRoundIds = new Set(['round-teste']);

        for (let i = 1; i <= 50; i++) {
          const roundId = `round-oficial-${i}`;
          keepRoundIds.add(roundId);

          const startMs = baseStartMs + (i - 1) * 24 * 60 * 60 * 1000;
          const endMs = baseStartMs + i * 24 * 60 * 60 * 1000;
          const startISO = new Date(startMs).toISOString();
          const endISO = new Date(endMs).toISOString();

          let targetStatus = existingRoundsMap.get(roundId) || 'aberta';
          // If the round has already finished in time, make sure it is 'encerrada'
          if (endMs <= now.getTime()) {
            targetStatus = 'encerrada';
          }

          officialRoundPromises.push(
            setDoc(doc(db, 'rodadas', roundId), {
              nome: `Rodada ${i}`,
              abertura: startISO,
              fechamento: endISO,
              status: targetStatus
            })
          );
        }
        await Promise.all(officialRoundPromises);

        // Close any other miscellaneous rounds to prevent interference
        for (const roundDoc of allRoundsSnapInitial.docs) {
          if (!keepRoundIds.has(roundDoc.id)) {
            const data = roundDoc.data();
            if (data.status === 'aberta') {
              await updateDoc(doc(db, 'rodadas', roundDoc.id), { status: 'encerrada' });
            }
          }
        }

        console.log("Guaranteed rounds initialized successfully!");
      } catch (err) {
        console.error("Error during checkAndSeed", err);
      } finally {
        setSeedingActive(false);
      }
    }
    checkAndSeed();
  }, []);

  // 2. Background Round Closing Scheduler
  // This satisfies: "Ao atingir o horário de fechamento, executar automaticamente: Encerrar rodada atual..."
  useEffect(() => {
    async function monitorRoundSchedules() {
      try {
        const nowStr = new Date().toISOString();
        const snap = await getDocs(collection(db, 'rodadas'));
        
        let rounds: any[] = [];
        snap.forEach(doc => {
          rounds.push({ id: doc.id, ...doc.data() });
        });

        // Find active open rounds that have passed their fechamento deadline
        const lateRounds = rounds.filter(r => r.status === 'aberta' && r.fechamento <= nowStr);

        for (const r of lateRounds) {
          console.log(`Scheduler detected late round closure for ${r.nome}. Auto-closing round...`);
          
          // 1. Set status to "encerrada" in Firestore
          await updateDoc(doc(db, 'rodadas', r.id), {
            status: 'encerrada'
          });

          setSchedulerLog(`Rodada "${r.nome}" foi encerrada automaticamente pelo atingimento do horário de fechamento.`);
          
          // 2. Find if there is any other round slated to be active next (e.g. "round-2")
          // and auto-open it if closed
          const nextRound = rounds.find(item => item.id !== r.id && item.status === 'aberta');
          if (!nextRound) {
            // Find a round that starts after this one and open it
            const closedRoundsNotEnded = rounds.filter(item => item.id !== r.id && item.status !== 'encerrada');
            if (closedRoundsNotEnded.length > 0) {
              // Sort by date closure
              closedRoundsNotEnded.sort((a,b) => new Date(a.fechamento).getTime() - new Date(b.fechamento).getTime());
              const toOpen = closedRoundsNotEnded[0];
              await updateDoc(doc(db, 'rodadas', toOpen.id), {
                status: 'aberta'
              });
              setSchedulerLog(prev => `${prev} Rodada "${toOpen.nome}" foi aberta automaticamente.`);
            }
          }
        }
      } catch (err) {
        console.error("Error running scheduler monitor", err);
      }
    }

    // Run immediately
    monitorRoundSchedules();

    // Run every 10 seconds asynchronously
    const timerId = setInterval(monitorRoundSchedules, 10000);
    return () => clearInterval(timerId);
  }, []);

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
                <span className="font-display font-black tracking-tight text-green-800 uppercase block leading-tight text-lg">
                  Copa dos Palpites
                </span>
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block font-bold">
                  Competição Secreta
                </span>
              </div>
            </div>

            {/* Navigation buttons */}
            <nav className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('palpites')}
                className={`px-4 py-1.5 sm:px-6 sm:py-2 rounded-md font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'palpites'
                    ? 'bg-white text-green-700 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                PALPITES
              </button>
              <button
                onClick={() => setActiveTab('classificacao')}
                className={`px-4 py-1.5 sm:px-6 sm:py-2 rounded-md font-bold text-xs transition-all cursor-pointer ${
                  activeTab === 'classificacao'
                    ? 'bg-white text-green-700 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                CLASSIFICAÇÃO
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-1.5 sm:px-6 sm:py-2 rounded-md font-bold text-xs transition-all cursor-pointer ${
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
            Inicializando conexão segura com o Firestore do applet...
          </div>
        ) : (
          <div className="transition-all duration-300">
            {activeTab === 'palpites' && <PalpitesPage />}
            {activeTab === 'classificacao' && <LeaderboardPage />}
            {activeTab === 'admin' && <AdminPage />}
          </div>
        )}
      </main>

      {/* Simple Footer */}
      <footer className="bg-white border-t border-neutral-200 px-8 py-4 flex flex-col sm:flex-row justify-between items-center text-[11px] text-neutral-400 font-bold tracking-wide uppercase mt-auto">
        <p>&copy; 2026 COPA DOS PALPITES • SISTEMA DE COMPETIÇÃO INTEGRADO</p>
        <div className="flex gap-4 items-center mt-2 sm:mt-0 font-bold">
          <span>AMBENTE REAL-TIME SEGURO</span>
        </div>
      </footer>
    </div>
  );
}
