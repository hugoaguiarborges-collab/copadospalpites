import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada } from '../types';
import { Calendar, Plus, Edit, Trash, Check, X, ShieldAlert, Star } from 'lucide-react';

export default function AdminRounds() {
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [loading, setLoading] = useState(true);

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
      // Sort: older rounds first, or newer first? Let's sort oldest closing to newest closing so sequence is logical
      list.sort((a,b) => new Date(a.fechamento).getTime() - new Date(b.fechamento).getTime());
      setRounds(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Make sure we have dates prefilled nicely
    const now = new Date();
    setAbertura(toLocalDateTimeString(now.toISOString()));
    
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    setFechamento(toLocalDateTimeString(tomorrow.toISOString()));

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
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">Rodadas Cadastradas ({rounds.length})</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-400 font-mono">Buscando rodadas...</div>
        ) : rounds.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">Nenhuma rodada cadastrada. Crie uma usando o formulário acima.</div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {rounds.map((r) => {
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
                          <h5 className="font-semibold text-neutral-800 text-sm font-display">{r.nome}</h5>
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

                      <div className="flex items-center gap-1.5">
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
