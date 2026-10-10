import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Participante, Rodada, Palpite } from '../types';
import { TEAMS_LIST } from '../constants/teams';
import { 
  Sparkles, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  ShieldAlert, 
  Award, 
  User, 
  Star, 
  Clock, 
  FileText, 
  Check, 
  AlertTriangle, 
  Info,
  RotateCcw,
  Lock,
  Unlock,
  Users,
  Eye,
  Minus,
  Plus
} from 'lucide-react';
import { getNextTuesday13h, formatDateTimeDisplay, isMarketOpen, getRoundNumber } from '../utils/dateUtils';
import TabelaParticipacao from './TabelaParticipacao';
import HistoricoRodadas from './HistoricoRodadas';
import { UclStarball, UclTrophy } from './UclAssets';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  evento: string;
  status: 'SUCESSO' | 'ALERTA' | 'INFO';
  origem: string;
}

export interface MatchGuessLine {
  timeMandante: string;
  golsMandante: string;
  golsVisitante: string;
  timeVisitante: string;
  capitao: string;
}

const SCORE_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

const COMMON_SCORE_SUGGESTIONS = [
  { label: '1x0', m: '1', v: '0' },
  { label: '2x1', m: '2', v: '1' },
  { label: '2x0', m: '2', v: '0' },
  { label: '1x1', m: '1', v: '1' },
  { label: '0x0', m: '0', v: '0' },
  { label: '0x1', m: '0', v: '1' },
  { label: '1x2', m: '1', v: '2' },
  { label: '0x2', m: '0', v: '2' },
  { label: '3x1', m: '3', v: '1' },
  { label: '2x2', m: '2', v: '2' }
];

interface PalpitesPageProps {
  onSuggestName?: (name: string) => void;
}

