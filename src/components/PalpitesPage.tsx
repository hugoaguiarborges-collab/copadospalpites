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
import { Sparkles, Calendar, CheckCircle, AlertCircle, ShieldAlert, Award, User, Star, Clock, FileText, Check, AlertTriangle, Info } from 'lucide-react';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  evento: string;
  status: 'SUCESSO' | 'ALERTA' | 'INFO';
  origem: string;
}

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
  const [guessLines, setGuessLines] = useState<{ palpite: string; capitao: string }[]>([
    { palpite: '', capitao: '' },
    { palpite: '', capitao: '' },
    { palpite: '', capitao: '' },
    { palpite: '', capitao: '' },
    { palpite: '', capitao: '' }
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
    } else {
      const initialLogs: AuditLogEntry[] = [
        {
          id: 'TX-INIT-' + Math.random().toString(36).substr(2, 5).toUpperCase(),
          timestamp: new Date().toISOString(),
          evento: 'Painel de palpites carregado. Filtros de sigilo absoluto ativos.',
          status: 'INFO',
          origem: 'Sessão Local Browser'
        }
      ];
      setAuditLogs(initialLogs);
      localStorage.setItem('copapalpites_audit_log_v2', JSON.stringify(initialLogs));
    }
  }, []);

  // Load participants and rounds on boot
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
        const nowStr = new Date().toISOString();

        for (const rDoc of rSnap.docs) {
          const rId = rDoc.id;
          const rData = rDoc.data() as Rodada;
          
          // "Garanta que após o horário de fechamento, a rodada seja marcada como 'encerrada'"
          if (rData.status === 'aberta' && rData.fechamento <= nowStr && rId !== 'round-teste') {
            try {
              await updateDoc(doc(db, 'rodadas', rId), { status: 'encerrada' });
              rList.push({ id: rId, ...rData, status: 'encerrada' });
            } catch (err) {
              console.error(`Error auto-closing round ${rId} on page load:`, err);
              rList.push({ id: rId, ...rData });
            }
          } else {
            rList.push({ id: rId, ...rData });
          }
        }
        setRounds(rList);

        // Find currently open round
        // Let's check if there is an active open round whose opening time has passed but has not closed yet
        const open = rList.find(r => r.status === 'aberta' && r.abertura <= nowStr && r.fechamento > nowStr);
        if (open) {
          setActiveRound(open);
        } else {
          // If no explicitly active round currently, find the scheduled open round that starts soonest in the future OR has not closed yet
          const sortedActive = rList
            .filter(r => r.status === 'aberta' && r.fechamento > nowStr)
            .sort((a,b) => new Date(a.abertura).getTime() - new Date(b.abertura).getTime());
          if (sortedActive.length > 0) {
            setActiveRound(sortedActive[0]);
          } else {
            setActiveRound(null);
          }
        }

        // Closed rounds (only if status is 'encerrada', or it is the special test round 'round-teste')
        // This satisfies: "O sistema deve ocultar completamente a exibição dos palpites de todos os usuários, incluindo administradores, se o status da rodada for 'aberta' (exceto para a rodada especial 'round-teste')."
        const closed = rList.filter(r => r.status === 'encerrada' || r.id === 'round-teste');
        setClosedRounds(closed);
        if (closed.length > 0) {
          // Default to the most recently closed round
          const sortedClosed = [...closed].sort((a, b) => new Date(b.fechamento).getTime() - new Date(a.fechamento).getTime());
          setSelectedClosedRound(sortedClosed[0].id);
        }
        
        // Log successful boot with active round name
        const activeName = open ? open.nome : (rList.find(r => r.status === 'aberta' && r.fechamento > nowStr)?.nome || 'Nenhuma');
        addAuditLog(`Rodadas sincronizadas com sucesso. Mercado em vigor: ${activeName}`, 'SUCESSO');
      } catch (err) {
        addAuditLog(`Falha na sincronização inicial dos dados das rodadas.`, 'ALERTA');
        console.error("Error loading initial data in PalpitesPage", err);
      }
    }
    loadData();
  }, []);

  // Fetch closed round guesses when selection changes
  useEffect(() => {
    if (!selectedClosedRound) {
      setClosedRoundGuesses([]);
      return;
    }
    async function loadClosedGuesses() {
      // Security Check: If the selected round is still open and not 'round-teste', do not query or display its guesses
      const targetRoundObj = rounds.find(r => r.id === selectedClosedRound);
      if (targetRoundObj && targetRoundObj.status === 'aberta' && targetRoundObj.id !== 'round-teste') {
        setClosedRoundGuesses([]);
        return;
      }

      setLoadingGuesses(true);
      try {
        const path = 'palpites';
        const q = query(
          collection(db, path),
          where('rodada', '==', selectedClosedRound),
          orderBy('data_hora_envio', 'asc')
        );
        const snap = await getDocs(q);
        const guesses: Palpite[] = [];
        snap.forEach((doc) => {
          guesses.push({ id: doc.id, ...doc.data() } as Palpite);
        });
        
        // Dynamic re-verification
        if (targetRoundObj && targetRoundObj.status === 'aberta' && targetRoundObj.id !== 'round-teste') {
          setClosedRoundGuesses([]);
        } else {
          setClosedRoundGuesses(guesses);
        }
      } catch (err) {
        console.error("Error fetching closed guesses.", err);
        setClosedRoundGuesses([]);
      } finally {
        setLoadingGuesses(false);
      }
    }
    loadClosedGuesses();
  }, [selectedClosedRound, rounds]);

  // Dynamically check and sync the participant's active round submissions, updating localStorage and submissionCount state
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

        // Keep localStorage and state perfectly synchronized with database reality
        if (count > 0) {
          localStorage.setItem(storageKey, String(count));
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (err) {
        console.warn("Could not check submissions in background, reading localStorage fallback:", err);
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

  const handleLineChange = (index: number, field: 'palpite' | 'capitao', value: string) => {
    const updated = [...guessLines];
    updated[index][field] = value;
    setGuessLines(updated);
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

    // Double check deadline on client
    const nowISO = new Date().toISOString();
    if (nowISO >= activeRound.fechamento || activeRound.status === 'encerrada') {
      setStatusMsg({ type: 'error', text: 'Mercado encerrado. Aguarde a próxima rodada.' });
      return;
    }

    // Match registered participant name
    const foundParticipant = participantes.find(p => p.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    if (!foundParticipant) {
      setStatusMsg({
        type: 'error',
        text: `O nome "${nome}" não está cadastrado. Por favor, selecione seu nome a partir das sugestões ou contate o Administrador para se cadastrar.`
      });
      return;
    }

    // Double validation: typed confirmation name must match exactly (case-insensitive & ignoring spaces)
    const normalizedSelected = nome.replace(/\s+/g, '').toLowerCase();
    const normalizedConfirm = confirmacaoNome.replace(/\s+/g, '').toLowerCase();
    
    if (normalizedSelected !== normalizedConfirm) {
      setStatusMsg({
        type: 'error',
        text: 'O nome digitado na confirmação não é igual ao nome selecionado. Certifique-se de preencher o segundo campo com o mesmo nome.'
      });
      return;
    }

    // Filter only filled lines
    const filledLines = guessLines.filter(line => line.palpite.trim() !== '');
    if (filledLines.length === 0) {
      setStatusMsg({ type: 'error', text: 'Por favor, preencha pelo menos uma linha de palpite.' });
      return;
    }

    setSubmitting(true);
    try {
      // Find how many previous submissions this participant has done for this round
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
          if (d.envio_numero === 2) {
            hasSubmission2 = true;
          }
          if (d.envio_numero === 1) {
            hasSubmission1 = true;
          }
        });
      } catch (queryErr) {
        console.warn("Could not query previous submissions via Firestore. Falling back to localStorage.", queryErr);
        // Fallback to localStorage check
        const savedCount = localStorage.getItem(storageKey);
        const count = savedCount ? parseInt(savedCount, 10) : 0;
        if (count >= 2) {
          hasSubmission2 = true;
          hasSubmission1 = true;
        } else if (count === 1) {
          hasSubmission1 = true;
        }
      }

      // If they already submitted 2 times, block the 3rd submission
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

      // Save each filled match line to Firestore
      for (const line of filledLines) {
        await addDoc(collection(db, path), {
          participante: foundParticipant.nome,
          rodada: activeRound.id,
          palpite: line.palpite.trim(),
          capitao: line.capitao.trim(),
          data_hora_envio: nowISO,
          envio_numero: submissionNum
        });
      }

      // Update local storage count and state
      localStorage.setItem(storageKey, String(submissionNum));
      setSubmissionCount(submissionNum);

      const nowTime = new Date();
      const hms = `${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}:${String(nowTime.getSeconds()).padStart(2, '0')}`;

      setStatusMsg({ 
        type: 'success', 
        text: `Palpite registrado com sucesso. ${submissionNum === 2 ? 'Este é o seu 2º palpite (ele substituirá o 1º em caso de avaliação).' : 'Este é o seu 1º palpite.'}` 
      });

      if (submissionNum === 1) {
        addAuditLog(`Primeiro palpite de ${foundParticipant.nome} registrado com sucesso para a ${activeRound.nome} às ${hms} (${filledLines.length} jogo(s) palpitado(s)).`, 'SUCESSO');
      } else {
        addAuditLog(`Palpite alterado por ${foundParticipant.nome} para a ${activeRound.nome} às ${hms} (2º envio de segurança que substituirá o anterior).`, 'INFO');
      }

      // Clear guess inputs
      setGuessLines([
        { palpite: '', capitao: '' },
        { palpite: '', capitao: '' },
        { palpite: '', capitao: '' },
        { palpite: '', capitao: '' },
        { palpite: '', capitao: '' }
      ]);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: 'error', text: 'Erro ao registrar palpite. Verifique se o mercado está aberto.' });
      addAuditLog(`Erro ao salvar palpites de ${nome}: ${err?.message || err}`, 'ALERTA');
    } finally {
      setSubmitting(false);
    }
  };

  // Group guesses of closed round to show nicely in UI
  const groupedGuesses: Record<string, Palpite[]> = closedRoundGuesses.reduce((acc, curr) => {
    if (!acc[curr.participante]) {
      acc[curr.participante] = [];
    }
    acc[curr.participante].push(curr);
    return acc;
  }, {} as Record<string, Palpite[]>);

  return (
    <div className="space-y-8">
      {/* Title block with green accent */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-neutral-200 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-800 uppercase flex items-center gap-2">
            <span className="w-2.5 h-6 bg-[#009739] block rounded-sm"></span>
            Enviar Palpite - {activeRound ? activeRound.nome : 'Sem Rodada'}
          </h1>
          <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-bold">
            Sigilo absoluto garantido do fechamento do mercado
          </p>
        </div>

        {/* Status indicator style from design HTML */}
        {activeRound ? (
          <div className="bg-[#dcfce7] border border-emerald-250 text-[#166534] px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 tracking-wide uppercase shrink-0">
            <span>MERCADO ABERTO</span>
            <span className="animate-pulse h-2 w-2 bg-green-600 rounded-full"></span>
          </div>
        ) : (
          <div className="bg-[#fee2e2] border border-rose-250 text-[#991b1b] px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 tracking-wide uppercase shrink-0">
            <span>MERCADO ENCERRADO</span>
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
                O Mercado se encerra em:
              </h3>
              <p className="text-[10.5px] text-neutral-500 font-bold uppercase tracking-wider font-mono mt-0.5">
                Fechamento oficial: {formatDateTime(activeRound.fechamento)}
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

      {/* Main dashboard body with 2 columns */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left main form section - 2/3 width */}
        <section className="flex-1 lg:w-2/3 bg-white border border-neutral-200 rounded-2xl shadow-xs p-6 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Nome do Participante</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-neutral-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  id="participante-nome"
                  type="text"
                  autoComplete="off"
                  placeholder="Selecione seu nome..."
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    setShowSuggestions(true);
                    if (statusMsg) setStatusMsg(null);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#009739]/50 focus:bg-white transition-all text-neutral-800 font-bold"
                />

                {/* Suggestions Dropdown positioned relative to the wrapper */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-md max-h-48 overflow-y-auto left-0 top-full">
                    {suggestions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setNome(p.nome);
                          setShowSuggestions(false);
                          addAuditLog(`Vínculo de participante ativo selecionado: ${p.nome}`, 'INFO');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-0 font-semibold"
                      >
                        {p.nome} <span className="text-xs text-neutral-400 font-mono">({p.pontos} Pts)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Confirme seu Nome (Digite exatamente igual)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-neutral-400">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                </span>
                <input
                  id="participante-nome-confirmacao"
                  type="text"
                  autoComplete="off"
                  placeholder="Digite seu nome novamente..."
                  value={confirmacaoNome}
                  onChange={(e) => {
                    setConfirmacaoNome(e.target.value);
                    if (statusMsg) setStatusMsg(null);
                  }}
                  className="w-full pl-10 pr-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#009739]/50 focus:bg-white transition-all text-neutral-800 font-bold"
                />
              </div>
            </div>
          </div>

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
                    ? 'Você já registrou 1 palpite para esta rodada. Se desejar alterá-lo, preencha os novos palpites abaixo e envie. Este será o seu 2º palpite de segurança, que substituirá o anterior.' 
                    : 'Você já enviou os 2 palpites permitidos para esta rodada. Suas escolhas estão salvas e consolidadas. O último envio é o que está valendo para a avaliação.'
                  }
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4 flex flex-col flex-1">
            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1">
              <div className="col-span-8">Palpite (Ex: Brasil 2x1 Argentina)</div>
              <div className="col-span-4">Nome do Jogador / Capitão</div>
            </div>

            <div className="space-y-3">
              {guessLines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2">
                  <input
                    type="text"
                    placeholder={`Jogo ${index + 1}`}
                    value={line.palpite}
                    onChange={(e) => handleLineChange(index, 'palpite', e.target.value)}
                    disabled={!activeRound}
                    className="col-span-8 border border-neutral-200 p-3 rounded-lg text-sm bg-neutral-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#009739] placeholder:text-neutral-400 font-semibold text-neutral-800"
                  />
                  <input
                    type="text"
                    placeholder="Capitão"
                    value={line.capitao}
                    onChange={(e) => handleLineChange(index, 'capitao', e.target.value)}
                    disabled={!activeRound}
                    className="col-span-4 border border-neutral-200 p-3 rounded-lg text-sm bg-neutral-50/50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#009739] placeholder:text-neutral-400 font-semibold text-neutral-800"
                  />
                </div>
              ))}
            </div>

            {/* Feedback messages */}
            {statusMsg && (
              <div className={`p-4 rounded-lg flex items-start gap-3 border text-sm ${
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

            <div className="pt-2 mt-auto">
              <button
                type="submit"
                disabled={submitting || !activeRound}
                className="w-full py-4 text-white bg-[#009739] hover:bg-[#007a2e] active:bg-[#005a20] rounded-xl font-bold text-lg cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-sm disabled:bg-neutral-250 disabled:text-neutral-400 disabled:cursor-not-allowed uppercase tracking-wider"
              >
                {submitting ? 'Registrando...' : 'ENVIAR PALPITE'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
              <p className="text-neutral-400 text-[10px] mt-2 font-mono text-center">
                ★ Você pode substituir enviando uma 2ª vez. Apenas o último envio oficial será computado.
              </p>
            </div>
          </form>
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
                      <div className="flex items-center gap-3">
                        <span className={`font-black ${isFirst ? 'text-[#009739]' : 'text-neutral-400'}`}>
                          {place}º
                        </span>
                        <span className="font-bold">{p.nome}</span>
                      </div>
                      <span className="font-black">{p.pontos} Pts</span>
                    </div>
                  );
                })}
              {participantes.length === 0 && (
                <div className="text-center text-xs text-neutral-400 py-8">Nenhum participante cadastrado</div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-neutral-155 flex justify-between text-[11px] text-neutral-400 font-bold uppercase tracking-wider">
              <div className="flex flex-col">
                <span>Participantes</span>
                <span className="text-neutral-800 text-sm">{participantes.length}</span>
              </div>
              <div className="flex flex-col text-right">
                <span>Líder Atual</span>
                <span className="text-[#009739] text-sm italic">
                  {participantes.length > 0 ? [...participantes].sort((a,b) => b.pontos - a.pontos)[0].nome : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Secure Badge */}
          <div className="bg-neutral-900 border border-neutral-950 rounded-2xl p-5 text-white shadow-md flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="font-bold text-xs uppercase tracking-wider">Sigilo Absoluto Garantido</span>
            </div>
            <p className="text-[11px] text-neutral-350 leading-relaxed font-semibold">
              Nenhum participante ou administrador pode ver os palpites de outros antes do horário de encerramento do mercado da rodada.
            </p>
            {activeRound && (
              <div className="mt-1 bg-neutral-800 p-2.5 rounded text-[10px] font-mono text-neutral-200 border-l-2 border-yellow-500 font-bold">
                PROX. FECHAMENTO: {formatDateTime(activeRound.fechamento).toUpperCase()}
              </div>
            )}
          </div>

          {/* Audit Logs Widget */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs flex flex-col">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-3">
              <h3 className="font-black text-neutral-800 uppercase tracking-tight text-xs flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-600" />
                Auditoria de Updates Locais
              </h3>
              <span className="text-[9px] font-mono font-bold bg-neutral-100 px-1.5 py-0.5 text-neutral-500 rounded border border-neutral-200">
                CLIENT-LOG
              </span>
            </div>

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

            <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider text-center mt-3 pt-2.5 border-t border-neutral-100">
              Registros dinâmicos gerados pela sessão atual
            </p>
          </div>
        </aside>
      </div>

      {/* Closed Rounds Results Section */}
      {closedRounds.length > 0 && (
        <div className="space-y-6 pt-6 border-t border-neutral-200">
          <div className="pb-2">
            <h2 className="text-xl font-bold text-neutral-800 uppercase tracking-tight flex items-center gap-2">
              <span className="w-2.5 h-5 bg-neutral-800 block rounded-xs"></span>
              Histórico de Palpites Revelados
            </h2>
            <p className="text-neutral-400 text-xs mt-1 uppercase tracking-wider font-bold">
              Todos os palpites tornam-se públicos apenas após o fechamento do mercado.
            </p>
          </div>

          <div className="flex items-center gap-3 max-w-sm">
            <label htmlFor="closed-round-selector" className="text-xs font-bold text-neutral-500 uppercase tracking-wider shrink-0">Buscar Rodada:</label>
            <select
              id="closed-round-selector"
              value={selectedClosedRound}
              onChange={(e) => setSelectedClosedRound(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-[#009739]"
            >
              {closedRounds.map(r => {
                const nowStr = new Date().toISOString();
                const isClosed = r.status === 'encerrada' || r.fechamento <= nowStr;
                return (
                  <option key={r.id} value={r.id}>
                    {r.nome} {isClosed ? '(Mercado Fechado)' : '(Rodada de Teste - Aberta)'}
                  </option>
                );
              })}
            </select>
          </div>

          {loadingGuesses ? (
            <div className="py-12 text-center text-sm text-neutral-400 font-mono font-semibold animate-pulse">
              Buscando palpites de forma segura no banco de dados...
            </div>
          ) : Object.keys(groupedGuesses).length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-400 bg-white border border-dashed border-neutral-200 rounded-xl">
              Nenhum palpite enviado nesta rodada ou mercado ainda em andamento.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(groupedGuesses).map(([participantName, guesses]) => {
                const sorted = [...guesses].sort((a,b) => new Date(a.data_hora_envio).getTime() - new Date(b.data_hora_envio).getTime());
                const uploadBatches = Array.from(new Set(sorted.map(g => g.data_hora_envio)));
                
                return (
                  <div key={participantName} className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs relative overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-neutral-105 text-neutral-600 text-sm font-black flex items-center justify-center font-display uppercase">
                          {participantName[0]}
                        </div>
                        <h4 className="font-bold text-[#009739] text-sm uppercase tracking-wide">{participantName}</h4>
                      </div>
                    </div>

                    <div className="space-y-4 flex-1">
                      {uploadBatches.map((timestamp, batchIdx) => {
                        const batchGuesses = sorted.filter(g => g.data_hora_envio === timestamp);
                        const isLatest = batchIdx === uploadBatches.length - 1;
                        
                        return (
                          <div 
                            key={timestamp} 
                            className={`p-3 rounded-lg border text-sm transition-all ${
                              isLatest 
                                ? 'bg-green-50/30 border-green-100 ring-1 ring-green-100' 
                                : 'bg-neutral-50/50 border-neutral-100 opacity-50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-mono text-neutral-400 font-bold uppercase">
                                {batchIdx + 1}º Envio ({formatDateTime(timestamp)})
                              </span>
                              {isLatest ? (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-sm bg-[#dcfce7] text-[#166534] text-[9px] font-bold uppercase tracking-wider font-mono">
                                  <Star className="w-2.5 h-2.5 fill-green-600 text-green-600 shrink-0" />
                                  Valendo
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-neutral-400 uppercase font-mono tracking-wider">
                                  Substituído
                                </span>
                              )}
                            </div>

                            <ul className="space-y-2">
                              {batchGuesses.map((guess, idx) => (
                                <li key={guess.id} className="text-xs flex items-start justify-between border-b border-dashed border-neutral-100 last:border-0 pb-1.5 last:pb-0">
                                  <div>
                                    <span className="font-bold text-neutral-800 block">{idx + 1}. {guess.palpite}</span>
                                    <div className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider mt-0.5">Capitão: <span className="text-neutral-600 font-mono bg-neutral-100 px-1 py-0.5 rounded-xs">{guess.capitao || 'Sem capitão'}</span></div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
