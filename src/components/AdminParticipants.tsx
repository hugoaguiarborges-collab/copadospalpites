import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Participante } from '../types';
import { Plus, Trash, Edit, Check, X, ShieldAlert } from 'lucide-react';

export default function AdminParticipants() {
  const [participants, setParticipants] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNome, setNewNome] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNome, setEditingNome] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadParticipants = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'participantes'));
      const list: Participante[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Participante);
      });
      // Sort alphabetically
      list.sort((a,b) => a.nome.localeCompare(b.nome));
      setParticipants(list);
    } catch (err) {
      console.error("Error loading participants in Admin", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParticipants();
  }, []);

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newNome.trim()) {
      setErrorMsg('O nome do participante é obrigatório.');
      return;
    }

    // Check if name already exists
    const exists = participants.some(p => p.nome.trim().toLowerCase() === newNome.trim().toLowerCase());
    if (exists) {
      setErrorMsg('Este participante já está cadastrado.');
      return;
    }

    try {
      const customId = newNome.trim().toLowerCase().replace(/\s+/g, '-');
      // Create with 0 base points directly using setDoc
      await setDoc(doc(db, 'participantes', customId), {
        nome: newNome.trim(),
        pontos: 0
      });

      setSuccessMsg(`Participante "${newNome}" cadastrado com sucesso.`);
      setNewNome('');
      loadParticipants();
    } catch (err: any) {
      console.error("Error adding participant", err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `participantes`);
      } catch (formattedErr: any) {
        // Keep the original or formatted error message
      }
      setErrorMsg(`Erro ao cadastrar participante: ${err?.message || err}`);
    }
  };

  const handleStartEdit = (p: Participante) => {
    setEditingId(p.id);
    setEditingNome(p.nome);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingNome('');
  };

  const handleSaveEdit = async (p: Participante) => {
    if (!editingNome.trim()) {
      setErrorMsg('Nome não pode ser vazio.');
      return;
    }

    try {
      await updateDoc(doc(db, 'participantes', p.id), {
        nome: editingNome.trim()
      });
      setSuccessMsg('Participante atualizado com sucesso.');
      setEditingId(null);
      loadParticipants();
    } catch (err: any) {
      console.error("Error updating participant name", err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `participantes/${p.id}`);
      } catch (fErr) {}
      setErrorMsg(`Erro ao editar participante: ${err?.message || err}`);
    }
  };

  const handleDeleteParticipant = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o participante "${name}"? Todos os pontos dele serão inativados.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'participantes', id));
      setSuccessMsg(`Participante "${name}" removido com sucesso.`);
      loadParticipants();
    } catch (err: any) {
      console.error("Error deleting participant", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `participantes/${id}`);
      } catch (fErr) {}
      setErrorMsg(`Erro ao excluir participante: ${err?.message || err}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-neutral-100 pb-3">
        <h3 className="text-lg font-semibold font-display text-neutral-800">Gerenciar Participantes</h3>
        <p className="text-xs text-neutral-400">Adicione, edite ou remova os participantes oficiais da competição.</p>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleAddParticipant} className="flex gap-2 max-w-md">
        <input
          type="text"
          placeholder="Nome do novo participante"
          value={newNome}
          onChange={(e) => setNewNome(e.target.value)}
          className="bg-neutral-50 border border-neutral-200 text-sm rounded-lg px-3 py-2 w-full focus:outline-hidden text-neutral-800 focus:bg-white focus:ring-1 focus:ring-neutral-400"
        />
        <button
          type="submit"
          className="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-800 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Cadastrar
        </button>
      </form>

      {/* List of participants */}
      <div className="bg-white rounded-xl border border-neutral-150 overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">Lista de Participantes ({participants.length})</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-400 font-mono">Buscando participantes...</div>
        ) : participants.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">Nenhum participante cadastrado. Use o formulário acima para adicionar o primeiro.</div>
        ) : (
          <div className="divide-y divide-neutral-150">
            {participants.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between text-sm">
                {editingId === p.id ? (
                  <div className="flex items-center gap-2 w-full max-w-sm">
                    <input
                      type="text"
                      value={editingNome}
                      onChange={(e) => setEditingNome(e.target.value)}
                      className="bg-white border border-neutral-250 rounded-md px-2 py-1 text-xs w-full text-neutral-800"
                    />
                    <button 
                      onClick={() => handleSaveEdit(p)}
                      className="p-1 rounded bg-neutral-100 text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handleCancelEdit}
                      className="p-1 rounded bg-neutral-100 text-neutral-500 hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium text-neutral-800">{p.nome}</div>
                    <div className="text-[10px] font-mono text-neutral-400 mt-0.5">ID: {p.id} • {p.pontos} Pts Acumulados</div>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleStartEdit(p)}
                    className="p-1.5 text-neutral-500 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                    title="Editar nome"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteParticipant(p.id, p.nome)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                    title="Excluir participante"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
