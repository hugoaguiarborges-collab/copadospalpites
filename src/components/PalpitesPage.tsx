import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where,
  writeBatch,
  doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Participante, Rodada, Palpite } from '../types';
import { TEAMS_LIST } from '../constants/teams';
import { 
  CheckCircle, 
  AlertCircle, 
  Star, 
  Minus, 
  Plus, 
  Users, 
  RotateCcw, 
  ChevronRight,
  ChevronLeft,
  Info,
  Trophy,
  Shield,
  Sparkles,
  Check,
  LayoutGrid,
  ListFilter,
  Lock
} from 'lucide-react';
import { getRoundNumber, getFriendlyClosingLabel, getNextWednesday13h } from '../utils/dateUtils';
import { restoreOfficialGuesses } from '../utils/backupGuesses';
import { UclStarball, UclBadge } from './UclAssets';
import RoundInfoDrawer from './RoundInfoDrawer';

export interface SingleGameGuess {
  id: number; // 1 to 5
  tipo: 'vitoria' | 'empate';
  vencedor: string; // chosen team for vitoria
  clube1: string; // first team for empate
  clube2: string; // second team for empate
  golsVencedor: string; // e.g. "2"
  golsPerdedor: string; // e.g. "0"
  golsEmpate: string; // e.g. "1"
  capitao: string;
}

const STAR_CAPTAINS = [
  'Haaland',
  'Mbappé',
  'Vini Jr',
  'Saka',
  'Kane',
  'Lewandowski',
  'Salah',
  'Rodrygo'
];

const WIN_PRESETS = ['1x0', '2x0', '2x1', '3x0', '3x1', '3x2', '4x0', '4x1'];
const DRAW_PRESETS = ['0x0', '1x1', '2x2', '3x3'];

const DEFAULT_GAMES: SingleGameGuess[] = [
  { id: 1, tipo: 'vitoria', vencedor: '', clube1: '', clube2: '', golsVencedor: '2', golsPerdedor: '0', golsEmpate: '1', capitao: '' },
  { id: 2, tipo: 'vitoria', vencedor: '', clube1: '', clube2: '', golsVencedor: '2', golsPerdedor: '1', golsEmpate: '1', capitao: '' },
  { id: 3, tipo: 'vitoria', vencedor: '', clube1: '', clube2: '', golsVencedor: '1', golsPerdedor: '0', golsEmpate: '0', capitao: '' },
  { id: 4, tipo: 'vitoria', vencedor: '', clube1: '', clube2: '', golsVencedor: '3', golsPerdedor: '1', golsEmpate: '2', capitao: '' },
  { id: 5, tipo: 'vitoria', vencedor: '', clube1: '', clube2: '', golsVencedor: '2', golsPerdedor: '0', golsEmpate: '1', capitao: '' }
];

function sanitizeGames(rawList: any): SingleGameGuess[] {
  if (!Array.isArray(rawList)) return DEFAULT_GAMES;
  return [1, 2, 3, 4, 5].map((idx) => {
    const item = rawList.find((g: any) => g && g.id === idx) || rawList[idx - 1] || {};
    return {
      id: idx,
      tipo: item.tipo === 'empate' ? 'empate' : 'vitoria',
      vencedor: typeof item.vencedor === 'string' ? item.vencedor : '',
      clube1: typeof item.clube1 === 'string' ? item.clube1 : '',
      clube2: typeof item.clube2 === 'string' ? item.clube2 : '',
      golsVencedor: typeof item.golsVencedor === 'string' ? item.golsVencedor : '2',
      golsPerdedor: typeof item.golsPerdedor === 'string' ? item.golsPerdedor : '0',
      golsEmpate: typeof item.golsEmpate === 'string' ? item.golsEmpate : '1',
      capitao: typeof item.capitao === 'string' ? item.capitao : ''
    };
  });
}

// Standalone Countdown Component - avoids re-rendering the parent form!
function RoundCountdown({ fechamento }: { fechamento: string }) {
  const [timeLeft, setTimeLeft] = useState<{ d: number; h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    const calc = () => {
      const diff = new Date(fechamento).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft({
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        h: Math.floor((diff / (1000 * 60 * 60)) % 24),
        m: Math.floor((diff / 1000 / 60) % 60),
        s: Math.floor((diff / 1000) % 60),
      });
    };
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [fechamento]);

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-1 font-mono text-[11px] text-cyan-300 font-bold bg-[#071138] px-2 py-0.5 rounded-lg border border-cyan-500/30 shrink-0">
      <span className="text-cyan-400">⏱</span>
      <span>
        {timeLeft.d > 0 ? `${timeLeft.d}d ` : ''}
        {String(timeLeft.h).padStart(2, '0')}:
        {String(timeLeft.m).padStart(2, '0')}:
        {String(timeLeft.s).padStart(2, '0')}
      </span>
    </div>
  );
}

interface PalpitesPageProps {
  onSuggestName?: (name: string) => void;
}

