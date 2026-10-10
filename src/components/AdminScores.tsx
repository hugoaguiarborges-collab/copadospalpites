import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  increment,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { Participante, PontuacaoLog } from '../types';
import { resetTournamentToNewChampionship } from '../utils/tournamentReset';
import { ChevronUp, ChevronDown, RefreshCw, Star, ShieldAlert, History, AlertTriangle } from 'lucide-react';
import { UclStarball, UclBadge, UclTrophy } from './UclAssets';

export default function AdminScores() {
  const [participants, setParticipants] = useState<Participante[]>([]);
  const [history, setHistory] = useState<PontuacaoLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedP, setSelectedP] = useState('');
  const [pointsAmount, setPointsAmount] = useState<number>(0);
  const [motivo, setMotivo] = useState('');
  const [action, setAction] = useState<'add' | 'subtract'>('add');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resettingTournament, setResettingTournament] = useState(false);

  // Read list of participants
  const loadParticipants = async () => {
    try {
      const pSnap = await getDocs(collection(db, 'participantes'));
      const pList: Participante[] = [];
      pSnap.forEach((docObj) => {
        pList.push({ id: docObj.id, ...docObj.data() } as Participante);
      });
      pList.sort((a,b) => a.nome.localeCompare(b.nome));
      setParticipants(pList);
      if (pList.length > 0 && !selectedP) setSelectedP(pList[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadParticipants();

    // Set up real-time listener for logs list
    const qLogs = query(
      collection(db, 'pontuacoes'),
      orderBy('data_hora', 'desc')
    );
    const unsubscribe = onSnapshot(qLogs, (snap) => {
      const logs: PontuacaoLog[] = [];
      snap.forEach((docObj) => {
        logs.push({ id: docObj.id, ...docObj.data() } as PontuacaoLog);
      });
      setHistory(logs);
      setLoading(false);
    }, (err) => {
      console.error("Error loading logs", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAdjustScore = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedP) {
      setErrorMsg('Selecione um participante.');
      return;
    }
    if (pointsAmount <= 0) {
      setErrorMsg('Insira uma quantidade de pontos válida (maior que zero).');
      return;
    }
    if (!motivo.trim()) {
      setErrorMsg('O motivo do ajuste de pontuação é obrigatório.');
      return;
    }

    const pDoc = participants.find(part => part.id === selectedP);
    if (!pDoc) return;

    setSubmitting(true);
    try {
      const incrementVal = action === 'add' ? pointsAmount : -pointsAmount;
      const nowISO = new Date().toISOString();

      // update participant points
      await updateDoc(doc(db, 'participantes', selectedP), {
        pontos: increment(incrementVal)
      });

      // add points change log
      await addDoc(collection(db, 'pontuacoes'), {
        participante: pDoc.nome,
        pontos: incrementVal,
        motivo: motivo.trim(),
        data_hora: nowISO
      });

      setSuccessMsg(`Pontuação de "${pDoc.nome}" ajustada em ${incrementVal > 0 ? '+' : ''}${incrementVal} pontos com sucesso.`);
      setPointsAmount(0);
      setMotivo('');
      
      await loadParticipants();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao ajustar a pontuação no banco de dados.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAllScores = async () => {
    const confirmed = window.confirm(
      '⚠️ ATENÇÃO: Deseja realmente zerar todas as pontuações e iniciar um novo campeonato oficial a partir de hoje?\n\n- Todas as pontuações de todos os participantes serão zeradas (0 pts).\n- Serão configuradas as 50 rodadas oficiais com fechamento às terças-feiras às 13:00.\n- O mercado abre automaticamente quando a atualização de resultados for feita.\n- Os palpites e logs anteriores serão limpos.'
    );
    if (!confirmed) return;

    setResettingTournament(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await resetTournamentToNewChampionship();
      await loadParticipants();
      setSuccessMsg('Todas as pontuações foram zeradas com sucesso e o Novo Campeonato foi iniciado!');
    } catch (err: any) {
      console.error("Error resetting tournament:", err);
      setErrorMsg(`Erro ao zerar pontuações: ${err?.message || err}`);
    } finally {
      setResettingTournament(false);
    }
  };

  const formatDateTime = (isoString: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b border-cyan-500/20 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UclBadge text="PONTUAÇÃO OFICIAL" variant="gold" />
            <span className="text-[10px] font-mono font-bold text-cyan-300/70 tracking-widest uppercase">UEFA RANKING CONTROL</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black font-display text-white uppercase flex items-center gap-2">
            <UclStarball className="w-6 h-6 text-cyan-400" glow />
            Gerenciar Pontuação da Copa
          </h3>
          <p className="text-xs text-slate-300 font-medium mt-0.5">
            Ajustes manuais de pontuação dos participantes ou reinicialização de campeonato oficial
          </p>
        </div>

        {/* Reset Championship Button */}
        <button
          type="button"
          onClick={handleResetAllScores}
          disabled={resettingTournament}
          className="self-start sm:self-auto px-4 py-2.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-rose-950/50"
        >
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          {resettingTournament ? 'Zerando Pontuações...' : 'Zerar Pontuações & Novo Campeonato'}
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs flex items-center gap-2.5 font-bold shadow-lg">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 rounded-xl text-xs flex items-center gap-2.5 font-bold shadow-lg">
          <Star className="w-4 h-4 shrink-0 text-emerald-400 animate-bounce" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Manual points change form */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 p-6 shadow-2xl backdrop-blur-md max-w-xl">
        <h4 className="text-sm font-black text-white uppercase tracking-tight mb-4 flex items-center gap-2">
          <UclStarball className="w-4 h-4 text-cyan-400" />
          Ajustar Pontuação Manualmente
        </h4>
        <form onSubmit={handleAdjustScore} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="select-participant" className="block text-xs font-bold text-cyan-300 mb-1">
                Participante
              </label>
              <select
                id="select-participant"
                value={selectedP}
                onChange={(e) => setSelectedP(e.target.value)}
                className="w-full px-3 py-2 bg-[#050b28] border border-cyan-500/30 rounded-xl text-xs font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-400"
              >
                {participants.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#080f33] text-white">
                    {p.nome} ({p.pontos} Pts)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-cyan-300 mb-1">Operação</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAction('add')}
                  className={`flex-1 text-center py-2 border rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all ${
                    action === 'add' 
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 border-cyan-300 text-white shadow-md shadow-cyan-950/60' 
                      : 'bg-[#050b28] border-cyan-500/25 text-slate-300 hover:text-white'
                  }`}
                >
                  Adicionar
                </button>
                <button
                  type="button"
                  onClick={() => setAction('subtract')}
                  className={`flex-1 text-center py-2 border rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all ${
                    action === 'subtract' 
                      ? 'bg-gradient-to-r from-rose-600 to-red-700 border-rose-400 text-white shadow-md shadow-rose-950/60' 
                      : 'bg-[#050b28] border-cyan-500/25 text-slate-300 hover:text-white'
                  }`}
                >
                  Remover
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label htmlFor="points-val" className="block text-xs font-bold text-cyan-300 mb-1">Quantidade de Pontos</label>
              <input
                id="points-val"
                type="number"
                min="1"
                placeholder="Ex: 5"
                value={pointsAmount || ''}
                onChange={(e) => setPointsAmount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-[#050b28] border border-cyan-500/30 rounded-xl text-xs font-mono font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="reason-val" className="block text-xs font-bold text-cyan-300 mb-1">Motivo / Justificativa</label>
              <input
                id="reason-val"
                type="text"
                placeholder="Ex: Correção de lançamento / Bônus"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full px-3 py-2 bg-[#050b28] border border-cyan-500/30 rounded-xl text-xs font-medium text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || participants.length === 0}
            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 shadow-md shadow-cyan-950/60"
          >
            {submitting ? 'Salvando...' : 'Aplicar Ajuste'}
          </button>
        </form>
      </div>

      {/* Point history logs */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="px-6 py-4 border-b border-cyan-500/20 bg-[#050b28]/60 flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest font-bold">
            Histórico Oficial de Ajustes e Lançamentos
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400 font-mono">Carregando logs...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Nenhum ajuste ou lançamento registrado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans border-collapse">
              <thead>
                <tr className="border-b border-cyan-500/20 text-[10px] font-mono uppercase text-cyan-300/80 bg-[#050b28]/80">
                  <th className="px-5 py-3 font-bold">Participante</th>
                  <th className="px-5 py-3 font-bold">Valor</th>
                  <th className="px-5 py-3 font-bold">Motivo</th>
                  <th className="px-5 py-3 font-bold text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-500/10 text-xs">
                {history.map((log) => (
                  <tr key={log.id} className="hover:bg-cyan-950/20 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-white">{log.participante}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-0.5 font-mono font-bold px-2 py-0.5 rounded-md text-xs ${
                        log.pontos > 0 
                          ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-400/40' 
                          : 'bg-rose-950/90 text-rose-300 border border-rose-500/40'
                      }`}>
                        {log.pontos > 0 ? (
                          <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {log.pontos > 0 ? `+${log.pontos}` : log.pontos} pts
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-medium">{log.motivo}</td>
                    <td className="px-5 py-3.5 text-right text-cyan-300/60 font-mono text-[11px]">{formatDateTime(log.data_hora)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
