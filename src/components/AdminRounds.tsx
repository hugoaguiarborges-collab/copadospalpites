import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  setDoc,
  query,
  where,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada } from '../types';
import { getNextTuesday13h, getNextWednesday13h, getClosingForNextRound, getClosingForRound, formatDateTimeDisplay, getRoundNumber, sortRoundsChronologically } from '../utils/dateUtils';
import { Calendar, Plus, Edit, Trash, Check, X, ShieldAlert, Star, Search, Unlock, Lock, FlaskConical, Play, RefreshCw, AlertTriangle, Sparkles, Globe, RotateCcw } from 'lucide-react';
import { restoreOfficialGuesses } from '../utils/backupGuesses';
import { fetchUclFixturesWithAI, REAL_UCL_FIXTURES } from '../constants/uclFixtures';
import { JogoDisponivel } from '../types';
import { deleteRoundCascade } from '../utils/deleteRoundCascade';

export default function AdminRounds() {
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [loading, setLoading] = useState(true);
  const [roundSearch, setRoundSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todos' | 'aberta' | 'encerrada'>('todos');

  // Form states
  const [nome, setNome] = useState('');
  const [abertura, setAbertura] = useState('');
  const [fechamento, setFechamento] = useState('');
  const [status, setStatus] = useState<'aberta' | 'encerrada'>('aberta');

  // Editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editAbertura, setEditAbertura] = useState('');
  const [editFechamento, setEditFechamento] = useState('');
  const [editStatus, setEditStatus] = useState<'aberta' | 'encerrada'>('aberta');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  // In-App Modal confirmation for deleting round with cascade (replaces window.confirm)
  const [roundToDelete, setRoundToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingRound, setIsDeletingRound] = useState(false);

  // AI Matches Retrieval state
  const [aiTargetRoundId, setAiTargetRoundId] = useState<string>('');
  const [aiDateInput, setAiDateInput] = useState<string>('20/10');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiFoundMatches, setAiFoundMatches] = useState<JogoDisponivel[]>([]);
  const [aiMsg, setAiMsg] = useState<string>('');

  const handleSearchMatchesWithAI = async () => {
    if (!aiTargetRoundId) {
      setErrorMsg('Selecione uma rodada para vincular os jogos.');
      return;
    }
    setErrorMsg('');
    setAiMsg('');
    setAiLoading(true);
    try {
      const targetR = rounds.find(r => r.id === aiTargetRoundId);
      const res = await fetchUclFixturesWithAI(aiDateInput, targetR?.nome);
      if (res.success && res.matches.length > 0) {
        setAiFoundMatches(res.matches);
        setAiMsg(`IA obteve ${res.matches.length} jogos oficiais da rodada de ${aiDateInput} (${res.source === 'gemini_search_grounding' ? 'Busca em tempo real Google Search' : 'Calendário Oficial Verificado UEFA'}).`);
      } else {
        setErrorMsg('Nenhum jogo encontrado para esta data.');
      }
    } catch (err: any) {
      setErrorMsg(`Erro na busca de jogos: ${err?.message || err}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveAIMatchesToRound = async () => {
    if (!aiTargetRoundId || aiFoundMatches.length === 0) return;
    setErrorMsg('');
    try {
      await updateDoc(doc(db, 'rodadas', aiTargetRoundId), {
        jogos_disponiveis: aiFoundMatches,
        data_jogos: aiDateInput
      });
      setSuccessMsg(`Jogos oficiais (${aiFoundMatches.length} partidas) vinculados com sucesso à rodada!`);
      setAiFoundMatches([]);
      setAiMsg('');
      loadRounds();
    } catch (err: any) {
      setErrorMsg('Erro ao salvar jogos na rodada.');
    }
  };

  const loadRounds = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'rodadas'));
      const list: Rodada[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Rodada);
      });
      // Sort: by round sequence number
      const sortedList = sortRoundsChronologically(list);
      setRounds(sortedList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setAbertura(toLocalDateTimeString(now.toISOString()));
    
    // Fechamento padrão: próxima terça-feira às 13:00!
    const nextTuesday13h = getNextTuesday13h(now);
    setFechamento(toLocalDateTimeString(nextTuesday13h.toISOString()));

    loadRounds();
  }, []);

  const toLocalDateTimeString = (isoString: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const formatDateTimeDisplay = (isoString: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return isoString;
    }
  };

  const handleCreateRound = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!nome.trim()) {
      setErrorMsg('O nome da rodada é obrigatório.');
      return;
    }
    if (!abertura) {
      setErrorMsg('A data de abertura é obrigatória.');
      return;
    }
    if (!fechamento) {
      setErrorMsg('A data de fechamento é obrigatória.');
      return;
    }

    const startISO = new Date(abertura).toISOString();
    const endISO = new Date(fechamento).toISOString();

    if (startISO >= endISO) {
      setErrorMsg('A data de abertura deve ser anterior à data de fechamento.');
      return;
    }

    setSubmitLoading(true);
    try {
      const customId = `rodada-${Date.now()}`;
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'rodadas', customId), {
        nome: nome.trim(),
        abertura: startISO,
        fechamento: endISO,
        status: status
      });

      setSuccessMsg(`Rodada "${nome}" criada com sucesso.`);
      setNome('');
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao criar rodada.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleStartEdit = (r: Rodada) => {
    setEditingId(r.id);
    setEditNome(r.nome);
    setEditAbertura(toLocalDateTimeString(r.abertura));
    setEditFechamento(toLocalDateTimeString(r.fechamento));
    setEditStatus(r.status);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: string) => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!editNome.trim()) {
      setErrorMsg('O nome da rodada é obrigatório.');
      return;
    }
    if (!editAbertura || !editFechamento) {
      setErrorMsg('Datas são obrigatórias.');
      return;
    }

    const startISO = new Date(editAbertura).toISOString();
    const endISO = new Date(editFechamento).toISOString();

    if (startISO >= endISO) {
      setErrorMsg('Abertura deve ser anterior ao fechamento.');
      return;
    }

    try {
      await updateDoc(doc(db, 'rodadas', id), {
        nome: editNome.trim(),
        abertura: startISO,
        fechamento: endISO,
        status: editStatus
      });

      setSuccessMsg('Rodada editada com sucesso.');
      setEditingId(null);
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao salvar rodada.');
    }
  };

  const handleDeleteRound = (id: string, name: string) => {
    setRoundToDelete({ id, name });
  };

  const executeConfirmDeleteRound = async () => {
    if (!roundToDelete) return;
    setIsDeletingRound(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const result = await deleteRoundCascade(roundToDelete.id, roundToDelete.name);
      setSuccessMsg(`🏆 Rodada "${roundToDelete.name}" e todos os seus ${result.deletedPalpitesCount} palpites e pontos foram APAGADOS com sucesso!`);
      setRoundToDelete(null);
      await loadRounds();
    } catch (err: any) {
      console.error("Erro ao apagar rodada com cascata:", err);
      setErrorMsg(`Erro ao apagar rodada: ${err?.message || err}`);
    } finally {
      setIsDeletingRound(false);
    }
  };

  const handleQuickOpenRound = async (r: Rodada) => {
    const now = new Date();
    const { fechamento: nextClosing, targetDayName } = getClosingForRound(r, now);
    try {
      await updateDoc(doc(db, 'rodadas', r.id), {
        status: 'aberta',
        abertura: now.toISOString(),
        fechamento: nextClosing.toISOString()
      });
      setSuccessMsg(`Mercado da ${r.nome} ABERTO! Fechamento na ${targetDayName} (${formatDateTimeDisplay(nextClosing.toISOString())}).`);
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao abrir mercado da rodada.');
    }
  };

  const handleQuickCloseRound = async (r: Rodada) => {
    try {
      await updateDoc(doc(db, 'rodadas', r.id), {
        status: 'encerrada'
      });
      setSuccessMsg(`Mercado da ${r.nome} encerrado.`);
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao fechar mercado da rodada.');
    }
  };

  const handleRestoreOfficialGuesses = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const activeOrFirst = rounds.find(r => r.status === 'aberta') || rounds[0];
      const targetId = activeOrFirst?.id || 'round-1';
      const count = await restoreOfficialGuesses(targetId);
      setSuccessMsg(`✅ ${count} palpites oficiais dos 7 participantes recuperados com sucesso para a ${activeOrFirst?.nome || 'Rodada 1'}!`);
      loadRounds();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Erro ao recuperar palpites: ${err?.message || err}`);
    }
  };


  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-100 pb-3">
        <h3 className="text-lg font-semibold font-display text-neutral-800">Gerenciar Rodadas</h3>
        <p className="text-xs text-neutral-400">Crie, ative ou modifique as rodadas oficiais, regulando as janelas de palpites.</p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <Star className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* CONTROLE RÁPIDO DO MERCADO E RECUPERAÇÃO DE PALPITES */}
      {(() => {
        const activeOrFirst = rounds.find(r => r.status === 'aberta') || rounds[0];
        if (!activeOrFirst) return null;
        const isMarketOpen = activeOrFirst.status === 'aberta';

        return (
          <div className="bg-[#050b28] border-2 border-cyan-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-cyan-300 font-mono">
                    Controle Direto do Mercado:
                  </span>
                  <span className="text-sm font-black text-white">{activeOrFirst.nome}</span>
                  {isMarketOpen ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                      ● Aberto
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-950 text-rose-300 border border-rose-500/50 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Fechado
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Abra ou feche o mercado desta rodada imediatamente, ou recupere os palpites oficiais enviados pelos participantes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isMarketOpen ? (
                  <button
                    type="button"
                    onClick={() => handleQuickCloseRound(activeOrFirst)}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-950/60"
                  >
                    <Lock className="w-3.5 h-3.5" /> Fechar Mercado Agora
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleQuickOpenRound(activeOrFirst)}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/60"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Abrir Mercado Agora
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRestoreOfficialGuesses}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-950/60"
                  title="Recupera todos os palpites dos 7 participantes salvos no backup"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Recuperar Palpites
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SEÇÃO IA: BUSCA AUTOMÁTICA DE JOGOS REAIS COM GOOGLE SEARCH */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-[#071138] to-blue-950/40 border-2 border-cyan-500/30 rounded-2xl p-5 shadow-xl space-y-4 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-500/20 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-900/60 border border-cyan-400/40 text-cyan-300 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black uppercase text-white tracking-wide">
                  IA: Preenchimento Automático dos Jogos Oficiais da Rodada
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-mono">
                  Google Search Grounding
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                A IA pesquisa nos sites de esportes (UEFA.com, ESPN, GE) os jogos reais da rodada e os disponibiliza para os participantes escolherem 5 partidas.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1 font-mono">
              Vincular à Rodada:
            </label>
            <select
              value={aiTargetRoundId}
              onChange={(e) => setAiTargetRoundId(e.target.value)}
              className="w-full bg-[#04081c] border border-cyan-800 text-white rounded-xl text-xs py-2 px-3 font-mono font-bold"
            >
              <option value="">Selecione a rodada...</option>
              {rounds.map(r => (
                <option key={r.id} value={r.id}>
                  {r.nome} {r.status === 'aberta' ? '(Aberta)' : '(Encerrada)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1 font-mono">
              Data da Rodada (ex: 20/10 ou 21/10):
            </label>
            <input
              type="text"
              placeholder="Ex: 20/10 ou 21/10"
              value={aiDateInput}
              onChange={(e) => setAiDateInput(e.target.value)}
              className="w-full bg-[#04081c] border border-cyan-800 text-white rounded-xl text-xs py-2 px-3 font-mono font-bold placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              disabled={aiLoading || !aiTargetRoundId}
              onClick={handleSearchMatchesWithAI}
              className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-xl text-xs font-black uppercase text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-cyan-950/60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {aiLoading ? 'Buscando nos Sites...' : 'Buscar Jogos Reais com IA'}
            </button>
          </div>
        </div>

        {aiMsg && (
          <div className="p-3 bg-cyan-950/80 border border-cyan-500/40 rounded-xl text-xs text-cyan-200 font-mono">
            {aiMsg}
          </div>
        )}

        {aiFoundMatches.length > 0 && (
          <div className="space-y-3 p-3 bg-[#03071c] rounded-xl border border-cyan-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-cyan-300 font-mono">
                Confrontos Reais Encontrados ({aiFoundMatches.length} jogos):
              </span>
              <button
                type="button"
                onClick={handleSaveAIMatchesToRound}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-lg cursor-pointer flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Salvar e Disponibilizar nesta Rodada
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {aiFoundMatches.map((m, idx) => (
                <div key={idx} className="p-2 rounded bg-[#071138] border border-cyan-900/60 text-xs flex items-center justify-between">
                  <span className="font-bold text-white">
                    {m.time_mandante} vs {m.time_visitante}
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">
                    {m.horario}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* Create Round form */}
      <div className="bg-white rounded-xl border border-neutral-150 p-5 shadow-xs max-w-2xl">
        <h4 className="text-sm font-semibold text-neutral-700 mb-4 flex items-center gap-1.5"><Plus className="w-4 h-4 text-neutral-500" /> Criar Nova Rodada</h4>
        <form onSubmit={handleCreateRound} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="round-nome" className="block text-xs font-semibold text-neutral-550 mb-1">Nome da Rodada</label>
              <input
                id="round-nome"
                type="text"
                placeholder="Ex: Rodada 1 - Fase de Grupos"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-xs focus:outline-hidden text-neutral-800"
              />
            </div>
            <div>
              <label htmlFor="round-status" className="block text-xs font-semibold text-neutral-550 mb-1">Status Inicial</label>
              <select
                id="round-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'aberta' | 'encerrada')}
                className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-xs text-neutral-800 focus:outline-hidden"
              >
                <option value="aberta">Aberta (Aceita palpites dentro das datas)</option>
                <option value="encerrada">Encerrada (Palpites públicos, mercado fechado)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="round-open" className="block text-xs font-semibold text-neutral-550 mb-1">Data/Hora de Abertura</label>
              <input
                id="round-open"
                type="datetime-local"
                value={abertura}
                onChange={(e) => setAbertura(e.target.value)}
                className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-xs focus:outline-hidden text-neutral-800"
              />
            </div>
            <div>
              <label htmlFor="round-close" className="block text-xs font-semibold text-neutral-550 mb-1">Data/Hora de Fechamento (Fim de Mercado)</label>
              <input
                id="round-close"
                type="datetime-local"
                value={fechamento}
                onChange={(e) => setFechamento(e.target.value)}
                className="w-full px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-md text-xs focus:outline-hidden text-neutral-800"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitLoading}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-medium cursor-pointer"
          >
            {submitLoading ? 'Criando...' : 'Salvar Rodada'}
          </button>
        </form>
      </div>

      {/* Rounds list table */}
      <div className="bg-white rounded-xl border border-neutral-150 overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider font-bold">
              Rodadas ({rounds.length})
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              {rounds.filter(r => r.status === 'aberta').length} Aberta(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            <div className="flex bg-neutral-200/60 p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setFilterStatus('todos')}
                className={`px-2 py-1 rounded-md font-bold transition-all ${
                  filterStatus === 'todos' ? 'bg-white text-neutral-800 shadow-2xs' : 'text-neutral-500'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('aberta')}
                className={`px-2 py-1 rounded-md font-bold transition-all ${
                  filterStatus === 'aberta' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-neutral-500'
                }`}
              >
                Abertas
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('encerrada')}
                className={`px-2 py-1 rounded-md font-bold transition-all ${
                  filterStatus === 'encerrada' ? 'bg-white text-neutral-800 shadow-2xs' : 'text-neutral-500'
                }`}
              >
                Encerradas
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar rodada..."
                value={roundSearch}
                onChange={(e) => setRoundSearch(e.target.value)}
                className="pl-7 pr-2.5 py-1 text-xs bg-white border border-neutral-200 rounded-md w-36 focus:outline-hidden focus:ring-1 focus:ring-neutral-400"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-400 font-mono">Buscando rodadas...</div>
        ) : rounds.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">Nenhuma rodada cadastrada. Crie uma usando o formulário acima.</div>
        ) : (
          <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
            {rounds
              .filter(r => {
                if (roundSearch.trim()) {
                  const term = roundSearch.toLowerCase();
                  if (!r.nome.toLowerCase().includes(term) && !r.id.toLowerCase().includes(term)) {
                    return false;
                  }
                }
                if (filterStatus === 'aberta') return r.status === 'aberta';
                if (filterStatus === 'encerrada') return r.status === 'encerrada';
                return true;
              })
              .map((r) => {
              const isEditing = editingId === r.id;
              const isPast = new Date() >= new Date(r.fechamento);

              return (
                <div key={r.id} className="p-4 hover:bg-neutral-50/20 transition-colors">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Nome</label>
                          <input
                            type="text"
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                            className="w-full px-2.5 py-1 bg-white border border-neutral-200 rounded text-xs text-neutral-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Abertura</label>
                          <input
                            type="datetime-local"
                            value={editAbertura}
                            onChange={(e) => setEditAbertura(e.target.value)}
                            className="w-full px-2.5 py-1 bg-white border border-neutral-200 rounded text-xs text-neutral-800"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Fechamento</label>
                          <input
                            type="datetime-local"
                            value={editFechamento}
                            onChange={(e) => setEditFechamento(e.target.value)}
                            className="w-full px-2.5 py-1 bg-white border border-neutral-200 rounded text-xs text-neutral-800"
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-[10px] font-semibold text-neutral-500 block mb-0.5">Status da Rodada</label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as 'aberta' | 'encerrada')}
                            className="px-2.5 py-1 bg-white border border-neutral-200 rounded text-xs text-neutral-800 focus:outline-hidden"
                          >
                            <option value="aberta">Aberta</option>
                            <option value="encerrada">Encerrada</option>
                          </select>
                        </div>
                        <div className="flex gap-1.5 self-end">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(r.id)}
                            className="px-2.5 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Salvar
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h5 className="font-semibold text-neutral-800 text-sm font-display flex items-center gap-1.5">
                            {r.nome}
                            {(r.is_test || r.id === 'rodada-teste') && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200">
                                🧪 Rodada de Teste
                              </span>
                            )}
                          </h5>
                          {r.status === 'aberta' && !isPast ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                              Aberto
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-neutral-100 text-neutral-500 border border-neutral-200">
                              Fechado
                            </span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-neutral-400">
                          <p>Abertura: <span className="font-mono text-neutral-600 font-medium">{formatDateTimeDisplay(r.abertura)}</span></p>
                          <p>Fechamento: <span className="font-mono text-neutral-600 font-medium">{formatDateTimeDisplay(r.fechamento)}</span></p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {r.status === 'encerrada' ? (
                          <button
                            type="button"
                            onClick={() => handleQuickOpenRound(r)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Abrir mercado agora até a próxima terça 13h"
                          >
                            <Unlock className="w-3.5 h-3.5" /> Abrir Mercado
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleQuickCloseRound(r)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Fechar mercado desta rodada"
                          >
                            <Lock className="w-3.5 h-3.5" /> Fechar Mercado
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartEdit(r)}
                          className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded-md transition-all cursor-pointer"
                          title="Editar datas/status"
                        >
                          <Edit className="w-4.5 h-4.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRound(r.id, r.nome)}
                          className="p-2 text-rose-500 hover:text-white hover:bg-rose-600 active:bg-rose-700 rounded-lg transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center min-w-[36px] min-h-[36px]"
                          title="Excluir rodada e seus palpites/pontos"
                          aria-label={`Excluir rodada ${r.nome}`}
                        >
                          <Trash className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE RODADA (100% SEGURO NO MOBILE / IFRAME) */}
      {roundToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#080f33] border border-rose-500/50 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-950/80 border border-rose-500/50 flex items-center justify-center shrink-0 shadow-md">
                <Trash className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h4 className="text-base font-black font-display text-white uppercase">
                  Excluir Rodada
                </h4>
                <span className="text-xs text-rose-300 font-bold font-mono">
                  {roundToDelete.name}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza que deseja apagar a rodada <strong>{roundToDelete.name}</strong>?
            </p>

            <ul className="text-xs text-slate-300 space-y-1.5 bg-[#050a24] p-3 rounded-xl border border-rose-500/20 font-mono">
              <li className="flex items-start gap-1.5">
                <span className="text-rose-400 font-bold">✕</span>
                <span>A rodada será permanentemente removida.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-400 font-bold">✕</span>
                <span>Todos os palpites enviados para ela serão apagados.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-rose-400 font-bold">✕</span>
                <span>Os pontos concedidos aos participantes nesta rodada serão <strong>estornados</strong> da classificação geral.</span>
              </li>
            </ul>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-rose-500/20">
              <button
                type="button"
                onClick={() => setRoundToDelete(null)}
                disabled={isDeletingRound}
                className="px-4 py-2 bg-[#050b28] hover:bg-[#0c164a] text-slate-300 hover:text-white rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer border border-cyan-500/20"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeConfirmDeleteRound}
                disabled={isDeletingRound}
                className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white rounded-xl text-xs font-black uppercase font-mono tracking-wider transition-all shadow-lg shadow-rose-950/60 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingRound ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Apagando...</span>
                  </>
                ) : (
                  <>
                    <Trash className="w-3.5 h-3.5 text-white" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