export default function PalpitesPage({ onSuggestName }: PalpitesPageProps) {
  const DRAFT_STORAGE_KEY = 'ucl_palpites_draft_v7';

  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [activeRound, setActiveRound] = useState<Rodada | null>(null);
  const [closedRounds, setClosedRounds] = useState<Rodada[]>([]);
  const [allRoundGuesses, setAllRoundGuesses] = useState<Palpite[]>([]);

  // Lateral Drawer modal state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Active game tab: 1, 2, 3, 4, 5 (for ultra-compact, zero-scroll experience)
  const [activeGameId, setActiveGameId] = useState<number>(1);
  // View mode: 'tabs' (super compact 1-game-at-a-time) or 'all' (all 5 compact stacked)
  const [viewMode, setViewMode] = useState<'tabs' | 'all'>('tabs');

  // Form states with silent localStorage draft restore
  const [nome, setNome] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('ucl_palpites_draft_v7');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.nome === 'string') return parsed.nome;
      }
    } catch {}
    return '';
  });

  const [confirmacaoNome, setConfirmacaoNome] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('ucl_palpites_draft_v7');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.confirmacaoNome === 'string') return parsed.confirmacaoNome;
      }
    } catch {}
    return '';
  });

  const [showSuggestions, setShowSuggestions] = useState(false);

  // The 5 match guesses
  const [games, setGames] = useState<SingleGameGuess[]>(() => {
    try {
      const saved = localStorage.getItem('ucl_palpites_draft_v7');
      if (saved) {
        const parsed = JSON.parse(saved);
        return sanitizeGames(parsed.games);
      }
    } catch {}
    return DEFAULT_GAMES;
  });

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionCount, setSubmissionCount] = useState<number>(0);

  // Load initial tournament data ONCE on mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [pSnap, rSnap] = await Promise.all([
          getDocs(collection(db, 'participantes')),
          getDocs(collection(db, 'rodadas'))
        ]);

        const pList: Participante[] = [];
        pSnap.forEach(d => pList.push({ id: d.id, ...d.data() } as Participante));
        pList.sort((a, b) => a.nome.localeCompare(b.nome));
        setParticipantes(pList);

        const rList: Rodada[] = [];
        rSnap.forEach(d => rList.push({ id: d.id, ...d.data() } as Rodada));
        rList.sort((a, b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
        setRounds(rList);

        const now = new Date();
        const testRoundOpen = rList.find(r => (r.is_test || r.id === 'rodada-teste') && r.status === 'aberta');
        let standardOpen = rList.find(r => r.status === 'aberta' && now < new Date(r.fechamento));
        
        // Se hoje for quarta-feira e houver rodada aberta de quarta-feira:
        if (!standardOpen && now.getDay() === 3) {
          standardOpen = rList.find(r => r.status === 'aberta' && !r.is_test);
        }

        const open = testRoundOpen || standardOpen || null;
        // Se o mercado estiver fechado, manter a rodada existente para visualização, sigilo/revelação e contagem
        const currentRound = open || rList.find(r => r.id === 'round-1') || rList[0] || null;

        if (currentRound && !currentRound.is_test && now.getDay() === 3 && currentRound.status === 'aberta') {
          const wed13h = getNextWednesday13h(now);
          if (new Date(currentRound.fechamento).getTime() > wed13h.getTime() + 24 * 60 * 60 * 1000) {
            currentRound.fechamento = wed13h.toISOString();
          }
        }
        setActiveRound(currentRound);

        const closed = rList.filter(r => r.status === 'encerrada' || (now >= new Date(r.fechamento) && !r.is_test));
        closed.sort((a, b) => getRoundNumber(b.nome || b.id) - getRoundNumber(a.nome || a.id));
        setClosedRounds(closed);

        if (currentRound) {
          const roundIds = [currentRound.id];
          if (currentRound.id === 'round-1') roundIds.push('round-1-quarta');
          if (currentRound.id === 'round-1-quarta') roundIds.push('round-1');

          const gSnap = await getDocs(query(collection(db, 'palpites'), where('rodada', 'in', roundIds)));
          let gList: Palpite[] = [];
          gSnap.forEach(d => gList.push({ id: d.id, ...d.data() } as Palpite));

          // Auto-healing: Se palpites da rodada 1 estiverem vazios no cliente, recuperar automaticamente do backup
          if (gList.length === 0 && (currentRound.id === 'round-1' || currentRound.id === 'round-1-quarta')) {
            await restoreOfficialGuesses(currentRound.id);
            const refetchSnap = await getDocs(query(collection(db, 'palpites'), where('rodada', 'in', roundIds)));
            gList = [];
            refetchSnap.forEach(d => gList.push({ id: d.id, ...d.data() } as Palpite));
          }

          setAllRoundGuesses(gList);
        }
      } catch (err) {
        console.error("Error loading initial data in PalpitesPage:", err);
      }
    }

    loadInitialData();
  }, []);

  // Silent draft persistence to localStorage
  useEffect(() => {
    try {
      const hasContent = Boolean(
        nome.trim() || 
        confirmacaoNome.trim() || 
        games.some(g => g.vencedor || g.clube1 || (g.capitao || '').trim())
      );
      if (hasContent) {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
          nome,
          confirmacaoNome,
          games
        }));
      }
    } catch {}
  }, [nome, confirmacaoNome, games]);

  // Name suggestions filter
  const suggestions = participantes.filter(p => 
    p.nome.toLowerCase().includes(nome.toLowerCase()) && 
    p.nome.toLowerCase() !== nome.toLowerCase()
  );

  const handleSelectSuggestion = (pNome: string) => {
    setNome(pNome);
    setConfirmacaoNome('');
    setShowSuggestions(false);
    if (onSuggestName) onSuggestName(pNome);

    if (activeRound) {
      const pFound = participantes.find(p => p.nome.toLowerCase() === pNome.toLowerCase());
      if (pFound) {
        const userGuesses = allRoundGuesses.filter(g => g.participante.toLowerCase() === pNome.toLowerCase());
        const countFromGuesses = userGuesses.length > 0 ? (userGuesses[0].envio_numero || 1) : 0;
        const storageKey = `palpites_count_${pFound.id}_${activeRound.id}`;
        const saved = localStorage.getItem(storageKey);
        setSubmissionCount(saved ? parseInt(saved, 10) : countFromGuesses);
      }
    }
  };

  // Modify single game safely
  const updateGame = (gameId: number, patch: Partial<SingleGameGuess>) => {
    setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...patch } : g));
  };

  const handleToggleTipo = (gameId: number, newTipo: 'vitoria' | 'empate') => {
    updateGame(gameId, { tipo: newTipo });
  };

  const handleSelectWinner = (gameId: number, team: string) => {
    updateGame(gameId, { vencedor: team });
  };

  const handleApplyWinPreset = (gameId: number, preset: string) => {
    const [w, l] = preset.split('x');
    updateGame(gameId, { golsVencedor: w, golsPerdedor: l });
  };

  const handleApplyDrawPreset = (gameId: number, preset: string) => {
    const [g] = preset.split('x');
    updateGame(gameId, { golsEmpate: g });
  };

  const handleStepScore = (gameId: number, field: 'golsVencedor' | 'golsPerdedor' | 'golsEmpate', delta: number) => {
    setGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      const cur = g[field] === '' ? 0 : parseInt(g[field], 10);
      const next = Math.max(0, isNaN(cur) ? 0 : cur + delta);
      return { ...g, [field]: String(next) };
    }));
  };

  const handleSetCaptain = (gameId: number, capName: string) => {
    updateGame(gameId, { capitao: capName });
  };

  const handleClearGame = (gameId: number) => {
    setGames(prev => prev.map(g => g.id === gameId ? {
      ...g,
      vencedor: '',
      clube1: '',
      clube2: '',
      golsVencedor: '2',
      golsPerdedor: '0',
      golsEmpate: '1',
      capitao: ''
    } : g));
  };

  // Check if a single game is complete
  const isGameComplete = (g: SingleGameGuess): boolean => {
    const cap = (g.capitao || '').trim();
    if (g.tipo === 'vitoria') {
      const gW = parseInt(g.golsVencedor, 10);
      const gL = parseInt(g.golsPerdedor, 10);
      return Boolean(g.vencedor && !isNaN(gW) && !isNaN(gL) && gW > gL && cap);
    } else {
      const gE = parseInt(g.golsEmpate, 10);
      return Boolean(g.clube1 && g.clube2 && g.clube1 !== g.clube2 && !isNaN(gE) && cap);
    }
  };

  // Get concise summary string of a game
  const getGameSummary = (g: SingleGameGuess): string => {
    if (g.tipo === 'vitoria') {
      if (!g.vencedor) return 'Pendente';
      return `${g.vencedor} ${g.golsVencedor}x${g.golsPerdedor}`;
    } else {
      if (!g.clube1 || !g.clube2) return 'Pendente';
      return `${g.clube1} ${g.golsEmpate}x${g.golsEmpate} ${g.clube2}`;
    }
  };

  const completedGamesCount = games.filter(isGameComplete).length;

  // Final submission of all 5 guesses
  const handleFormSubmit = async () => {
    setStatusMsg(null);

    if (!nome.trim()) {
      setStatusMsg({ type: 'error', text: 'Por favor, insira ou selecione seu nome de participante.' });
      return;
    }

    if (!confirmacaoNome.trim()) {
      setStatusMsg({ type: 'error', text: 'Por favor, confirme seu nome no segundo campo por segurança.' });
      return;
    }

    if (nome.trim().toLowerCase() !== confirmacaoNome.trim().toLowerCase()) {
      setStatusMsg({ type: 'error', text: 'O nome e a confirmação não coincidem. Digite o mesmo nome em ambos os campos.' });
      return;
    }

    if (!activeRound) {
      setStatusMsg({ type: 'error', text: 'Mercado encerrado. Aguarde a próxima rodada oficial da Champions.' });
      return;
    }

    const nowISO = new Date().toISOString();
    if (nowISO >= activeRound.fechamento || activeRound.status === 'encerrada') {
      setStatusMsg({ type: 'error', text: 'Mercado encerrado. O fechamento oficial já ocorreu.' });
      return;
    }

    const foundParticipant = participantes.find(p => p.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    if (!foundParticipant) {
      setStatusMsg({
        type: 'error',
        text: `O participante "${nome}" não foi encontrado no cadastro. Selecione seu nome oficial na lista.`
      });
      return;
    }

    // Check submission count limit (max 2)
    const storageKey = `palpites_count_${foundParticipant.id}_${activeRound.id}`;
    const localSavedCount = localStorage.getItem(storageKey);
    let submissionNum = localSavedCount ? parseInt(localSavedCount, 10) + 1 : 1;

    if (submissionNum > 2) {
      setStatusMsg({
        type: 'error',
        text: 'Você já atingiu o limite máximo de 2 envios permitidos para esta rodada.'
      });
      return;
    }

    // Validate that all 5 games are filled
    for (const g of games) {
      const cap = (g.capitao || '').trim();
      if (g.tipo === 'vitoria') {
        if (!g.vencedor) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id}: Escolha o clube vencedor na lista dos 36 clubes.` });
          return;
        }
        const wScore = parseInt(g.golsVencedor, 10);
        const lScore = parseInt(g.golsPerdedor, 10);
        if (isNaN(wScore) || isNaN(lScore) || wScore <= lScore) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id}: Em vitória, os gols do vencedor devem ser maiores que os gols do adversário (ex: 2x0, 2x1).` });
          return;
        }
        if (!cap) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id}: Digite ou clique em um capitão da partida.` });
          return;
        }
      } else {
        if (!g.clube1) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id} (Empate): Selecione o 1º clube da partida.` });
          return;
        }
        if (!g.clube2) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id} (Empate): Selecione o 2º clube (adversário) da partida.` });
          return;
        }
        if (g.clube1 === g.clube2) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id} (Empate): Os dois clubes do empate devem ser diferentes.` });
          return;
        }
        const eScore = parseInt(g.golsEmpate, 10);
        if (isNaN(eScore) || eScore < 0) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id} (Empate): Defina o placar do empate (ex: 1x1, 0x0).` });
          return;
        }
        if (!cap) {
          setActiveGameId(g.id);
          setStatusMsg({ type: 'error', text: `Jogo ${g.id}: Digite ou clique em um capitão da partida.` });
          return;
        }
      }
    }

    // Check duplicate teams among win predictions
    const chosenWinners = games.filter(g => g.tipo === 'vitoria').map(g => g.vencedor);
    const uniqueWinners = new Set(chosenWinners);
    if (chosenWinners.length !== uniqueWinners.size) {
      setStatusMsg({
        type: 'error',
        text: 'Você selecionou o mesmo clube vencedor em mais de um jogo. Escolha clubes diferentes para cada vitória.'
      });
      return;
    }

    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      if (submissionNum === 2) {
        const qPrev = query(
          collection(db, 'palpites'),
          where('participante', '==', foundParticipant.nome),
          where('rodada', '==', activeRound.id)
        );
        const prevSnap = await getDocs(qPrev);
        prevSnap.forEach(d => {
          batch.update(d.ref, { substituido_por_segundo_envio: true });
        });
      }

      for (const g of games) {
        const palpiteRef = doc(collection(db, 'palpites'));
        const cap = (g.capitao || '').trim();
        
        if (g.tipo === 'vitoria') {
          const wGoals = parseInt(g.golsVencedor, 10);
          const lGoals = parseInt(g.golsPerdedor, 10);
          
          batch.set(palpiteRef, {
            participante: foundParticipant.nome,
            rodada: activeRound.id,
            tipo_palpite: 'vitoria',
            vencedor: g.vencedor,
            time_mandante: g.vencedor,
            time_visitante: '',
            gols_mandante: wGoals,
            gols_visitante: lGoals,
            gols_vencedor: wGoals,
            gols_perdedor: lGoals,
            palpite: `${g.vencedor} ${wGoals}x${lGoals}`,
            capitao: cap,
            data_hora_envio: now,
            envio_numero: submissionNum
          });
        } else {
          const eGoals = parseInt(g.golsEmpate, 10);
          
          batch.set(palpiteRef, {
            participante: foundParticipant.nome,
            rodada: activeRound.id,
            tipo_palpite: 'empate',
            vencedor: '',
            time_mandante: g.clube1,
            time_visitante: g.clube2,
            gols_mandante: eGoals,
            gols_visitante: eGoals,
            palpite: `${g.clube1} ${eGoals} x ${eGoals} ${g.clube2}`,
            capitao: cap,
            data_hora_envio: now,
            envio_numero: submissionNum
          });
        }
      }

      await batch.commit();

      localStorage.setItem(storageKey, String(submissionNum));
      setSubmissionCount(submissionNum);

      try {
        const gSnap = await getDocs(query(collection(db, 'palpites'), where('rodada', '==', activeRound.id)));
        const gList: Palpite[] = [];
        gSnap.forEach(d => gList.push({ id: d.id, ...d.data() } as Palpite));
        setAllRoundGuesses(gList);
      } catch {}

      localStorage.removeItem(DRAFT_STORAGE_KEY);

      setStatusMsg({
        type: 'success',
        text: `Parabéns! Seus 5 palpites foram gravados com sucesso! ${submissionNum === 2 ? 'Este é seu 2º envio oficial (substituirá o 1º na apuração).' : 'Este é seu 1º envio oficial da rodada.'}`
      });
    } catch (err: any) {
      console.error("Submission error in PalpitesPage:", err);
      setStatusMsg({ type: 'error', text: `Erro ao enviar palpites: ${err?.message || err}` });
    } finally {
      setSubmitting(false);
    }
  };

  const submittedCountForActiveRound = new Set(allRoundGuesses.map(g => g.participante)).size;
  const currentGame = games.find(g => g.id === activeGameId) || games[0];

  // Helper render for a single game card
  const renderGameContent = (g: SingleGameGuess) => {
    const isWin = g.tipo === 'vitoria';
    const complete = isGameComplete(g);

    return (
      <div className="space-y-2.5">
        {/* Top: Mode Switcher */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-[#030617] p-0.5 rounded-lg border border-cyan-900/60 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleToggleTipo(g.id, 'vitoria')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                isWin 
                  ? 'bg-cyan-500 text-white font-black shadow-xs' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3 h-3" />
              <span>Vitória de um Clube</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleTipo(g.id, 'empate')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                !isWin 
                  ? 'bg-indigo-600 text-white font-black shadow-xs' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🤝 Empate</span>
            </button>
          </div>

          {(g.vencedor || g.clube1 || g.capitao) && (
            <button
              type="button"
              onClick={() => handleClearGame(g.id)}
              className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-1 font-mono"
              title="Limpar este jogo"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar</span>
            </button>
          )}
        </div>

        {/* SECTION: SE VITÓRIA */}
        {isWin ? (
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-cyan-200 mb-0.5 font-mono">
                Clube Vencedor (escolha entre os 36 clubes) *
              </label>
              <select
                value={g.vencedor}
                onChange={(e) => handleSelectWinner(g.id, e.target.value)}
                className="w-full bg-[#030617] border border-cyan-700/60 text-white font-bold text-sm sm:text-xs rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 transition-colors"
              >
                <option value="">-- Selecione o clube vencedor --</option>
                {TEAMS_LIST.map((team) => (
                  <option key={team} value={team}>
                    🏆 {team}
                  </option>
                ))}
              </select>
            </div>

            {/* Placar da Vitória Compacto */}
            <div className="p-2 rounded-lg bg-[#03071d] border border-cyan-900/60 space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-[10px] font-bold text-slate-300 font-mono">
                  Placar da Vitória:
                </span>
                {g.vencedor && (
                  <span className="text-[10px] font-black font-mono text-cyan-300 bg-cyan-950/90 px-1.5 py-0.5 rounded border border-cyan-500/30">
                    {g.vencedor} {g.golsVencedor} x {g.golsPerdedor}
                  </span>
                )}
              </div>

              {/* Quick score presets */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] text-slate-400 font-mono">Atalhos:</span>
                {WIN_PRESETS.map((p) => {
                  const [w, l] = p.split('x');
                  const isSelected = g.golsVencedor === w && g.golsPerdedor === l;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleApplyWinPreset(g.id, p)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-cyan-500 text-white border-cyan-300 font-black'
                          : 'bg-[#060e2b] text-cyan-200 border-cyan-800/60 hover:bg-cyan-900/60'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                {/* Micro Stepper */}
                <div className="flex items-center gap-2 ml-auto text-[10px] font-mono text-slate-300">
                  <div className="flex items-center bg-[#071138] rounded border border-cyan-800/60 px-1">
                    <span className="text-slate-400 mr-1 text-[9px]">Venc:</span>
                    <button
                      type="button"
                      onClick={() => handleStepScore(g.id, 'golsVencedor', -1)}
                      className="w-4 h-4 text-slate-300 hover:text-white cursor-pointer font-black"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-bold text-white text-xs">{g.golsVencedor}</span>
                    <button
                      type="button"
                      onClick={() => handleStepScore(g.id, 'golsVencedor', 1)}
                      className="w-4 h-4 text-slate-300 hover:text-white cursor-pointer font-black"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center bg-[#071138] rounded border border-cyan-800/60 px-1">
                    <span className="text-slate-400 mr-1 text-[9px]">Adv:</span>
                    <button
                      type="button"
                      onClick={() => handleStepScore(g.id, 'golsPerdedor', -1)}
                      className="w-4 h-4 text-slate-300 hover:text-white cursor-pointer font-black"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-bold text-white text-xs">{g.golsPerdedor}</span>
                    <button
                      type="button"
                      onClick={() => handleStepScore(g.id, 'golsPerdedor', 1)}
                      className="w-4 h-4 text-slate-300 hover:text-white cursor-pointer font-black"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* SECTION: SE EMPATE */
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-cyan-200 mb-0.5 font-mono">
                  1º Clube *
                </label>
                <select
                  value={g.clube1}
                  onChange={(e) => updateGame(g.id, { clube1: e.target.value })}
                  className="w-full bg-[#030617] border border-cyan-700/60 text-white font-bold text-sm sm:text-xs rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 transition-colors"
                >
                  <option value="">-- 1º clube --</option>
                  {TEAMS_LIST.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-cyan-200 mb-0.5 font-mono">
                  2º Clube (Adversário) *
                </label>
                <select
                  value={g.clube2}
                  onChange={(e) => updateGame(g.id, { clube2: e.target.value })}
                  className="w-full bg-[#030617] border border-cyan-700/60 text-white font-bold text-sm sm:text-xs rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 transition-colors"
                >
                  <option value="">-- 2º clube adversário --</option>
                  {TEAMS_LIST.filter(t => t !== g.clube1).map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Placar Empate */}
            <div className="p-2 rounded-lg bg-[#03071d] border border-cyan-900/60 space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-[10px] font-bold text-slate-300 font-mono">
                  Placar do Empate:
                </span>
                {g.clube1 && g.clube2 && (
                  <span className="text-[10px] font-black font-mono text-cyan-300 bg-cyan-950/90 px-1.5 py-0.5 rounded border border-cyan-500/30">
                    {g.clube1} {g.golsEmpate} x {g.golsEmpate} {g.clube2}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] text-slate-400 font-mono">Atalhos:</span>
                {DRAW_PRESETS.map((p) => {
                  const [e] = p.split('x');
                  const isSelected = g.golsEmpate === e;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleApplyDrawPreset(g.id, p)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-400 font-black'
                          : 'bg-[#060e2b] text-cyan-200 border-cyan-800/60 hover:bg-cyan-900/60'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                <div className="flex items-center bg-[#071138] rounded border border-cyan-800/60 px-1 ml-auto">
                  <span className="text-slate-400 mr-1 text-[9px] font-mono">Gols:</span>
                  <button
                    type="button"
                    onClick={() => handleStepScore(g.id, 'golsEmpate', -1)}
                    className="w-4 h-4 text-slate-300 hover:text-white cursor-pointer font-black"
                  >
                    -
                  </button>
                  <span className="w-4 text-center font-bold text-white text-xs font-mono">{g.golsEmpate}</span>
                  <button
                    type="button"
                    onClick={() => handleStepScore(g.id, 'golsEmpate', 1)}
                    className="w-4 h-4 text-slate-300 hover:text-white cursor-pointer font-black"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CAPITÃO DA PARTIDA - Bulletproof: 16px font on mobile prevents iOS zoom jump, zero-crash string handling */}
        <div className="pt-2 border-t border-cyan-950/80 space-y-1">
          <div className="flex items-center justify-between">
            <label 
              htmlFor={`capitao-input-${g.id}`}
              className="text-[10px] font-black uppercase tracking-wider text-amber-300 font-mono flex items-center gap-1"
            >
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              Capitão do Jogo (1 pt por gol) *
            </label>
            {(g.capitao || '').trim() && (
              <span className="text-[10px] text-amber-300 font-mono font-bold">
                ★ {g.capitao}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`capitao-input-${g.id}`}
              type="text"
              placeholder="Digite o nome do capitão..."
              value={g.capitao || ''}
              onChange={(e) => handleSetCaptain(g.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-[#030617] border border-cyan-800/60 rounded-lg px-2.5 py-1.5 text-base sm:text-xs text-white font-bold placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-amber-400 transition-colors"
            />
          </div>

          {/* Quick captain suggestion chips */}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <span className="text-[9px] text-slate-400 font-mono">Sugestões:</span>
            {STAR_CAPTAINS.map((cap) => {
              const isCapSelected = (g.capitao || '').toLowerCase().trim() === cap.toLowerCase();
              return (
                <button
                  key={cap}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetCaptain(g.id, cap);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition-colors cursor-pointer border ${
                    isCapSelected
                      ? 'bg-amber-500 text-slate-950 font-black border-amber-300'
                      : 'bg-[#060e2b] text-slate-300 hover:text-white border-cyan-900/60 hover:bg-cyan-900/40'
                  }`}
                >
                  {cap}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-3 pb-10 relative overflow-x-hidden">
      {/* Lateral Drawer Component */}
      <RoundInfoDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        activeRound={activeRound}
        participantes={participantes}
        palpites={allRoundGuesses}
        closedRounds={closedRounds}
        allRounds={rounds}
      />

      {/* Floating Lateral Tab Trigger Button (Desktop only - mobile uses Header button) */}
      <button
        type="button"
        onClick={() => setIsDrawerOpen(true)}
        className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-[#071138]/95 hover:bg-[#0c1c5a] border-l-2 border-y border-cyan-400/60 text-white rounded-l-2xl shadow-2xl shadow-cyan-950/80 px-2 py-3 flex-col items-center gap-1 cursor-pointer transition-all hover:translate-x-[-2px] group"
        title="Abrir painel lateral com quem palpitou, palpites revelados e pontuações"
      >
        <Users className="w-3.5 h-3.5 text-cyan-300 group-hover:scale-110 transition-transform" />
        <span className="text-[9px] font-black font-mono uppercase tracking-widest [writing-mode:vertical-rl] text-cyan-200">
          PAINEL DA RODADA
        </span>
        <span className="text-[8px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/40 rounded-full px-1 py-0.2 mt-0.5">
          {submittedCountForActiveRound}/{participantes.length}
        </span>
      </button>

      {/* Header Bar - Super Compact */}
      <div className="bg-[#080f33]/90 rounded-xl border border-cyan-500/25 p-2.5 sm:p-3 shadow-lg backdrop-blur-md flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <UclStarball className="w-5 h-5 text-cyan-400 shrink-0" glow />
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-black font-display text-white tracking-tight">
                {activeRound?.nome || 'Rodada Oficial'}
              </span>
              {activeRound?.status === 'aberta' ? (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono">
                  ● Aberto
                </span>
              ) : (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-rose-950/80 text-rose-300 border border-rose-500/40 font-mono">
                  ● Fechado
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {activeRound && activeRound.status === 'aberta' && (
            <div className="flex items-center gap-1.5 bg-[#050e2e] px-2 py-0.5 rounded-lg border border-cyan-500/30">
              <span className="hidden sm:inline text-[10px] font-mono text-cyan-300 font-bold">
                {getFriendlyClosingLabel(activeRound.fechamento)}:
              </span>
              <RoundCountdown fechamento={activeRound.fechamento} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="px-2.5 py-1 bg-[#0a164a] hover:bg-[#0e206b] border border-cyan-400/40 rounded-lg text-[11px] font-bold text-white flex items-center gap-1 transition-all cursor-pointer"
            title="Abrir painel lateral"
          >
            <Users className="w-3 h-3 text-cyan-300" />
            <span className="hidden sm:inline">Painel</span> ({submittedCountForActiveRound}/{participantes.length})
          </button>
        </div>
      </div>

      {/* Closed Market Notice */}
      {(!activeRound || activeRound.status !== 'aberta') && (
        <div className="bg-[#080f33]/90 rounded-xl border border-rose-500/40 p-3 shadow-lg flex items-center gap-2.5 text-xs text-rose-200">
          <Lock className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            <strong>Mercado Fechado:</strong> O mercado fecha às terças e quartas às 13:00 e abre automaticamente assim que o Administrador atualizar os resultados oficiais da rodada! (Nas semanas sem jogos, reabre na quinta-feira à meia-noite).
          </span>
        </div>
      )}

      {/* Participant Identification Section - Compact Horizontal */}
      <div className="bg-[#080f33]/90 rounded-xl border border-cyan-500/25 p-2.5 sm:p-3 shadow-lg backdrop-blur-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <label htmlFor="input-nome-participante" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-0.5 font-mono">
              1. Seu Nome *
            </label>
            <input
              id="input-nome-participante"
              type="text"
              placeholder="Digite seu nome cadastrado..."
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              autoComplete="off"
              spellCheck={false}
              className="w-full border border-cyan-800/60 px-2.5 py-1.5 rounded-lg text-base sm:text-xs bg-[#04081c] focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-bold text-white placeholder:text-slate-500 transition-colors"
            />

            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-30 left-0 right-0 mt-1 bg-[#060c28] border border-cyan-500/40 rounded-xl shadow-2xl max-h-40 overflow-y-auto divide-y divide-cyan-950 text-xs">
                {suggestions.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => handleSelectSuggestion(p.nome)}
                    className="p-1.5 hover:bg-cyan-950/60 cursor-pointer flex justify-between items-center transition-colors font-bold text-slate-200"
                  >
                    <span>{p.nome}</span>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 font-mono px-1.5 py-0.2 rounded-full border border-cyan-700/60 font-bold">
                      {p.pontos} Pts
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="input-confirmacao-nome" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mb-0.5 font-mono flex items-center justify-between">
              <span>2. Confirmar Nome *</span>
              <span className="text-[9px] text-amber-400 font-bold">(segurança)</span>
            </label>
            <input
              id="input-confirmacao-nome"
              type="text"
              placeholder="Digite o mesmo nome..."
              value={confirmacaoNome}
              onChange={(e) => setConfirmacaoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              autoComplete="off"
              spellCheck={false}
              className="w-full border border-cyan-800/60 px-2.5 py-1.5 rounded-lg text-base sm:text-xs bg-[#04081c] focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-bold text-white placeholder:text-slate-500 transition-colors"
            />
          </div>
        </div>

        {submissionCount > 0 && (
          <div className="mt-2 p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-[10px] text-cyan-200 flex items-center gap-1.5 font-mono">
            <Info className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>
              {submissionCount === 1 
                ? 'Você já possui 1 envio registrado. Este será seu 2º e último envio.' 
                : 'Limite de 2 envios atingido para esta rodada.'}
            </span>
          </div>
        )}
      </div>

      {/* GAME SELECTOR TABS BAR - Eliminates scrolling! Fast 1-tap game switching */}
      <div className="bg-[#080f33]/90 rounded-xl border border-cyan-500/25 p-2 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between gap-1 mb-1.5 px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black uppercase text-white font-mono flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              5 Jogos da Rodada
            </span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] font-black font-mono border ${
              completedGamesCount === 5 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' 
                : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
            }`}>
              {completedGamesCount}/5 prontos
            </span>
          </div>

          {/* Toggle between single-game tab mode (no scrolling) and expanded all view */}
          <div className="flex items-center gap-0.5 bg-[#030617] p-0.5 rounded border border-cyan-900/60">
            <button
              type="button"
              onClick={() => setViewMode('tabs')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer flex items-center gap-0.5 ${
                viewMode === 'tabs' ? 'bg-cyan-500 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
              title="Modo Focado (Sem rolar a tela)"
            >
              <ListFilter className="w-2.5 h-2.5" />
              <span>Focado</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer flex items-center gap-0.5 ${
                viewMode === 'all' ? 'bg-cyan-500 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
              title="Ver Todos os 5 Jogos juntos"
            >
              <LayoutGrid className="w-2.5 h-2.5" />
              <span>Todos</span>
            </button>
          </div>
        </div>

        {/* 5 Segmented Buttons */}
        <div className="grid grid-cols-5 gap-1">
          {games.map((g) => {
            const complete = isGameComplete(g);
            const isSelected = activeGameId === g.id && viewMode === 'tabs';

            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setActiveGameId(g.id);
                  if (viewMode === 'all') setViewMode('tabs');
                }}
                className={`py-1 px-1 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-cyan-500 text-white border-cyan-300 shadow-md font-black'
                    : complete
                      ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/40'
                      : 'bg-[#04081c] text-slate-300 border-cyan-900/50 hover:bg-cyan-950'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-black font-mono">J{g.id}</span>
                  {complete ? (
                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  )}
                </div>
                <span className="text-[8px] font-mono truncate max-w-full block text-slate-400">
                  {complete ? getGameSummary(g) : 'Vazio'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* GAME CONTENT: Either FOCUSED (1 game, ZERO scroll) or ALL (all 5) */}
      {viewMode === 'tabs' ? (
        <div className="bg-[#080f33]/95 rounded-xl border border-cyan-400/50 p-3 sm:p-3.5 shadow-xl backdrop-blur-md">
          {/* Header of Active Game */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-cyan-950/80">
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-cyan-500 text-white font-mono text-xs font-black flex items-center justify-center">
                {currentGame.id}
              </span>
              <span className="text-xs sm:text-sm font-black text-white">
                Preencher Jogo {currentGame.id} de 5
              </span>
              {isGameComplete(currentGame) && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-950 text-emerald-300 font-mono border border-emerald-500/40 flex items-center gap-0.5">
                  <Check className="w-2.5 h-2.5" />
                  Pronto
                </span>
              )}
            </div>

            {/* Navigation arrows to jump between games without scrolling */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={activeGameId === 1}
                onClick={() => setActiveGameId(prev => Math.max(1, prev - 1))}
                className="p-1 rounded bg-[#030617] border border-cyan-900/60 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                title="Jogo anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={activeGameId === 5}
                onClick={() => setActiveGameId(prev => Math.min(5, prev + 1))}
                className="p-1 rounded bg-[#030617] border border-cyan-900/60 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                title="Próximo jogo"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Render Active Game Form */}
          {renderGameContent(currentGame)}

          {/* Quick next game action */}
          <div className="mt-3 pt-2 border-t border-cyan-950/80 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono">
              Status: {isGameComplete(currentGame) ? '✓ Pronto' : 'Preencha o clube, placar e capitão'}
            </span>
            {activeGameId < 5 ? (
              <button
                type="button"
                onClick={() => setActiveGameId(prev => Math.min(5, prev + 1))}
                className="px-2.5 py-1 bg-[#0a1b52] hover:bg-[#0e2777] border border-cyan-400/40 text-cyan-200 hover:text-white rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer flex items-center gap-1"
              >
                <span>Avançar para Jogo {activeGameId + 1}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            ) : (
              <span className="text-[10px] font-bold text-cyan-300 font-mono">
                Último jogo (Jogo 5)
              </span>
            )}
          </div>
        </div>
      ) : (
        /* ALL 5 GAMES EXPANDED VIEW */
        <div className="space-y-2.5">
          {games.map((g) => {
            const complete = isGameComplete(g);
            return (
              <div 
                key={g.id}
                className={`p-3 rounded-xl border transition-all ${
                  complete 
                    ? 'bg-[#081442]/95 border-cyan-400/50 shadow-md ring-1 ring-cyan-400/20' 
                    : 'bg-[#071138]/90 border-cyan-500/30'
                }`}
              >
                <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-cyan-950/80">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-black font-mono flex items-center justify-center">
                      {g.id}
                    </span>
                    <span className="text-xs font-black text-white">Jogo {g.id} de 5</span>
                    {complete && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-950 text-emerald-300 font-mono border border-emerald-500/40 flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        Pronto
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-cyan-300">
                    {complete ? getGameSummary(g) : ''}
                  </span>
                </div>
                {renderGameContent(g)}
              </div>
            );
          })}
        </div>
      )}

      {/* Status & Feedback Alerts */}
      {statusMsg && (
        <div className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2 shadow-xl transition-all ${
          statusMsg.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50'
            : 'bg-rose-950/90 text-rose-200 border-rose-500/50'
        }`}>
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span>{statusMsg.text}</span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleFormSubmit}
          disabled={submitting || (activeRound ? activeRound.status !== 'aberta' : false)}
          className={`w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer ${
            completedGamesCount === 5 && (!activeRound || activeRound.status === 'aberta')
              ? 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-950/80 hover:shadow-cyan-500/25'
              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750'
          }`}
        >
          {submitting ? (
            <span>GRAVANDO PALPITES OFICIAIS...</span>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 text-cyan-300" />
              <span>ENVIAR 5 PALPITES DA CHAMPIONS ({completedGamesCount}/5)</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
