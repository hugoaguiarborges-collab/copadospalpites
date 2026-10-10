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
import { getNextTuesday13h, formatDateTimeDisplay, getRoundNumber } from '../utils/dateUtils';
import { Calendar, Plus, Edit, Trash, Check, X, ShieldAlert, Star, Search, Unlock, Lock, FlaskConical, Play, RefreshCw, AlertTriangle } from 'lucide-react';

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

  const loadRounds = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'rodadas'));
      const list: Rodada[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Rodada);
      });
      // Sort: by round sequence number
      list.sort((a,b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
      setRounds(list);
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

  const handleDeleteRound = async (id: string, name: string) => {
    if (!confirm(`Excluir a "${name}"? Os palpites da rodada continuarão no banco mas o mercado será excluído.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'rodadas', id));
      setSuccessMsg(`Rodada "${name}" deletada com sucesso.`);
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao deletar rodada.');
    }
  };

  const handleQuickOpenRound = async (r: Rodada) => {
    const now = new Date();
    const nextClosing = getNextTuesday13h(now);
    try {
      await updateDoc(doc(db, 'rodadas', r.id), {
        status: 'aberta',
        abertura: now.toISOString(),
        fechamento: nextClosing.toISOString()
      });
      setSuccessMsg(`Mercado da ${r.nome} ABERTO! Fechamento na terça-feira às 13:00 (${formatDateTimeDisplay(nextClosing.toISOString())}).`);
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

  // Controles Exclusivos da Rodada de Teste
  const testRound = rounds.find(r => r.is_test || r.id === 'rodada-teste');

  const handleActivateTestRound = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const now = new Date();
      // Fechamento da rodada de teste: 30 dias à frente (controlado manualmente pelo admin)
      const testClose = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      await setDoc(doc(db, 'rodadas', 'rodada-teste'), {
        nome: 'Rodada de Teste',
        abertura: now.toISOString(),
        fechamento: testClose.toISOString(),
        status: 'aberta',
        is_test: true
      });

      setSuccessMsg('🧪 Rodada de Teste ATIVADA e com mercado ABERTO! Você pode abrir e fechar o mercado livremente.');
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao ativar rodada de teste.');
    }
  };

  const handleToggleTestMarket = async (newStatus: 'aberta' | 'encerrada') => {
    if (!testRound) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const now = new Date();
      const testClose = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await updateDoc(doc(db, 'rodadas', testRound.id), {
        status: newStatus,
        abertura: now.toISOString(),
        fechamento: newStatus === 'aberta' ? testClose.toISOString() : now.toISOString()
      });

      setSuccessMsg(newStatus === 'aberta' 
        ? '🧪 Mercado da Rodada de Teste ABERTO! Os palpites já podem ser enviados.' 
        : '🧪 Mercado da Rodada de Teste FECHADO com sucesso!'
      );
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao alterar mercado da rodada de teste.');
    }
  };

  const handleDeleteTestRound = async () => {
    if (!testRound) return;
    if (!confirm('Deseja realmente APAGAR a rodada de teste? Isso removerá a rodada de teste e os palpites de teste associados, iniciando oficialmente o campeonato oficial com sigilo absoluto.')) {
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    try {
      // 1. Deletar documento da rodada de teste
      await deleteDoc(doc(db, 'rodadas', testRound.id));

      // 2. Limpar palpites vinculados à rodada de teste
      try {
        const qPalpites = query(collection(db, 'palpites'), where('rodada', '==', testRound.id));
        const pSnap = await getDocs(qPalpites);
        const pDeletes = pSnap.docs.map(d => deleteDoc(doc(db, 'palpites', d.id)));
        await Promise.all(pDeletes);
      } catch (errP) {
        console.warn("Erro ao limpar palpites da rodada de teste:", errP);
      }

      // 3. Limpar resultados oficiais vinculados à rodada de teste se houver
      try {
        const qOficiais = query(collection(db, 'resultados_oficiais'), where('rodada_id', '==', testRound.id));
        const ofSnap = await getDocs(qOficiais);
        const ofDeletes = ofSnap.docs.map(d => deleteDoc(doc(db, 'resultados_oficiais', d.id)));
        await Promise.all(ofDeletes);
      } catch (errOf) {
        console.warn("Erro ao limpar resultados oficiais da rodada de teste:", errOf);
      }

      setSuccessMsg('🏆 Rodada de teste APAGADA com sucesso! O campeonato oficial agora começa oficialmente com todas as regras de sigilo e fechamento às terças 13h.');
      loadRounds();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao apagar rodada de teste.');
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

      {/* SEÇÃO EXCLUSIVA: RODADA DE TESTE */}
      <div className="bg-gradient-to-r from-purple-50 via-white to-purple-50/50 border-2 border-purple-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black uppercase text-purple-900 tracking-wide">
                  Controle Exclusivo da Rodada de Teste
                </h4>
                {testRound ? (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    testRound.status === 'aberta' 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                      : 'bg-neutral-100 text-neutral-600 border border-neutral-300'
                  }`}>
                    {testRound.status === 'aberta' ? '● Mercado de Teste Aberto' : '○ Mercado de Teste Fechado'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-neutral-100 text-neutral-500">
                    Não Ativada
                  </span>
                )}
              </div>
              <p className="text-xs text-purple-700/80 mt-0.5 font-medium">
                Abra e feche o mercado livremente para testes. Ao apagar esta rodada de teste, o campeonato oficial começa com sigilo absoluto.
              </p>
            </div>
          </div>

          {!testRound ? (
            <button
              type="button"
              onClick={handleActivateTestRound}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-xs transition-colors shrink-0"
            >
              <Play className="w-4 h-4" /> Ativar Rodada de Teste
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDeleteTestRound}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-xs transition-colors shrink-0"
              title="Apagar rodada de teste e iniciar campeonato oficial"
            >
              <Trash className="w-4 h-4" /> Apagar Rodada de Teste
            </button>
          )}
        </div>

        {testRound ? (
          <div className="bg-white/80 rounded-xl border border-purple-100 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-xs text-neutral-600">
              <p className="font-bold text-neutral-800">
                Nome: <span className="font-mono text-purple-900 font-black">{testRound.nome}</span> (ID: <span className="font-mono text-neutral-500">{testRound.id}</span>)
              </p>
              <p>
                Status atual: <strong className={testRound.status === 'aberta' ? 'text-emerald-700' : 'text-neutral-500'}>
                  {testRound.status === 'aberta' ? 'ABERTA (Permite palpites na caixinha)' : 'FECHADA (Mercado travado)'}
                </strong>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {testRound.status === 'encerrada' ? (
                <button
                  type="button"
                  onClick={() => handleToggleTestMarket('aberta')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <Unlock className="w-4 h-4" /> Abrir Mercado de Teste
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleToggleTestMarket('encerrada')}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <Lock className="w-4 h-4" /> Fechar Mercado de Teste
                </button>
              )}

              <button
                type="button"
                onClick={handleDeleteTestRound}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash className="w-3.5 h-3.5" /> Excluir Teste
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-neutral-500 bg-white/60 p-3 rounded-lg border border-purple-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-purple-500 shrink-0" />
            <span>
              A rodada de teste não está ativa no momento. Clique no botão <strong>Ativar Rodada de Teste</strong> acima para criá-la e testar a abertura/fechamento do mercado.
            </span>
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
                            onClick={() => handleSaveEdit(r.id)}
                            className="px-2.5 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> Salvar
                          </button>
                          <button
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
                          onClick={() => handleStartEdit(r)}
                          className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded-md transition-all cursor-pointer"
                          title="Editar datas/status"
                        >
                          <Edit className="w-4.5 h-4.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRound(r.id, r.nome)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                          title="Excluir rodada"
                        >
                          <Trash className="w-4.5 h-4.5" />
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
    </div>
  );
}
