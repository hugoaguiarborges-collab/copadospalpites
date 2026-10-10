import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Participante } from '../types';
import { Users, Award, TrendingUp, Target, Crown } from 'lucide-react';
import ParticipantProfileModal from './ParticipantProfileModal';
import { UclStarball, UclTrophy } from './UclAssets';

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
      // Ordenação oficial: Pontos (desc) -> Acertos de Placar (desc) -> Ordem Alfabética
      pList.sort((a, b) => {
        if (b.pontos !== a.pontos) return b.pontos - a.pontos;
        const acertosA = a.acertos_placar ?? 0;
        const acertosB = b.acertos_placar ?? 0;
        if (acertosB !== acertosA) return acertosB - acertosA;
        return a.nome.localeCompare(b.nome);
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
      {/* Page header with Champions League accent */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-cyan-500/20 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] tracking-[0.2em] font-black text-cyan-400 uppercase font-mono">
              UEFA CHAMPIONS LEAGUE
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-[10px] font-mono text-slate-400 tracking-wider uppercase font-semibold">
              TABELA DA FASE DE LIGA
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2.5 font-display drop-shadow-sm">
            <div className="w-2.5 h-6 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-xs shadow-xs" />
            Classificação Geral dos Campeões
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold font-mono">
            Critério oficial de desempate por Placares Exatos (🎯) • Apuração em tempo real
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
              className="bg-[#050b28] border border-cyan-500/40 hover:border-cyan-400 text-slate-100 text-xs font-bold py-2 px-3 rounded-xl shadow-lg shadow-cyan-950/40 cursor-pointer focus:outline-hidden"
            >
              <option value="">👤 Ver Perfil de um Participante...</option>
              {[...participantes].sort((a,b) => a.nome.localeCompare(b.nome)).map(p => (
                <option key={p.id} value={p.nome}>
                  {p.nome} ({p.pontos} pts • 🎯 {p.acertos_placar ?? 0})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Destaque explicativo sobre os perfis individuais - UCL Style */}
      <div className="bg-gradient-to-r from-[#0d1c52] via-[#08123d] to-[#040924] border border-cyan-500/30 rounded-2xl p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-b from-cyan-500 to-blue-600 text-white flex items-center justify-center font-black shrink-0 shadow-md shadow-cyan-950/60">
            <UclStarball className="w-6 h-6 text-white" glow />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase text-cyan-300 tracking-wide font-display">
              Perfis de Estatísticas Individuais da Champions
            </h4>
            <p className="text-[11px] text-slate-300 font-medium">
              Clique em qualquer participante na tabela para ver a <strong>evolução rodada a rodada</strong>, o total de <strong>placares exatos</strong>, <strong>resultados acertados</strong> e <strong>gols de capitão</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards Row - Champions League broadcast aesthetics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total stats */}
        <div className="bg-[#080f33]/90 border border-cyan-500/25 p-4.5 rounded-2xl shadow-xl flex items-center gap-3.5 backdrop-blur-md">
          <div className="p-3 rounded-xl bg-[#0b1747] text-cyan-400 border border-cyan-500/30">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-mono">Total Participantes</div>
            <div className="text-xl font-black text-white leading-tight font-display">{totalParticipantes}</div>
          </div>
        </div>

        {/* Current leader */}
        <div className="bg-gradient-to-r from-[#0a164a]/95 to-[#060e30]/95 border border-amber-500/40 p-4.5 rounded-2xl shadow-xl flex items-center gap-3.5 backdrop-blur-md">
          <div className="p-3 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-500/40 shadow-xs">
            <UclTrophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="text-[10px] text-amber-300 uppercase font-black tracking-wider font-mono flex items-center gap-1">
              <span>Líder Atual</span>
              <span>★</span>
            </div>
            <div className="text-xl font-black text-white leading-tight truncate max-w-[200px] font-display">
              {lider ? lider.nome : 'Nenhum'}
            </div>
          </div>
        </div>

        {/* Leader score */}
        <div className="bg-[#080f33]/90 border border-cyan-500/25 p-4.5 rounded-2xl shadow-xl flex items-center gap-3.5 backdrop-blur-md">
          <div className="p-3 rounded-xl bg-[#0b1747] text-cyan-400 border border-cyan-500/30">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider font-mono">Pontos do Líder</div>
            <div className="text-xl font-black text-cyan-300 leading-tight font-mono">{liderPontos} PTS</div>
          </div>
        </div>
      </div>

      {/* Main Leaderboard Table - Champions League League Phase */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="px-5 py-3.5 border-b border-cyan-500/20 bg-[#050b28]/90 flex items-center justify-between">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest font-display flex items-center gap-2">
            <UclStarball className="w-4 h-4 text-cyan-400" />
            Tabela da Fase de Liga • Classificação Oficial
          </h3>
          <span className="text-[9px] bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full font-mono">
            UEFA RANKING
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-cyan-300 font-mono font-bold animate-pulse flex flex-col items-center gap-2">
            <UclStarball className="w-6 h-6 animate-spin text-cyan-400" />
            Carregando tabela oficial da Champions League...
          </div>
        ) : participantes.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase font-mono">
            Nenhum participante cadastrado. Acesse a Administração para cadastrar os participantes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans border-collapse">
              <thead>
                <tr className="border-b border-cyan-950 text-[10px] font-bold uppercase text-slate-400 bg-[#040822]/80 font-mono">
                  <th className="px-5 py-3 text-center w-24">Posição</th>
                  <th className="px-5 py-3">Participante</th>
                  <th className="px-5 py-3 text-center w-36">
                    <span className="inline-flex items-center gap-1 text-cyan-300">
                      <Target className="w-3 h-3 text-cyan-400" />
                      Placares Exatos
                    </span>
                  </th>
                  <th className="px-5 py-3 text-right w-36 text-slate-300">Pontuação</th>
                  <th className="px-5 py-3 text-center w-32">Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-950/70">
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
                      className={`hover:bg-cyan-950/40 transition-colors cursor-pointer group ${
                        isTopOne ? 'bg-gradient-to-r from-[#172554]/40 to-transparent' : ''
                      }`}
                      title={`Clique para ver o perfil completo de ${p.nome}`}
                    >
                      <td className="px-5 py-3 text-center">
                        {isTopOne && (
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-black font-black text-xs shadow-md shadow-amber-950/50">
                            1
                          </div>
                        )}
                        {isTopTwo && (
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-900 font-bold text-xs shadow-xs">
                            2
                          </div>
                        )}
                        {isTopThree && (
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/80 text-amber-100 font-bold text-xs">
                            3
                          </div>
                        )}
                        {!isTopOne && !isTopTwo && !isTopThree && (
                          <span className="text-xs font-mono text-slate-400 font-bold">
                            {position}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-bold text-white text-sm">
                        <div className="flex items-center gap-2">
                          <span className="group-hover:text-cyan-300 transition-colors">{p.nome}</span>
                          {isTopOne && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-sm bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[8px] font-black uppercase tracking-wider font-mono">
                              ★ Campeão Atual
                            </span>
                          )}
                          {isLast && (
                            <span className="text-slate-400 font-medium text-xs ml-1 whitespace-nowrap bg-[#04081c] px-2 py-0.5 rounded border border-cyan-900/40">
                              naifo 🏳️🌈
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span 
                          className="inline-flex items-center gap-1.5 font-mono font-black text-xs bg-[#0b1747] text-cyan-300 border border-cyan-500/40 px-2.5 py-0.5 rounded-full shadow-2xs"
                          title={`${p.acertos_placar ?? 0} acertos de placar exato (critério de desempate)`}
                        >
                          <Target className="w-3 h-3 text-cyan-400" />
                          {p.acertos_placar ?? 0}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-mono font-black text-white text-sm">
                          {p.pontos} PTS
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProfileParticipant(p.nome);
                          }}
                          className="bg-[#050b28] hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 border border-cyan-800/60 hover:border-cyan-400 text-[11px] font-bold py-1 px-3 rounded-lg transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
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
