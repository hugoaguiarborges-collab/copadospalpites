import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Participante } from '../types';
import { Trophy, Users, Award, Zap, Shield, User, TrendingUp, Target, Crown, ChevronRight } from 'lucide-react';
import ParticipantProfileModal from './ParticipantProfileModal';

export default function LeaderboardPage() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfileParticipant, setSelectedProfileParticipant] = useState<string | null>(null);

  // Auto updating listener for real-time responsiveness
  useEffect(() => {
    const q = query(
      collection(db, 'participantes'),
      orderBy('pontos', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pList: Participante[] = [];
      snapshot.forEach((doc) => {
        pList.push({ id: doc.id, ...doc.data() } as Participante);
      });
      setParticipantes(pList);
      setLoading(false);
    }, (err) => {
      console.error("Error listening to participants leaderboard", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute leaderboard aggregated metrics
  const totalParticipantes = participantes.length;
  const lider = totalParticipantes > 0 ? participantes[0] : null;
  const liderPontos = lider ? lider.pontos : 0;

  return (
    <div className="space-y-6">
      {/* Page header with green accent block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-neutral-200 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-neutral-800 uppercase flex items-center gap-2 font-display">
            <span className="w-2.5 h-6 bg-[#009739] block rounded-sm"></span>
            Classificação Geral
          </h1>
          <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-bold">
            Pontuações combinadas registradas e calculadas em tempo real pelas avaliações administrativas.
          </p>
        </div>

        {/* Botão rápido para abrir perfil de qualquer participante */}
        {participantes.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setSelectedProfileParticipant(e.target.value);
              }}
              className="bg-white border-2 border-emerald-600/30 hover:border-emerald-600 text-neutral-800 text-xs font-bold py-2 px-3 rounded-lg shadow-xs cursor-pointer focus:outline-hidden"
            >
              <option value="">👤 Ver Perfil de um Participante...</option>
              {[...participantes].sort((a,b) => a.nome.localeCompare(b.nome)).map(p => (
                <option key={p.id} value={p.nome}>
                  {p.nome} ({p.pontos} pts)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Destaque explicativo sobre os perfis individuais */}
      <div className="bg-gradient-to-r from-emerald-50 via-white to-emerald-50/50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#009739] text-white flex items-center justify-center font-black shrink-0 shadow-xs">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase text-emerald-900 tracking-wide">
              Novo: Perfis e Gráficos Individuais
            </h4>
            <p className="text-[11px] text-emerald-800/80 font-medium">
              Clique em qualquer participante na tabela para ver o <strong>gráfico de variação de posições</strong>, o total de <strong>acertos de placar</strong>, <strong>acertos de resultado</strong> e <strong>gols de capitão</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total stats */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-neutral-105 text-neutral-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider">Total Participantes</div>
            <div className="text-lg font-black text-neutral-800 leading-tight">{totalParticipantes}</div>
          </div>
        </div>

        {/* Current leader */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-green-50 text-green-600">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider">Líder Atual</div>
            <div className="text-lg font-black text-green-700 leading-tight truncate max-w-[200px]">
              {lider ? lider.nome : 'Nenhum'}
            </div>
          </div>
        </div>

        {/* Leader score */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-yellow-50 text-yellow-600">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-neutral-400 uppercase font-black tracking-wider">Pontos do Líder</div>
            <div className="text-lg font-black text-neutral-800 leading-tight">{liderPontos} Pts</div>
          </div>
        </div>
      </div>

      {/* Main Leaderboard Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
          <h3 className="font-bold text-neutral-700 text-xs uppercase tracking-widest">Tabela de Classificação</h3>
          <span className="text-[9px] bg-neutral-100 border border-neutral-200 text-neutral-500 font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm">
            RANKING DO SISTEMA
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-neutral-450 font-mono font-bold animate-pulse">
            Carregando tabela de classificação...
          </div>
        ) : participantes.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 text-xs font-bold uppercase">
            Nenhum participante cadastrado no momento. Acesse a aba de Administração para cadastrar os participantes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-[10px] font-bold uppercase text-neutral-400 bg-neutral-50/40">
                  <th className="px-5 py-2.5 text-center w-24">Posição</th>
                  <th className="px-5 py-2.5">Participante</th>
                  <th className="px-5 py-2.5 text-right w-36">Pontuação</th>
                  <th className="px-5 py-2.5 text-center w-32">Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {participantes.map((p, index) => {
                  const position = index + 1;
                  const isTopOne = position === 1;
                  const isTopTwo = position === 2;
                  const isTopThree = position === 3;
                  const isLast = index === participantes.length - 1;

                  return (
                    <tr 
                      key={p.id} 
                      onClick={() => setSelectedProfileParticipant(p.nome)}
                      className={`hover:bg-emerald-50/40 transition-colors cursor-pointer group ${
                        isTopOne ? 'bg-green-50/10' : ''
                      }`}
                      title={`Clique para ver o perfil completo de ${p.nome}`}
                    >
                      <td className="px-5 py-3 text-center">
                        {isTopOne && (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-black text-xs shadow-xs">
                            1
                          </div>
                        )}
                        {isTopTwo && (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs">
                            2
                          </div>
                        )}
                        {isTopThree && (
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-50 border border-orange-100 text-orange-700 font-bold text-xs">
                            3
                          </div>
                        )}
                        {!isTopOne && !isTopTwo && !isTopThree && (
                          <span className="text-xs font-mono text-neutral-400 font-bold">
                            {position}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-bold text-neutral-800 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="group-hover:text-[#009739] transition-colors">{p.nome}</span>
                          {isTopOne && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-xs bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider font-mono">
                              ★ Líder
                            </span>
                          )}
                          {isLast && (
                            <span className="text-neutral-500 font-medium text-xs ml-1 whitespace-nowrap bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                              naifo 🏳️🌈
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-mono font-black text-neutral-900 text-sm">
                          {p.pontos} PTS
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProfileParticipant(p.nome);
                          }}
                          className="bg-white hover:bg-emerald-50 text-neutral-600 hover:text-[#009739] border border-neutral-200 hover:border-emerald-300 text-[11px] font-bold py-1 px-2.5 rounded-lg transition-all inline-flex items-center gap-1 shadow-2xs group-hover:border-emerald-300 group-hover:text-emerald-800"
                        >
                          <TrendingUp className="w-3.5 h-3.5 text-[#009739]" />
                          Perfil
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Perfil do Participante */}
      {selectedProfileParticipant && (
        <ParticipantProfileModal
          participantName={selectedProfileParticipant}
          onClose={() => setSelectedProfileParticipant(null)}
          onSelectParticipant={(name) => setSelectedProfileParticipant(name)}
        />
      )}
    </div>
  );
}
