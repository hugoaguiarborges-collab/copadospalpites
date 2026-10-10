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
      <div className="border-b border-neutral-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black font-display text-neutral-800 uppercase flex items-center gap-2">
            <span className="w-2.5 h-5 bg-[#009739] block rounded-xs"></span>
            Gerenciar Pontuação
          </h3>
          <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mt-0.5">
            Ajustes manuais de pontuação ou reinicialização de campeonato
          </p>
        </div>

        {/* Reset Championship Button */}
        <button
          type="button"
          onClick={handleResetAllScores}
          disabled={resettingTournament}
          className="self-start sm:self-auto px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          {resettingTournament ? 'Zerando Pontuações...' : 'Zerar Pontuações & Novo Campeonato'}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <Star className="w-4 h-4 shrink-0 text-emerald-500 animate-bounce" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Manual points change form */}
      <div className="bg-white rounded-xl border border-neutral-150 p-5 shadow-xs max-w-xl">
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Ajustar Pontuação Manualmente</h4>
        <form onSubmit={handleAdjustScore} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="select-participant" className="block text-xs font-semibold text-neutral-550 mb-1">Participante</label>
              <select
                id="select-participant"
                value={selectedP}
                onChange={(e) => setSelectedP(e.target.value)}
                className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-xs text-neutral-800 focus:outline-hidden"
              >
                {participants.map(p => (
                  <option key={p.id} value={p.id}>{p.nome} ({p.pontos} Pts)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-550 mb-1">Operação</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAction('add')}
                  className={`flex-1 text-center py-1.5 border rounded-md text-xs font-medium cursor-pointer transition-all ${
                    action === 'add' 
                      ? 'bg-neutral-900 border-neutral-950 text-white' 
                      : 'bg-white border-neutral-200 text-neutral-700'
                  }`}
                >
                  Adicionar
                </button>
                <button
                  type="button"
                  onClick={() => setAction('subtract')}
                  className={`flex-1 text-center py-1.5 border rounded-md text-xs font-medium cursor-pointer transition-all ${
                    action === 'subtract' 
                      ? 'bg-neutral-900 border-neutral-950 text-white' 
                      : 'bg-white border-neutral-200 text-neutral-700'
                  }`}
                >
                  Remover
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label htmlFor="points-val" className="block text-xs font-semibold text-neutral-550 mb-1">Quantidade de Pontos</label>
              <input
                id="points-val"
                type="number"
                min="1"
                placeholder="Ex: 5"
                value={pointsAmount || ''}
                onChange={(e) => setPointsAmount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-xs focus:outline-hidden text-neutral-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="reason-val" className="block text-xs font-semibold text-neutral-550 mb-1">Motivo / Justificativa</label>
              <input
                id="reason-val"
                type="text"
                placeholder="Ex: Correção de lançamento / Bônus"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-xs focus:outline-hidden text-neutral-800"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || participants.length === 0}
            className="w-full sm:w-auto px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:bg-neutral-200"
          >
            {submitting ? 'Salvando...' : 'Aplicar Ajuste'}
          </button>
        </form>
      </div>

      {/* Point history logs */}
      <div className="bg-white rounded-xl border border-neutral-150 overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center gap-2">
          <History className="w-4 h-4 text-neutral-400" />
          <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">Histórico de Ajustes e Lançamentos</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-400 font-mono">Carregando logs...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">Nenhum ajuste ou lançamento registrado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans border-collapse">
              <thead>
                <tr className="border-b border-neutral-100 text-[10px] font-mono uppercase text-neutral-400 bg-neutral-50/20">
                  <th className="px-5 py-2.5 font-medium">Participante</th>
                  <th className="px-5 py-2.5 font-medium">Valor</th>
                  <th className="px-5 py-2.5 font-medium">Motivo</th>
                  <th className="px-5 py-2.5 font-medium text-right">Data/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {history.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/35">
                    <td className="px-5 py-3 font-semibold text-neutral-800">{log.participante}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-0.5 font-mono font-bold px-1.5 py-0.5 rounded-sm ${
                        log.pontos > 0 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {log.pontos > 0 ? (
                          <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {log.pontos > 0 ? `+${log.pontos}` : log.pontos} pts
                      </span>
                    </td>
                    <td className="px-5 py-3 text-neutral-600 font-medium">{log.motivo}</td>
                    <td className="px-5 py-3 text-right text-neutral-400 font-mono">{formatDateTime(log.data_hora)}</td>
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