export default function PalpitesPage({ onSuggestName }: PalpitesPageProps) {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [activeRound, setActiveRound] = useState<Rodada | null>(null);
  
  // Form state
  const [nome, setNome] = useState('');
  const [confirmacaoNome, setConfirmacaoNome] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Structured match lines with dropdown selectors
  const [matchLines, setMatchLines] = useState<MatchGuessLine[]>([
    { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
    { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
    { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
    { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
    { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' }
  ]);
  
  // Submission result states
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionCount, setSubmissionCount] = useState<number>(0);

  // Closed rounds guesses state
  const [closedRounds, setClosedRounds] = useState<Rodada[]>([]);
  const [selectedClosedRound, setSelectedClosedRound] = useState<string>('');
  const [closedRoundGuesses, setClosedRoundGuesses] = useState<Palpite[]>([]);
  const [loadingGuesses, setLoadingGuesses] = useState(false);
  const [closedViewMode, setClosedViewMode] = useState<'tabela' | 'cards'>('tabela');

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  // Local Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Local Audit Logs helper
  const addAuditLog = (evento: string, status: 'SUCESSO' | 'ALERTA' | 'INFO' = 'INFO') => {
    const newEntry: AuditLogEntry = {
      id: 'TX-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      timestamp: new Date().toISOString(),
      evento,
      status,
      origem: 'Sessão Local Browser'
    };
    setAuditLogs(prev => {
      const updated = [newEntry, ...prev].slice(0, 30);
      localStorage.setItem('copapalpites_audit_log_v2', JSON.stringify(updated));
      return updated;
    });
  };

  // Timer useEffect for Countdown
  useEffect(() => {
    if (!activeRound) {
      setTimeLeft(null);
      return;
    }
    const updateTimer = () => {
      const totalMs = new Date(activeRound.fechamento).getTime() - new Date().getTime();
      if (totalMs <= 0) {
        setTimeLeft(null);
      } else {
        const seconds = Math.floor((totalMs / 1000) % 60);
        const minutes = Math.floor((totalMs / 1000 / 60) % 60);
        const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
        const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
        setTimeLeft({ days, hours, minutes, seconds });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeRound]);

  // Load audit logs on boot
  useEffect(() => {
    const savedLogs = localStorage.getItem('copapalpites_audit_log_v2');
    if (savedLogs) {
      try {
        setAuditLogs(JSON.parse(savedLogs));
      } catch {
        // Fallback
      }
    }
  }, []);

  // Real-time synchronization
  useEffect(() => {
    async function loadData() {
      try {
        const pSnap = await getDocs(collection(db, 'participantes'));
        const pList: Participante[] = [];
        pSnap.forEach((doc) => {
          pList.push({ id: doc.id, ...doc.data() } as Participante);
        });
        setParticipantes(pList);

        const rSnap = await getDocs(collection(db, 'rodadas'));
        const rList: Rodada[] = [];
        rSnap.forEach((doc) => {
          rList.push({ id: doc.id, ...doc.data() } as Rodada);
        });
        rList.sort((a,b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
        setRounds(rList);

        const now = new Date();
        // Se a rodada de teste estiver cadastrada e ativa (aberta), dar prioridade total a ela
        const testRoundOpen = rList.find(r => (r.is_test || r.id === 'rodada-teste') && r.status === 'aberta');
        // A rodada está aberta se status === 'aberta' e ainda não passou da data de fechamento
        const standardOpen = rList.find(r => r.status === 'aberta' && now < new Date(r.fechamento));
        const open = testRoundOpen || standardOpen;
        setActiveRound(open || null);

        // Rodadas com mercado fechado: status === 'encerrada' OU a data de fechamento já foi ultrapassada
        const closed = rList.filter(r => r.status === 'encerrada' || (now >= new Date(r.fechamento) && !r.is_test));
        closed.sort((a,b) => getRoundNumber(b.nome || b.id) - getRoundNumber(a.nome || a.id));
        setClosedRounds(closed);

        if (closed.length > 0 && !selectedClosedRound) {
          setSelectedClosedRound(closed[0].id);
        }
      } catch (err: any) {
        console.error("Error loading palpites data:", err);
      }
    }

    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [selectedClosedRound]);

  // Load guesses of closed round
  useEffect(() => {
    async function loadClosedGuesses() {
      if (!selectedClosedRound) {
        setClosedRoundGuesses([]);
        return;
      }
      
      const targetRound = rounds.find(r => r.id === selectedClosedRound);
      const nowISO = new Date().toISOString();
      const isActuallyClosed = targetRound && (targetRound.status === 'encerrada' || targetRound.fechamento <= nowISO);
      
      if (!isActuallyClosed) {
        setClosedRoundGuesses([]);
        return;
      }

      setLoadingGuesses(true);
      try {
        const q = query(
          collection(db, 'palpites'),
          where('rodada', '==', selectedClosedRound),
          orderBy('data_hora_envio', 'asc')
        );
        const snap = await getDocs(q);
        const list: Palpite[] = [];
        snap.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Palpite);
        });
        setClosedRoundGuesses(list);
      } catch (err) {
        console.error("Error loading closed guesses:", err);
      } finally {
        setLoadingGuesses(false);
      }
    }

    loadClosedGuesses();
  }, [selectedClosedRound, rounds]);

  // Dynamically check and sync the participant's active round submissions
  useEffect(() => {
    if (!activeRound) {
      setSubmissionCount(0);
      return;
    }
    const foundParticipant = participantes.find(p => p.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    if (!foundParticipant) {
      setSubmissionCount(0);
      return;
    }

    async function checkSubmissions() {
      const path = 'palpites';
      const storageKey = `palpites_count_${foundParticipant.id}_${activeRound.id}`;
      let count = 0;
      try {
        const q = query(
          collection(db, path),
          where('participante', '==', foundParticipant.nome),
          where('rodada', '==', activeRound.id)
        );
        const snap = await getDocs(q);
        let hasSub1 = false;
        let hasSub2 = false;
        snap.forEach(doc => {
          const d = doc.data();
          if (d.envio_numero === 1) hasSub1 = true;
          if (d.envio_numero === 2) hasSub2 = true;
        });
        if (hasSub2) count = 2;
        else if (hasSub1) count = 1;

        if (count > 0) {
          localStorage.setItem(storageKey, String(count));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (err) {
        const saved = localStorage.getItem(storageKey);
        count = saved ? parseInt(saved, 10) : 0;
      }
      setSubmissionCount(count);
    }

    checkSubmissions();
  }, [nome, activeRound, participantes]);

  // Autocomplete suggestions
  const suggestions = participantes.filter(p => 
    p.nome.toLowerCase().includes(nome.toLowerCase()) && 
    p.nome.toLowerCase() !== nome.toLowerCase()
  );

  const handleSelectSuggestion = (pNome: string) => {
    setNome(pNome);
    setConfirmacaoNome(''); // O participante deve digitar obrigatoriamente o nome na confirmação!
    setShowSuggestions(false);
    if (onSuggestName) onSuggestName(pNome);
  };

  const handleMatchChange = (index: number, field: keyof MatchGuessLine, value: string) => {
    setMatchLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };


  const handleClearMatch = (index: number) => {
    setMatchLines(prev => {
      const updated = [...prev];
      updated[index] = { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' };
      return updated;
    });
  };

  const handleStepGoals = (index: number, field: 'golsMandante' | 'golsVisitante', delta: number) => {
    setMatchLines(prev => {
      const updated = [...prev];
      const currentStr = updated[index][field];
      const currentVal = currentStr === '' ? (delta > 0 ? 0 : 0) : parseInt(currentStr, 10);
      const nextVal = Math.max(0, isNaN(currentVal) ? (delta > 0 ? 1 : 0) : currentVal + delta);
      updated[index] = { ...updated[index], [field]: String(nextVal) };
      return updated;
    });
  };

  const handleApplyPresetToMatch = (index: number, m: string, v: string) => {
    setMatchLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], golsMandante: m, golsVisitante: v };
      return updated;
    });
  };

  const handleApplyPresetToAllMatches = (m: string, v: string) => {
    setMatchLines(prev => prev.map(line => ({ ...line, golsMandante: m, golsVisitante: v })));
  };

  const formatDateTime = (isoString: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} às ${hours}:${minutes}`;
    } catch {
      return isoString;
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!nome.trim()) {
      setStatusMsg({ type: 'error', text: 'Por favor, insira o nome do participante.' });
      return;
    }

    if (!activeRound) {
      setStatusMsg({ type: 'error', text: 'Mercado encerrado. Aguarde a próxima rodada.' });
      return;
    }

    const nowISO = new Date().toISOString();
    if (nowISO >= activeRound.fechamento || activeRound.status === 'encerrada') {
      setStatusMsg({ type: 'error', text: 'Mercado encerrado. Aguarde a próxima rodada.' });
      return;
    }

    const foundParticipant = participantes.find(p => p.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    if (!foundParticipant) {
      setStatusMsg({
        type: 'error',
        text: `O nome "${nome}" não está cadastrado. Por favor, selecione seu nome a partir das sugestões ou contate o Administrador para se cadastrar.`
      });
      return;
    }

    const normalizedSelected = nome.replace(/\s+/g, '').toLowerCase();
    const normalizedConfirm = confirmacaoNome.replace(/\s+/g, '').toLowerCase();
    
    if (normalizedSelected !== normalizedConfirm) {
      setStatusMsg({
        type: 'error',
        text: 'O nome digitado na confirmação não é igual ao nome selecionado. Certifique-se de preencher o segundo campo com o mesmo nome.'
      });
      return;
    }

    // Validate matches selected
    const filledMatches: MatchGuessLine[] = [];
    for (let i = 0; i < matchLines.length; i++) {
      const line = matchLines[i];
      const hasAny = Boolean(line.timeMandante || line.timeVisitante || line.golsMandante !== '' || line.golsVisitante !== '');
      if (hasAny) {
        if (!line.timeMandante || !line.timeVisitante) {
          setStatusMsg({ type: 'error', text: `No Jogo ${i + 1}, selecione tanto o time mandante quanto o time visitante nas caixinhas.` });
          return;
        }
        if (line.timeMandante === line.timeVisitante) {
          setStatusMsg({ type: 'error', text: `No Jogo ${i + 1}, o time mandante (${line.timeMandante}) não pode jogar contra si mesmo.` });
          return;
        }
        if (line.golsMandante === '' || line.golsVisitante === '') {
          setStatusMsg({ type: 'error', text: `No Jogo ${i + 1} (${line.timeMandante} x ${line.timeVisitante}), selecione os placares de ambos os times nas caixinhas.` });
          return;
        }
        filledMatches.push(line);
      }
    }

    if (filledMatches.length === 0) {
      setStatusMsg({ type: 'error', text: 'Por favor, selecione os times e placares de pelo menos um jogo usando as caixinhas.' });
      return;
    }

    setSubmitting(true);
    try {
      const path = 'palpites';
      let hasSubmission2 = false;
      let hasSubmission1 = false;
      const storageKey = `palpites_count_${foundParticipant.id}_${activeRound.id}`;

      try {
        const q = query(
          collection(db, path),
          where('participante', '==', foundParticipant.nome),
          where('rodada', '==', activeRound.id)
        );
        const snap = await getDocs(q);
        snap.forEach(doc => {
          const d = doc.data();
          if (d.envio_numero === 2) hasSubmission2 = true;
          if (d.envio_numero === 1) hasSubmission1 = true;
        });
      } catch (queryErr) {
        const savedCount = localStorage.getItem(storageKey);
        const count = savedCount ? parseInt(savedCount, 10) : 0;
        if (count >= 2) {
          hasSubmission2 = true;
          hasSubmission1 = true;
        } else if (count === 1) {
          hasSubmission1 = true;
        }
      }

      if (hasSubmission2) {
        setStatusMsg({
          type: 'error',
          text: 'Você já enviou o limite máximo de 2 palpites para esta rodada. Não é possível enviar mais palpites, e o palpite que está valendo é o que você mandou por último.'
        });
        addAuditLog(`Tentativa bloqueada: ${foundParticipant.nome} tentou enviar o 3º palpite na ${activeRound.nome}.`, 'ALERTA');
        setSubmitting(false);
        return;
      }

      const submissionNum = hasSubmission1 ? 2 : 1;

      // Save each match to Firestore with both structured and string formats
      for (const line of filledMatches) {
        const palpiteText = `${line.timeMandante} ${line.golsMandante} x ${line.golsVisitante} ${line.timeVisitante}`;
        await addDoc(collection(db, path), {
          participante: foundParticipant.nome,
          rodada: activeRound.id,
          palpite: palpiteText,
          time_mandante: line.timeMandante,
          gols_mandante: parseInt(line.golsMandante, 10),
          time_visitante: line.timeVisitante,
          gols_visitante: parseInt(line.golsVisitante, 10),
          capitao: line.capitao.trim(),
          data_hora_envio: nowISO,
          envio_numero: submissionNum
        });
      }

      localStorage.setItem(storageKey, String(submissionNum));
      setSubmissionCount(submissionNum);

      const nowTime = new Date();
      const hms = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}:${String(nowTime.getSeconds()).padStart(2, '0')}`;

      setStatusMsg({ 
        type: 'success', 
        text: `Palpites registrados com sucesso! ${submissionNum === 2 ? 'Este é o seu 2º envio (ele substituirá o 1º na apuração).' : 'Este é o seu 1º envio.'}` 
      });

      if (submissionNum === 1) {
        addAuditLog(`Primeiro palpite de ${foundParticipant.nome} registrado para a ${activeRound.nome} às ${hms} (${filledMatches.length} jogos).`, 'SUCESSO');
      } else {
        addAuditLog(`Palpite alterado por ${foundParticipant.nome} para a ${activeRound.nome} às ${hms} (2º envio de segurança que substitui o anterior).`, 'INFO');
      }

      // Reset match rows to clean defaults
      setMatchLines([
        { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
        { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
        { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
        { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' },
        { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' }
      ]);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Erro ao registrar palpite. Verifique se o mercado está aberto.' });
      addAuditLog(`Erro ao salvar palpites de ${nome}: ${err?.message || err}`, 'ALERTA');
    } finally {
      setSubmitting(false);
    }
  };

  // Group guesses of closed round
  const groupedGuesses: Record<string, Palpite[]> = closedRoundGuesses.reduce((acc, curr) => {
    if (!acc[curr.participante]) {
      acc[curr.participante] = [];
    }
    acc[curr.participante].push(curr);
    return acc;
  }, {} as Record<string, Palpite[]>);

  const targetClosedRound = rounds.find(r => r.id === selectedClosedRound) || closedRounds[0];

  return (
    <div className="space-y-8">
      {/* Title block with Champions League cyan/blue accent */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-cyan-500/20 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] tracking-[0.2em] font-black text-cyan-400 uppercase font-mono">
              UEFA CHAMPIONS LEAGUE
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[10px] font-mono text-slate-400 tracking-wider uppercase font-semibold">
              MATCHDAY DA COMPETIÇÃO
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2.5 font-display drop-shadow-sm">
            <div className="w-2.5 h-6 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-xs shadow-xs" />
            {activeRound ? `Palpites Oficiais - ${activeRound.nome}` : 'Mercado Fechado - Apuração dos Placares'}
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold font-mono">
            36 Clubes Europeus • 5 Jogos Fixos • Fechamento Oficial: Terça-feira às 13:00
          </p>
        </div>

        {/* Status indicator Champions League */}
        {activeRound ? (
          <div className="flex items-center gap-2">
            {(activeRound.is_test || activeRound.id === 'rodada-teste') && (
              <span className="bg-purple-950/80 border border-purple-500/50 text-purple-300 px-3 py-1 rounded-full text-xs font-black uppercase flex items-center gap-1.5 animate-pulse">
                🧪 MODO TESTE
              </span>
            )}
            <div className="bg-[#05193d] border border-cyan-400/40 text-cyan-300 px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-2 tracking-wide uppercase shrink-0 shadow-lg shadow-cyan-950/40">
              <UclStarball className="w-3.5 h-3.5 text-cyan-400 animate-spin" glow />
              <span>MERCADO ABERTO</span>
              <span className="animate-pulse h-2 w-2 bg-cyan-400 rounded-full"></span>
            </div>
          </div>
        ) : (
          <div className="bg-[#240c1a] border border-rose-500/40 text-rose-300 px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 tracking-wide uppercase shrink-0 shadow-sm">
            <Lock className="w-3.5 h-3.5 text-rose-400" />
            <span>MERCADO ENCERRADO (TERÇA 13H)</span>
          </div>
        )}
      </div>

      {/* Mercado Countdown Banner - Champions League Stadium Night */}
      {activeRound && timeLeft && (
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0d1746] via-[#070e30] to-[#040922] border border-cyan-500/30 text-white rounded-2xl p-5 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 transition-all duration-300">
          {/* Subtle starball watermark inside banner */}
          <div className="absolute right-[-40px] top-[-30px] w-48 h-48 opacity-10 text-cyan-300 pointer-events-none">
            <UclStarball className="w-full h-full" />
          </div>

          <div className="flex items-center gap-3.5 z-10">
            <div className="p-3 bg-[#0a1645] rounded-xl border border-cyan-500/40 text-cyan-300 shadow-md">
              <Clock className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest font-mono">
                  CONTAGEM REGRESSIVA OFICIAL
                </span>
              </div>
              <h3 className="font-black text-sm uppercase tracking-wide flex items-center gap-1.5 text-white font-display">
                {(activeRound.is_test || activeRound.id === 'rodada-teste') ? 'Rodada de Teste Ativa (Controle Manual):' : 'O Mercado se encerra em:'}
              </h3>
              <p className="text-[10.5px] text-slate-300 font-semibold uppercase tracking-wider font-mono mt-0.5">
                {(activeRound.is_test || activeRound.id === 'rodada-teste')
                  ? 'Abertura e fechamento manuais pela administração'
                  : `Fechamento: ${formatDateTimeDisplay(activeRound.fechamento)} (Terça-feira às 13:00)`
                }
              </p>
            </div>
          </div>
          
          <div className="flex gap-2 z-10">
            {[
              { label: 'DIAS', value: timeLeft.days },
              { label: 'HORAS', value: timeLeft.hours },
              { label: 'MINUTOS', value: timeLeft.minutes },
              { label: 'SEGUNDOS', value: timeLeft.seconds }
            ].map((item, id) => (
              <div key={id} className="flex flex-col items-center bg-[#050b28]/90 border border-cyan-500/35 p-2.5 rounded-xl min-w-[70px] shadow-inner backdrop-blur-xs">
                <span className="text-xl font-black font-mono tracking-tight text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                  {String(item.value).padStart(2, '0')}
                </span>
                <span className="text-[8px] font-bold text-slate-400 mt-0.5 tracking-widest">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* When Market is Closed: Informative Banner */}
      {!activeRound && (
        <div className="bg-gradient-to-r from-[#170a24] via-[#090d29] to-[#04081c] border border-cyan-500/30 text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center justify-center shrink-0">
              <Lock className="w-7 h-7 text-rose-400" />
            </div>
            <div>
              <span className="text-rose-400 text-xs font-black tracking-widest uppercase block font-mono">
                RODADA FINALIZADA • MERCADO FECHADO
              </span>
              <h2 className="text-xl sm:text-2xl font-black font-display tracking-tight uppercase mt-0.5 text-white">
                Aguardando Apuração Oficial da Champions
              </h2>
              <p className="text-xs text-slate-300 font-medium mt-1.5 max-w-2xl leading-relaxed">
                O mercado foi fechado na <strong className="text-cyan-300">terça-feira às 13:00</strong>. Somente após o fechamento os palpites são revelados. O mercado da próxima rodada abrirá automaticamente assim que os placares oficiais dos jogos forem lançados!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main dashboard body with 2 columns */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left main form section - 2/3 width */}
        <section className="flex-1 lg:w-2/3 bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl shadow-2xl p-6 flex flex-col backdrop-blur-md">
          <div className="border-b border-cyan-500/15 pb-4 mb-5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-4 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-xs" />
              <h2 className="text-lg font-black text-white uppercase tracking-tight font-display flex items-center gap-2">
                {activeRound ? 'Palpites da Champions League' : 'Status do Mercado'}
              </h2>
            </div>
            <p className="text-slate-400 text-xs mt-1 uppercase tracking-wider font-semibold font-mono">
              {activeRound 
                ? 'Selecione os confrontos europeus e utilize os atalhos de placares rápidos.' 
                : 'O mercado está fechado no momento. Veja a tabela de quem palpitou abaixo.'}
            </p>
          </div>

          {!activeRound ? (
            <div className="py-6 space-y-4">
              <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 text-xs font-medium flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>
                  O envio de palpites está bloqueado. O mercado abrirá automaticamente quando os placares forem atualizados.
                </span>
              </div>
              {targetClosedRound && (
                <div className="pt-2">
                  <TabelaParticipacao
                    round={targetClosedRound}
                    participantes={participantes}
                    palpites={closedRoundGuesses}
                    isMarketClosed={true}
                  />
                </div>
              )}
            </div>
          ) : (
            <>

          {/* Participant Identification Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="relative">
              <label htmlFor="input-nome-participante" className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1 font-mono">
                <span>Nome do Participante *</span>
              </label>
              <input
                id="input-nome-participante"
                type="text"
                placeholder="Selecione ou digite seu nome..."
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full border border-cyan-800/60 p-3 rounded-xl text-sm bg-[#050a24] focus:bg-[#070e30] focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-bold text-white placeholder:text-slate-500 transition-colors shadow-inner"
              />

              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-[#060c28] border border-cyan-500/40 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-cyan-950/80 text-sm">
                  {suggestions.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => handleSelectSuggestion(p.nome)}
                      className="p-3 hover:bg-cyan-950/60 cursor-pointer flex justify-between items-center transition-colors font-bold text-slate-200"
                    >
                      <span className="flex items-center gap-2">
                        <UclStarball className="w-3.5 h-3.5 text-cyan-400" />
                        {p.nome}
                      </span>
                      <span className="text-[10px] bg-cyan-950 text-cyan-300 font-mono px-2 py-0.5 rounded-full border border-cyan-700/60 font-bold">
                        {p.pontos} Pts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="input-confirmacao-nome" className="block text-xs font-black uppercase tracking-wider text-slate-300 mb-1 flex items-center justify-between font-mono">
                <span>Confirmar Nome *</span>
                <span className="text-[10px] text-amber-400 font-bold lowercase">(digite manualmente)</span>
              </label>
              <input
                id="input-confirmacao-nome"
                type="text"
                placeholder="Digite seu nome exatamente como selecionado..."
                value={confirmacaoNome}
                onChange={(e) => setConfirmacaoNome(e.target.value)}
                className="w-full border border-cyan-800/60 p-3 rounded-xl text-sm bg-[#050a24] focus:bg-[#070e30] focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-bold text-white placeholder:text-slate-500 transition-colors shadow-inner"
              />
            </div>
          </div>

          {/* Submission status banner */}
          {submissionCount > 0 && (
            <div className={`p-4 mb-5 border rounded-xl text-xs flex items-start gap-3 transition-all ${
              submissionCount === 1 
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200' 
                : 'bg-cyan-950/50 border-cyan-500/40 text-cyan-200 font-semibold'
            }`}>
              <Info className={`w-5 h-5 shrink-0 ${submissionCount === 1 ? 'text-amber-400' : 'text-cyan-400'}`} />
              <div className="flex-1">
                <p className="font-bold mb-0.5">
                  {submissionCount === 1 
                    ? '1º Envio Registrado!' 
                    : 'Limite Máximo Atingido!'
                  }
                </p>
                <p className="opacity-90 leading-relaxed">
                  {submissionCount === 1 
                    ? 'Você já registrou 1 palpite para esta rodada. Se desejar alterá-lo, escolha os novos placares abaixo e envie. Este será o seu 2º envio, que substituirá o anterior.' 
                    : 'Você já enviou os 2 palpites permitidos para esta rodada. Suas escolhas estão consolidadas. O último envio é o que está valendo para a avaliação.'
                  }
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-3.5 flex flex-col flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 pb-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5 font-mono">
                  <UclStarball className="w-3 h-3 text-cyan-400" />
                  Os 5 Jogos da Champions
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 bg-cyan-950/80 border border-cyan-600/40 px-2.5 py-0.5 rounded-full font-mono">
                  5 Jogos Fixos
                </span>
              </div>

              {/* Atalhos Globais Rápidos */}
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap">
                <span className="font-bold text-slate-500">Atalhos gerais:</span>
                {[
                  { label: 'Todos 2x1', m: '2', v: '1' },
                  { label: 'Todos 1x0', m: '1', v: '0' },
                  { label: 'Todos 1x1', m: '1', v: '1' }
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleApplyPresetToAllMatches(p.m, p.v)}
                    disabled={!activeRound}
                    className="px-2 py-0.5 rounded-md bg-[#0a1442] hover:bg-cyan-500 hover:text-black text-cyan-300 border border-cyan-500/30 font-bold font-mono transition-colors shadow-2xs cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Match Rows Compactas e Fluidas - UEFA Champions League Matchday */}
            <div className="space-y-2.5">
              {matchLines.map((line, index) => {
                const isConfigured = Boolean(line.timeMandante && line.timeVisitante && line.golsMandante !== '' && line.golsVisitante !== '');
                return (
                  <div 
                    key={index} 
                    className={`p-3 rounded-xl border transition-all ${
                      isConfigured 
                        ? 'bg-[#08123d]/90 border-cyan-400/50 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-400/20' 
                        : 'bg-[#050b24]/90 border-cyan-900/40 hover:border-cyan-500/30'
                    }`}
                  >
                    {/* Header do Jogo Compacto */}
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-cyan-950">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#0b1747] text-cyan-300 font-mono border border-cyan-500/30">
                          Jogo {index + 1}
                        </span>
                        {isConfigured ? (
                          <span className="text-[11px] font-black text-cyan-300 flex items-center gap-1 font-mono">
                            <Check className="w-3.5 h-3.5 text-cyan-400" />
                            {line.timeMandante} {line.golsMandante} x {line.golsVisitante} {line.timeVisitante}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400">
                            Selecione os clubes e defina o placar
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleClearMatch(index)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                          title="Limpar campos deste jogo"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Linha dos Times e Placar Compacta */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      {/* Time Mandante */}
                      <div className="sm:col-span-4">
                        <select
                          value={line.timeMandante}
                          onChange={(e) => handleMatchChange(index, 'timeMandante', e.target.value)}
                          disabled={!activeRound}
                          className="w-full py-1.5 px-2 bg-[#04081c] border border-cyan-800/60 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:ring-1 focus:ring-cyan-400 cursor-pointer"
                        >
                          <option value="">-- Clube Mandante --</option>
                          {TEAMS_LIST.map((team) => (
                            <option key={team} value={team} disabled={team === line.timeVisitante}>
                              {team}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Placar Central com Stepper Compacto UCL */}
                      <div className="sm:col-span-4 flex items-center justify-center gap-1">
                        {/* Gols Mandante */}
                        <div className="flex items-center border border-cyan-700/50 rounded-lg overflow-hidden bg-[#030617] shrink-0 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleStepGoals(index, 'golsMandante', -1)}
                            disabled={!activeRound}
                            className="w-6 h-7 flex items-center justify-center text-cyan-400 hover:bg-cyan-950/60 active:bg-cyan-900 cursor-pointer text-xs"
                            title="Diminuir gol"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            placeholder="-"
                            value={line.golsMandante}
                            onChange={(e) => handleMatchChange(index, 'golsMandante', e.target.value)}
                            disabled={!activeRound}
                            className="w-8 h-7 text-center text-xs font-black font-mono text-cyan-300 border-x border-cyan-800/50 bg-[#030617] focus:outline-hidden focus:bg-[#070e30]"
                          />
                          <button
                            type="button"
                            onClick={() => handleStepGoals(index, 'golsMandante', 1)}
                            disabled={!activeRound}
                            className="w-6 h-7 flex items-center justify-center text-cyan-400 hover:bg-cyan-950/60 active:bg-cyan-900 cursor-pointer text-xs"
                            title="Aumentar gol"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="text-xs font-black text-cyan-400/80 font-mono px-0.5">x</span>

                        {/* Gols Visitante */}
                        <div className="flex items-center border border-cyan-700/50 rounded-lg overflow-hidden bg-[#030617] shrink-0 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleStepGoals(index, 'golsVisitante', -1)}
                            disabled={!activeRound}
                            className="w-6 h-7 flex items-center justify-center text-cyan-400 hover:bg-cyan-950/60 active:bg-cyan-900 cursor-pointer text-xs"
                            title="Diminuir gol"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            placeholder="-"
                            value={line.golsVisitante}
                            onChange={(e) => handleMatchChange(index, 'golsVisitante', e.target.value)}
                            disabled={!activeRound}
                            className="w-8 h-7 text-center text-xs font-black font-mono text-cyan-300 border-x border-cyan-800/50 bg-[#030617] focus:outline-hidden focus:bg-[#070e30]"
                          />
                          <button
                            type="button"
                            onClick={() => handleStepGoals(index, 'golsVisitante', 1)}
                            disabled={!activeRound}
                            className="w-6 h-7 flex items-center justify-center text-cyan-400 hover:bg-cyan-950/60 active:bg-cyan-900 cursor-pointer text-xs"
                            title="Aumentar gol"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Time Visitante */}
                      <div className="sm:col-span-4">
                        <select
                          value={line.timeVisitante}
                          onChange={(e) => handleMatchChange(index, 'timeVisitante', e.target.value)}
                          disabled={!activeRound}
                          className="w-full py-1.5 px-2 bg-[#04081c] border border-cyan-800/60 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:ring-1 focus:ring-cyan-400 cursor-pointer"
                        >
                          <option value="">-- Clube Visitante --</option>
                          {TEAMS_LIST.map((team) => (
                            <option key={team} value={team} disabled={team === line.timeMandante}>
                              {team}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Linha Inferior: Atalhos de Placares Comuns + Capitão */}
                    <div className="mt-2 pt-2 border-t border-cyan-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      {/* Sugestões de Placares Comuns */}
                      <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
                        <span className="text-[10px] font-bold text-slate-400 shrink-0 mr-0.5 font-mono">
                          Atalhos:
                        </span>
                        {COMMON_SCORE_SUGGESTIONS.map((preset) => {
                          const isSelected = line.golsMandante === preset.m && line.golsVisitante === preset.v;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => handleApplyPresetToMatch(index, preset.m, preset.v)}
                              disabled={!activeRound}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors border ${
                                isSelected
                                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-300 shadow-md shadow-cyan-950/60 font-black'
                                  : 'bg-[#09133d] hover:bg-cyan-950 text-cyan-300 border-cyan-800/60'
                              }`}
                              title={`Definir ${preset.label}`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* Capitão do Jogo */}
                      <div className="flex items-center gap-1.5 shrink-0 sm:max-w-xs w-full sm:w-auto">
                        <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5 shrink-0 font-mono">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          Capitão:
                        </span>
                        <input
                          type="text"
                          placeholder="Haaland, Saka, Mbappé... (+1 pt)"
                          value={line.capitao}
                          onChange={(e) => handleMatchChange(index, 'capitao', e.target.value)}
                          disabled={!activeRound}
                          className="w-full sm:w-44 px-2 py-1 text-[11px] border border-cyan-800/60 rounded-md bg-[#04081c] focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-medium text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Feedback messages */}
            {statusMsg && (
              <div className={`p-4 rounded-xl flex items-start gap-3 border text-sm ${
                statusMsg.type === 'success' 
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200' 
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
              }`}>
                {statusMsg.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                )}
                <span className="font-semibold">{statusMsg.text}</span>
              </div>
            )}

            <div className="pt-3 mt-auto">
              <button
                type="submit"
                disabled={submitting || !activeRound}
                className="w-full py-4 text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.99] rounded-xl font-black text-lg cursor-pointer transition-all flex items-center justify-center gap-2 shadow-xl shadow-cyan-950/60 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed uppercase tracking-wider font-display"
              >
                <UclStarball className="w-5 h-5 text-white" glow />
                {submitting ? 'Gravando Palpites da Champions...' : 'ENVIAR PALPITE DA CHAMPIONS'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
              <p className="text-slate-400 text-[10px] mt-2 font-mono text-center">
                ★ 2 Envios por rodada permitidos. O último envio válido antes das terças 13:00 é o considerado.
              </p>
            </div>
          </form>
          </>
          )}
        </section>

        {/* Right side widgets column - 1/3 width */}
        <aside className="w-full lg:w-1/3 flex flex-col gap-6 shrink-0">
          {/* Top 5 Leaderboard widget - Champions League Table */}
          <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl p-6 shadow-xl flex flex-col backdrop-blur-md">
            <h3 className="font-black text-white uppercase tracking-tight text-xs mb-4 flex items-center gap-2 font-display">
              <UclTrophy className="w-4 h-4 text-cyan-300" />
              <span>Top 5 • Fase de Liga</span>
            </h3>

            <div className="space-y-2">
              {[...participantes]
                .sort((a,b) => {
                  if (b.pontos !== a.pontos) return b.pontos - a.pontos;
                  return (b.acertos_placar || 0) - (a.acertos_placar || 0);
                })
                .slice(0, 5)
                .map((p, idx) => {
                  const place = idx + 1;
                  const isFirst = place === 1;
                  return (
                    <div 
                      key={p.id} 
                      className={`flex justify-between items-center p-3 rounded-xl border transition-all ${
                        isFirst 
                          ? 'bg-gradient-to-r from-[#172554] to-[#0c184d] border-cyan-400/50 text-white shadow-md' 
                          : 'bg-[#050b24]/80 border-cyan-900/40 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                          isFirst ? 'bg-amber-400 text-black shadow-xs' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {place}
                        </span>
                        <span className="font-bold text-xs truncate max-w-[120px]">{p.nome}</span>
                        {isFirst && (
                          <span className="text-[9px] text-amber-300 font-mono font-bold">★ LÍDER</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-cyan-400 font-mono font-bold">🎯 {p.acertos_placar ?? 0}</span>
                        <span className="font-mono font-black text-xs text-white">{p.pontos} Pts</span>
                      </div>
                    </div>
                  );
                })}
              {participantes.length === 0 && (
                <div className="text-center text-xs text-slate-400 py-4">Nenhum participante registrado.</div>
              )}
            </div>
          </div>

          {/* Scoring Rules Widget - Champions League Theme */}
          <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl p-6 shadow-xl flex flex-col backdrop-blur-md">
            <h3 className="font-black text-white uppercase tracking-tight text-xs mb-3 flex items-center gap-2 font-display">
              <Award className="w-4 h-4 text-cyan-400" />
              <span>Regras de Pontuação UCL</span>
            </h3>

            <div className="space-y-2 text-xs text-slate-300">
              <div className="p-2.5 rounded-xl bg-[#050b24]/90 border border-cyan-900/50 flex items-center justify-between">
                <span className="font-medium">Acertar Resultado (Vencedor/Empate)</span>
                <span className="font-mono font-black text-cyan-400 text-xs">+3 Pts</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#050b24]/90 border border-cyan-900/50 flex items-center justify-between">
                <span className="font-medium">Acertar Placar Exato</span>
                <span className="font-mono font-black text-cyan-400 text-xs">+2 Pts</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#0a184a]/90 border border-cyan-500/40 flex items-center justify-between text-white">
                <span className="font-bold flex items-center gap-1">
                  <UclStarball className="w-3 h-3 text-cyan-300" />
                  Placar Exato Completo
                </span>
                <span className="font-mono font-black text-cyan-300 text-xs">5 Pts</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#050b24]/90 border border-cyan-900/50 flex items-center justify-between">
                <span className="font-medium">Placar 0x0 sem Capitão</span>
                <span className="font-mono font-black text-amber-400 text-xs">6 Pts</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#050b24]/90 border border-cyan-900/50 flex items-center justify-between">
                <span className="font-medium">Placar 0x0 com Capitão</span>
                <span className="font-mono font-black text-amber-400 text-xs">5 Pts</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#050b24]/90 border border-cyan-900/50 flex items-center justify-between">
                <span className="font-medium">Gol do Capitão Indicado</span>
                <span className="font-mono font-black text-cyan-400 text-xs">+1 Pt / gol</span>
              </div>
            </div>
          </div>

          {/* Audit Logs Widget */}
          <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl p-6 shadow-xl flex flex-col backdrop-blur-md">
            <h3 className="font-black text-white uppercase tracking-tight text-xs mb-3 flex items-center gap-2 font-display">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Auditoria de Transações UCL</span>
            </h3>

            <div className="space-y-2.5 max-h-[224px] overflow-y-auto pr-1">
              {auditLogs.map((log) => {
                const dateObj = new Date(log.timestamp);
                const timeStr = !isNaN(dateObj.getTime())
                  ? `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`
                  : '';
                
                return (
                  <div key={log.id} className="text-[11px] border-b border-cyan-950 pb-2 last:pb-0 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          log.status === 'SUCESSO' ? 'bg-cyan-400 shadow-xs shadow-cyan-400' :
                          log.status === 'ALERTA' ? 'bg-amber-400' : 'bg-slate-500'
                        }`} />
                        <span className="font-mono text-cyan-300 font-bold">{timeStr}</span>
                      </div>
                      <span className="font-mono text-[9px] text-slate-500">{log.id}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed font-medium pr-1 break-words">
                      {log.evento}
                    </p>
                  </div>
                );
              })}
              {auditLogs.length === 0 && (
                <div className="text-center text-xs text-slate-500 py-6">Nenhum evento registrado.</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Histórico de Rodadas Anteriores & Pontuações Detalhadas */}
      <div className="pt-8 border-t border-cyan-500/20">
        <HistoricoRodadas initialRoundId={selectedClosedRound || (closedRounds.length > 0 ? closedRounds[0].id : undefined)} />
      </div>
    </div>
  );
}
