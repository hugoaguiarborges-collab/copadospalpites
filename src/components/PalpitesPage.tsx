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
  Plus,
  Trash2,
  RotateCcw,
  Lock,
  Unlock,
  Users,
  Eye
} from 'lucide-react';
import { getNextTuesday13h, formatDateTimeDisplay, isMarketOpen, getRoundNumber } from '../utils/dateUtils';
import TabelaParticipacao from './TabelaParticipacao';
import HistoricoRodadas from './HistoricoRodadas';

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
    setConfirmacaoNome(pNome);
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

  const handleAddMatch = () => {
    setMatchLines(prev => [
      ...prev,
      { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' }
    ]);
  };

  const handleRemoveMatch = (index: number) => {
    if (matchLines.length <= 1) return;
    setMatchLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearMatch = (index: number) => {
    setMatchLines(prev => {
      const updated = [...prev];
      updated[index] = { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', capitao: '' };
      return updated;
    });
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
      {/* Title block with green accent */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-neutral-200 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-800 uppercase flex items-center gap-2">
            <span className="w-2.5 h-6 bg-[#009739] block rounded-sm"></span>
            {activeRound ? `Enviar Palpite - ${activeRound.nome}` : 'Mercado Fechado - Aguardando Resultados'}
          </h1>
          <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-bold">
            Seleção direta dos 36 times e placares por caixinhas • Fechamento sempre na terça-feira às 13:00
          </p>
        </div>

        {/* Status indicator */}
        {activeRound ? (
          <div className="flex items-center gap-2">
            {(activeRound.is_test || activeRound.id === 'rodada-teste') && (
              <span className="bg-purple-100 border border-purple-300 text-purple-800 px-3 py-1 rounded-full text-xs font-black uppercase flex items-center gap-1.5 animate-pulse">
                🧪 MODO TESTE ATIVO
              </span>
            )}
            <div className="bg-[#dcfce7] border border-emerald-250 text-[#166534] px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 tracking-wide uppercase shrink-0">
              <span>MERCADO ABERTO</span>
              <span className="animate-pulse h-2 w-2 bg-green-600 rounded-full"></span>
            </div>
          </div>
        ) : (
          <div className="bg-[#fee2e2] border border-rose-250 text-[#991b1b] px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 tracking-wide uppercase shrink-0">
            <Lock className="w-3.5 h-3.5" />
            <span>MERCADO ENCERRADO (TERÇA 13H)</span>
          </div>
        )}
      </div>

      {/* Mercado Countdown Banner */}
      {activeRound && timeLeft && (
        <div className="bg-neutral-50 border border-neutral-200 text-neutral-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row justify-between items-center gap-4 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-neutral-100 rounded-xl border border-neutral-200 text-[#009739]">
              <Clock className="w-5 h-5 text-[#009739]" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wide flex items-center gap-1.5 text-neutral-800">
                {(activeRound.is_test || activeRound.id === 'rodada-teste') ? 'Rodada de Teste Ativa (Controle Manual do Administrador):' : 'O Mercado se encerra em:'}
              </h3>
              <p className="text-[10.5px] text-neutral-500 font-bold uppercase tracking-wider font-mono mt-0.5">
                {(activeRound.is_test || activeRound.id === 'rodada-teste')
                  ? 'O mercado pode ser aberto e fechado a qualquer momento na Administração'
                  : `Fechamento oficial: ${formatDateTimeDisplay(activeRound.fechamento)} (Terça-feira às 13:00)`
                }
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {[
              { label: 'DIAS', value: timeLeft.days },
              { label: 'HORAS', value: timeLeft.hours },
              { label: 'MINUTOS', value: timeLeft.minutes },
              { label: 'SEGUNDOS', value: timeLeft.seconds }
            ].map((item, id) => (
              <div key={id} className="flex flex-col items-center bg-white border border-neutral-200 p-2.5 rounded-lg min-w-[70px]">
                <span className="text-xl font-black font-mono tracking-tight text-[#009739]">
                  {String(item.value).padStart(2, '0')}
                </span>
                <span className="text-[8px] font-bold text-neutral-500 mt-0.5 tracking-widest">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* When Market is Closed: Informative Banner */}
      {!activeRound && (
        <div className="bg-neutral-900 text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-rose-500/20 border border-rose-500/30 rounded-2xl flex items-center justify-center shrink-0">
              <Lock className="w-7 h-7 text-rose-400" />
            </div>
            <div>
              <span className="text-rose-400 text-xs font-black tracking-widest uppercase block">
                RODADA FINALIZADA • MERCADO FECHADO
              </span>
              <h2 className="text-xl sm:text-2xl font-black font-display tracking-tight uppercase mt-0.5">
                Aguardando Atualização dos Placares
              </h2>
              <p className="text-xs text-neutral-300 font-medium mt-1.5 max-w-2xl leading-relaxed">
                O mercado foi fechado na <strong className="text-amber-400">terça-feira às 13:00</strong>. Somente quando o mercado fecha é que a rodada é considerada finalizada. O mercado da próxima rodada abrirá automaticamente assim que o administrador lançar e atualizar os placares oficiais dos jogos!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main dashboard body with 2 columns */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left main form section - 2/3 width */}
        <section className="flex-1 lg:w-2/3 bg-white border border-neutral-200 rounded-2xl shadow-xs p-6 flex flex-col">
          <div className="border-b border-neutral-100 pb-4 mb-5">
            <h2 className="text-lg font-black text-neutral-800 uppercase tracking-tight flex items-center gap-2">
              <span className="w-2 h-4 bg-[#009739] block rounded-xs"></span>
              {activeRound ? 'Formulário de Palpites' : 'Status do Mercado'}
            </h2>
            <p className="text-neutral-400 text-xs mt-0.5 uppercase tracking-wider font-bold">
              {activeRound 
                ? 'Selecione os times nas caixinhas e clique para escolher os placares (0 a 15).' 
                : 'O mercado está fechado no momento. Veja a tabela de quem palpitou abaixo.'}
            </p>
          </div>

          {!activeRound ? (
            <div className="py-6 space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-medium flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
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
              <label htmlFor="input-nome-participante" className="block text-xs font-black uppercase tracking-wider text-neutral-700 mb-1">
                Nome do Participante *
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
                className="w-full border border-neutral-200 p-3 rounded-lg text-sm bg-neutral-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#009739] font-bold text-neutral-800 placeholder:text-neutral-400"
              />

              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-neutral-100 text-sm">
                  {suggestions.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => handleSelectSuggestion(p.nome)}
                      className="p-3 hover:bg-neutral-50 cursor-pointer flex justify-between items-center transition-colors font-bold text-neutral-700"
                    >
                      <span>{p.nome}</span>
                      <span className="text-[10px] bg-green-50 text-green-700 font-mono px-2 py-0.5 rounded-full border border-green-200">
                        {p.pontos} Pts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="input-confirmacao-nome" className="block text-xs font-black uppercase tracking-wider text-neutral-700 mb-1">
                Confirmar Nome *
              </label>
              <input
                id="input-confirmacao-nome"
                type="text"
                placeholder="Digite seu nome novamente..."
                value={confirmacaoNome}
                onChange={(e) => setConfirmacaoNome(e.target.value)}
                className="w-full border border-neutral-200 p-3 rounded-lg text-sm bg-neutral-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#009739] font-bold text-neutral-800 placeholder:text-neutral-400"
              />
            </div>
          </div>

          {/* Submission status banner */}
          {submissionCount > 0 && (
            <div className={`p-4 mb-5 border rounded-xl text-xs flex items-start gap-3 transition-all ${
              submissionCount === 1 
                ? 'bg-amber-50/70 border-amber-200/60 text-amber-800' 
                : 'bg-[#009739]/5 border-[#009739]/20 text-[#009739] font-semibold'
            }`}>
              <Info className={`w-5 h-5 shrink-0 ${submissionCount === 1 ? 'text-amber-600' : 'text-[#009739]'}`} />
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

          <form onSubmit={handleFormSubmit} className="space-y-4 flex flex-col flex-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500">
                Jogos da Rodada (Selecione os times e placares nas caixinhas)
              </span>
              <button
                type="button"
                onClick={handleAddMatch}
                className="text-xs font-bold text-[#009739] hover:text-[#007a2e] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Jogo
              </button>
            </div>

            {/* Match Rows */}
            <div className="space-y-3">
              {matchLines.map((line, index) => {
                const isConfigured = Boolean(line.timeMandante && line.timeVisitante && line.golsMandante !== '' && line.golsVisitante !== '');
                return (
                  <div 
                    key={index} 
                    className={`p-3.5 rounded-xl border transition-all ${
                      isConfigured 
                        ? 'bg-white border-[#009739]/30 shadow-xs' 
                        : 'bg-neutral-50/40 border-neutral-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono">
                          Jogo {index + 1}
                        </span>
                        {isConfigured && (
                          <span className="text-[11px] font-extrabold text-[#009739]">
                            {line.timeMandante} {line.golsMandante} x {line.golsVisitante} {line.timeVisitante}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleClearMatch(index)}
                          className="p-1 text-neutral-400 hover:text-neutral-600 rounded transition-colors"
                          title="Limpar jogo"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        {matchLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMatch(index)}
                            className="p-1 text-neutral-400 hover:text-rose-500 rounded transition-colors"
                            title="Remover linha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Boxes Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      {/* Box 1: Home Team Selector */}
                      <div className="sm:col-span-4">
                        <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-0.5">
                          Time Mandante
                        </label>
                        <select
                          value={line.timeMandante}
                          onChange={(e) => handleMatchChange(index, 'timeMandante', e.target.value)}
                          disabled={!activeRound}
                          className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739] cursor-pointer"
                        >
                          <option value="">-- Escolha o Time --</option>
                          {TEAMS_LIST.map((team) => (
                            <option key={team} value={team} disabled={team === line.timeVisitante}>
                              {team}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Box 2: Home Score */}
                      <div className="sm:col-span-2">
                        <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-0.5 text-center">
                          Gols
                        </label>
                        <select
                          value={line.golsMandante}
                          onChange={(e) => handleMatchChange(index, 'golsMandante', e.target.value)}
                          disabled={!activeRound}
                          className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-black text-center text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739] cursor-pointer font-mono"
                        >
                          <option value="">-</option>
                          {SCORE_OPTIONS.map((score) => (
                            <option key={score} value={score}>{score}</option>
                          ))}
                        </select>
                      </div>

                      {/* Middle X */}
                      <div className="hidden sm:flex sm:col-span-1 justify-center items-center font-black text-neutral-300 text-xs pt-3">
                        x
                      </div>

                      {/* Box 3: Away Score */}
                      <div className="sm:col-span-2">
                        <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-0.5 text-center">
                          Gols
                        </label>
                        <select
                          value={line.golsVisitante}
                          onChange={(e) => handleMatchChange(index, 'golsVisitante', e.target.value)}
                          disabled={!activeRound}
                          className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-black text-center text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739] cursor-pointer font-mono"
                        >
                          <option value="">-</option>
                          {SCORE_OPTIONS.map((score) => (
                            <option key={score} value={score}>{score}</option>
                          ))}
                        </select>
                      </div>

                      {/* Box 4: Away Team Selector */}
                      <div className="sm:col-span-3">
                        <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-0.5">
                          Time Visitante
                        </label>
                        <select
                          value={line.timeVisitante}
                          onChange={(e) => handleMatchChange(index, 'timeVisitante', e.target.value)}
                          disabled={!activeRound}
                          className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739] cursor-pointer"
                        >
                          <option value="">-- Escolha o Time --</option>
                          {TEAMS_LIST.map((team) => (
                            <option key={team} value={team} disabled={team === line.timeMandante}>
                              {team}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Captain input line */}
                    <div className="mt-2.5 pt-2 border-t border-neutral-100 flex items-center gap-2">
                      <label className="text-[10px] font-bold text-neutral-500 shrink-0">
                        Capitão / Artilheiro do Jogo:
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Haaland, Saka, Mbappé... (Opcional: +1 pt por gol)"
                        value={line.capitao}
                        onChange={(e) => handleMatchChange(index, 'capitao', e.target.value)}
                        disabled={!activeRound}
                        className="w-full px-2.5 py-1 text-xs border border-neutral-200 rounded-md bg-white focus:outline-hidden focus:ring-1 focus:ring-[#009739] font-medium text-neutral-700 placeholder:text-neutral-350"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Feedback messages */}
            {statusMsg && (
              <div className={`p-4 rounded-xl flex items-start gap-3 border text-sm ${
                statusMsg.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                  : 'bg-rose-50 border-rose-100 text-rose-800'
              }`}>
                {statusMsg.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
                )}
                <span className="font-semibold">{statusMsg.text}</span>
              </div>
            )}

            <div className="pt-3 mt-auto">
              <button
                type="submit"
                disabled={submitting || !activeRound}
                className="w-full py-4 text-white bg-[#009739] hover:bg-[#007a2e] active:bg-[#005a20] rounded-xl font-black text-lg cursor-pointer transition-all flex items-center justify-center gap-2 shadow-sm disabled:bg-neutral-250 disabled:text-neutral-400 disabled:cursor-not-allowed uppercase tracking-wider"
              >
                {submitting ? 'Gravando Palpites...' : 'ENVIAR PALPITE OFICIAL'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
              <p className="text-neutral-400 text-[10px] mt-2 font-mono text-center">
                ★ Você pode substituir enviando uma 2ª vez. Apenas o último envio oficial será computado pela apuração.
              </p>
            </div>
          </form>
          </>
          )}
        </section>

        {/* Right side widgets column - 1/3 width */}
        <aside className="w-full lg:w-1/3 flex flex-col gap-6 shrink-0">
          {/* Top 5 Leaderboard widget */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs flex flex-col">
            <h3 className="font-black text-neutral-800 uppercase tracking-tight text-xs mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Top 5 Classificação
            </h3>

            <div className="space-y-2">
              {[...participantes]
                .sort((a,b) => b.pontos - a.pontos)
                .slice(0, 5)
                .map((p, idx) => {
                  const place = idx + 1;
                  const isFirst = place === 1;
                  return (
                    <div 
                      key={p.id} 
                      className={`flex justify-between items-center p-3 rounded-lg border transition-all ${
                        isFirst 
                          ? 'bg-green-50/70 border-green-200 text-[#166534]' 
                          : 'bg-neutral-50/50 border-neutral-200 text-neutral-800 text-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                          isFirst ? 'bg-amber-100 text-amber-800' : 'bg-neutral-200 text-neutral-600'
                        }`}>
                          {place}
                        </span>
                        <span className="font-bold text-xs truncate max-w-[120px]">{p.nome}</span>
                      </div>
                      <span className="font-mono font-black text-xs">{p.pontos} Pts</span>
                    </div>
                  );
                })}
              {participantes.length === 0 && (
                <div className="text-center text-xs text-neutral-400 py-4">Nenhum participante registrado.</div>
              )}
            </div>
          </div>

          {/* Scoring Rules Widget */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs flex flex-col">
            <h3 className="font-black text-neutral-800 uppercase tracking-tight text-xs mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-[#009739]" />
              Regras Oficiais de Pontuação
            </h3>

            <div className="space-y-2 text-xs text-neutral-600">
              <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-150 flex items-center justify-between">
                <span className="font-semibold">Acertar Resultado (Vencedor/Empate)</span>
                <span className="font-mono font-black text-[#009739] text-xs">+3 Pts</span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-150 flex items-center justify-between">
                <span className="font-semibold">Acertar Placar Exato</span>
                <span className="font-mono font-black text-[#009739] text-xs">+2 Pts</span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-150 flex items-center justify-between">
                <span className="font-semibold">Placar Exato Completo (Resultado + Placar)</span>
                <span className="font-mono font-black text-[#009739] text-xs">5 Pts</span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-150 flex items-center justify-between">
                <span className="font-semibold">Placar 0x0 sem Capitão</span>
                <span className="font-mono font-black text-amber-700 text-xs">6 Pts</span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-150 flex items-center justify-between">
                <span className="font-semibold">Placar 0x0 com Capitão</span>
                <span className="font-mono font-black text-amber-700 text-xs">5 Pts</span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-150 flex items-center justify-between">
                <span className="font-semibold">Gol do Capitão Indicado</span>
                <span className="font-mono font-black text-[#009739] text-xs">+1 Pt / gol</span>
              </div>
            </div>
          </div>

          {/* Audit Logs Widget */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs flex flex-col">
            <h3 className="font-black text-neutral-800 uppercase tracking-tight text-xs mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-400" />
              Auditoria de Transações
            </h3>

            <div className="space-y-2.5 max-h-[224px] overflow-y-auto pr-1">
              {auditLogs.map((log) => {
                const dateObj = new Date(log.timestamp);
                const timeStr = !isNaN(dateObj.getTime())
                  ? `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`
                  : '';
                
                return (
                  <div key={log.id} className="text-[11px] border-b border-neutral-50 last:border-0 pb-2 last:pb-0 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          log.status === 'SUCESSO' ? 'bg-emerald-500' :
                          log.status === 'ALERTA' ? 'bg-amber-500' : 'bg-neutral-400'
                        }`} />
                        <span className="font-mono text-neutral-400 font-bold">{timeStr}</span>
                      </div>
                      <span className="font-mono text-[9px] text-neutral-350">{log.id}</span>
                    </div>
                    <p className="text-neutral-600 leading-relaxed font-semibold pr-1 break-words">
                      {log.evento}
                    </p>
                  </div>
                );
              })}
              {auditLogs.length === 0 && (
                <div className="text-center text-xs text-neutral-400 py-6">Nenhum evento registrado.</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Histórico de Rodadas Anteriores & Pontuações Detalhadas */}
      <div className="pt-8 border-t-2 border-neutral-200">
        <HistoricoRodadas initialRoundId={selectedClosedRound || (closedRounds.length > 0 ? closedRounds[0].id : undefined)} />
      </div>
    </div>
  );
}
