import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada, Participante, Palpite } from '../types';
import { 
  X, 
  Users, 
  Eye, 
  Award, 
  Trophy, 
  CheckCircle, 
  Clock, 
  Lock, 
  Unlock, 
  Star, 
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Calendar
} from 'lucide-react';
import { UclStarball, UclTrophy, UclBadge } from './UclAssets';

interface RoundInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeRound: Rodada | null;
  participantes: Participante[];
  palpites: Palpite[];
  closedRounds: Rodada[];
  allRounds?: Rodada[];
}

export default function RoundInfoDrawer({
  isOpen,
  onClose,
  activeRound,
  participantes,
  palpites,
  closedRounds,
  allRounds = []
}: RoundInfoDrawerProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'revelados' | 'pontuacao' | 'regras'>('status');
  const [selectedRoundId, setSelectedRoundId] = useState<string>(activeRound?.id || '');
  const [roundGuesses, setRoundGuesses] = useState<Palpite[]>(palpites);
  const [loadingGuesses, setLoadingGuesses] = useState(false);

  // Available rounds list
  const availableRounds: Rodada[] = (allRounds && allRounds.length > 0)
    ? allRounds
    : [
        ...(activeRound ? [activeRound] : []),
        ...closedRounds.filter(r => r.id !== activeRound?.id)
      ];

  const targetRoundId = selectedRoundId || activeRound?.id || (availableRounds[0]?.id ?? '');
  const currentTargetRound = availableRounds.find(r => r.id === targetRoundId) || activeRound;

  // Sync selectedRoundId when activeRound becomes available
  useEffect(() => {
    if (activeRound?.id && !selectedRoundId) {
      setSelectedRoundId(activeRound.id);
    }
  }, [activeRound]);

  // Load guesses whenever targetRoundId changes or drawer opens
  useEffect(() => {
    if (!isOpen || !targetRoundId) return;

    const roundIds = [targetRoundId];
    if (targetRoundId === 'round-1') roundIds.push('round-1-quarta');
    if (targetRoundId === 'round-1-quarta') roundIds.push('round-1');

    // Check if targetRoundId matches current palpites prop
    const fromProps = palpites.filter(p => roundIds.includes(p.rodada));
    if (fromProps.length > 0) {
      setRoundGuesses(fromProps);
      return;
    }

    async function fetchRoundGuesses() {
      setLoadingGuesses(true);
      try {
        const qG = query(collection(db, 'palpites'), where('rodada', 'in', roundIds));
        const snap = await getDocs(qG);
        const list: Palpite[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as Palpite));
        setRoundGuesses(list);
      } catch (err) {
        console.error("Error fetching guesses for drawer:", err);
      } finally {
        setLoadingGuesses(false);
      }
    }

    fetchRoundGuesses();
  }, [isOpen, targetRoundId, palpites, activeRound?.id]);

  if (!isOpen) return null;

  // Group guesses by participant to see who submitted
  const submittedParticipantsMap: Record<string, { count: number; lastTime: string }> = {};
  roundGuesses.forEach(g => {
    if (!submittedParticipantsMap[g.participante]) {
      submittedParticipantsMap[g.participante] = { count: 0, lastTime: g.data_hora_envio };
    }
    submittedParticipantsMap[g.participante].count++;
    if (new Date(g.data_hora_envio) > new Date(submittedParticipantsMap[g.participante].lastTime)) {
      submittedParticipantsMap[g.participante].lastTime = g.data_hora_envio;
    }
  });

  const totalSubmitted = Object.keys(submittedParticipantsMap).length;
  const totalPending = Math.max(0, participantes.length - totalSubmitted);

  // Is target round market closed?
  const isTargetClosed = currentTargetRound 
    ? (currentTargetRound.status === 'encerrada' || (currentTargetRound.fechamento && new Date() >= new Date(currentTargetRound.fechamento)))
    : true;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Dark backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-xl bg-[#050b28] border-l border-cyan-500/30 text-white h-full shadow-2xl flex flex-col z-10 overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-cyan-500/20 bg-[#071136] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <UclStarball className="w-5 h-5 text-cyan-400" glow />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-widest">
                  UEFA MATCH CENTER
                </span>
                <UclBadge text="INFORMAÇÕES" variant="cyan" />
              </div>
              <h2 className="text-base sm:text-lg font-black font-display text-white tracking-tight">
                Painel da Rodada & Participantes
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#0b1747] hover:bg-cyan-900/60 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-cyan-500/20"
            title="Fechar painel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Round Selector Bar */}
        {availableRounds.length > 0 && (
          <div className="px-4 py-2 bg-[#040822] border-b border-cyan-500/20 flex items-center justify-between text-xs shrink-0">
            <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              Rodada Selecionada:
            </span>
            <select
              value={targetRoundId}
              onChange={(e) => setSelectedRoundId(e.target.value)}
              className="bg-[#091136] text-white font-bold text-xs py-1 px-2.5 rounded-lg border border-cyan-500/30 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 font-mono cursor-pointer"
            >
              {availableRounds.map(r => (
                <option key={r.id} value={r.id}>
                  {r.nome} {r.status === 'aberta' ? '(Aberta)' : '(Encerrada)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Segmented Navigation Tabs */}
        <div className="p-3 bg-[#03071c] border-b border-cyan-500/20 shrink-0">
          <div className="grid grid-cols-4 gap-1 bg-[#091136] p-1 rounded-xl border border-cyan-500/20 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('status')}
              className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer truncate ${
                activeTab === 'status'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              👥 Quem Palpitou
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('revelados')}
              className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer truncate ${
                activeTab === 'revelados'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              🔓 Revelados
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pontuacao')}
              className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer truncate ${
                activeTab === 'pontuacao'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              ⭐ Pontuações
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('regras')}
              className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer truncate ${
                activeTab === 'regras'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              📜 Regras
            </button>
          </div>
        </div>

        {/* Drawer Body Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: Quem Palpitou ou Não */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Summary Badges */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                  <div className="text-[10px] font-mono text-emerald-300 font-bold uppercase">Palpites Enviados</div>
                  <div className="text-xl font-black text-white font-mono mt-0.5">{totalSubmitted} de {participantes.length}</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30">
                  <div className="text-[10px] font-mono text-amber-300 font-bold uppercase">Pendentes de Envio</div>
                  <div className="text-xl font-black text-white font-mono mt-0.5">{totalPending}</div>
                </div>
              </div>

              {/* Participants list */}
              <div className="bg-[#080f33]/90 rounded-xl border border-cyan-500/20 divide-y divide-cyan-500/10 overflow-hidden">
                {participantes.map(p => {
                  const subInfo = submittedParticipantsMap[p.nome];
                  const hasSubmitted = Boolean(subInfo);

                  return (
                    <div key={p.id} className="p-3 flex items-center justify-between text-xs hover:bg-cyan-950/20 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${hasSubmitted ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-slate-600'}`} />
                        <div>
                          <span className="font-bold text-white block">{p.nome}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {hasSubmitted 
                              ? `Enviado às ${new Date(subInfo.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
                              : 'Ainda não enviou nesta rodada'}
                          </span>
                        </div>
                      </div>

                      <div>
                        {hasSubmitted ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono">
                            ✓ Confirmado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#091136] text-amber-300/80 border border-amber-500/20 font-mono">
                            Pendente
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Palpites Revelados da Rodada */}
          {activeTab === 'revelados' && (
            <div className="space-y-4">
              {!isTargetClosed ? (
                <div className="p-6 text-center bg-[#071136] rounded-2xl border border-cyan-500/30 space-y-3">
                  <Lock className="w-10 h-10 text-cyan-400 mx-auto" />
                  <h3 className="text-base font-black text-white">Palpites em Sigilo Absoluto</h3>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                    O mercado desta rodada ainda está <strong className="text-cyan-300">ABERTO</strong>. Os palpites de todos os participantes ficam protegidos e só são revelados automaticamente quando o mercado fechar (terças e quartas às 13:00).
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-950/80 border border-cyan-500/40 rounded-full text-[10px] font-mono text-cyan-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    Transparência e sigilo competitivo garantidos
                  </div>
                </div>
              ) : roundGuesses.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-[#071136] rounded-2xl border border-cyan-500/20">
                  Nenhum palpite registrado para esta rodada.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-[11px] font-mono text-cyan-300 flex items-center justify-between border-b border-cyan-500/20 pb-2">
                    <span>Palpites revelados ({roundGuesses.length} jogos registrados):</span>
                    <span className="text-emerald-400 font-bold">Mercado Fechado</span>
                  </div>

                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {/* Group guesses by participant */}
                    {Object.entries(
                      roundGuesses.reduce((acc, curr) => {
                        if (!acc[curr.participante]) acc[curr.participante] = [];
                        acc[curr.participante].push(curr);
                        return acc;
                      }, {} as Record<string, Palpite[]>)
                    ).map(([pName, pList]: [string, Palpite[]]) => (
                      <div key={pName} className="p-3 bg-[#080f33] rounded-xl border border-cyan-500/20 space-y-2">
                        <div className="flex items-center justify-between border-b border-cyan-500/10 pb-1.5">
                          <span className="text-xs font-black text-white">{pName}</span>
                          <span className="text-[10px] font-mono text-cyan-300">{pList.length} jogos</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {pList.map(g => (
                            <div key={g.id} className="p-2 rounded bg-[#04081c] border border-cyan-900/40 text-[11px]">
                              <div className="font-bold text-white font-mono">{g.palpite}</div>
                              {g.capitao && (
                                <div className="text-[10px] text-amber-300 font-mono mt-0.5">
                                  ★ Cap: {g.capitao}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Pontuação Destrinchada */}
          {activeTab === 'pontuacao' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-300 bg-[#080f33] p-3 rounded-xl border border-cyan-500/20">
                <span className="font-bold text-cyan-300 block mb-1">Apuração Oficial:</span>
                Aqui você visualiza os pontos de vencedor, placar exato e bônus de gols de capitão atribuídos a cada participante.
              </div>

              {roundGuesses.filter(g => g.avaliado).length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-[#071136] rounded-2xl border border-cyan-500/20">
                  Esta rodada ainda não teve seus resultados apurados pelo Administrador. Os pontos detalhados aparecerão assim que a apuração for concluída.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(
                    roundGuesses.filter(g => g.avaliado).reduce((acc, curr) => {
                      if (!acc[curr.participante]) acc[curr.participante] = [];
                      acc[curr.participante].push(curr);
                      return acc;
                    }, {} as Record<string, Palpite[]>)
                  ).map(([pName, pList]: [string, Palpite[]]) => {
                    const totalPoints = pList.reduce((sum, g) => sum + (g.pontos_concedidos || 0), 0);
                    const totalCapGoals = pList.reduce((sum, g) => sum + (g.gols_capitao || 0), 0);

                    return (
                      <div key={pName} className="p-3 bg-[#080f33] rounded-xl border border-cyan-500/20 space-y-2">
                        <div className="flex items-center justify-between border-b border-cyan-500/15 pb-1.5">
                          <span className="text-xs font-black text-white">{pName}</span>
                          <span className="text-xs font-mono font-black text-cyan-400">+{totalPoints} Pts</span>
                        </div>
                        <div className="space-y-1">
                          {pList.map(g => (
                            <div key={g.id} className="p-1.5 rounded bg-[#04081c] border border-cyan-900/30 text-[10px] flex items-center justify-between font-mono">
                              <div>
                                <span className="font-bold text-white">{g.palpite}</span>
                                {g.capitao && (
                                  <span className="text-amber-300 ml-2">
                                    (Cap: {g.capitao} {g.gols_capitao ? `+${g.gols_capitao}g` : ''})
                                  </span>
                                )}
                              </div>
                              <div className="font-bold text-cyan-300">
                                +{g.pontos_concedidos || 0} pts
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Regras de Pontuação */}
          {activeTab === 'regras' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300 bg-[#080f33] p-3 rounded-xl border border-cyan-500/20">
                <span className="font-bold text-cyan-300 block mb-1">Regulamento Oficial UCL:</span>
                Entenda como as pontuações dos 5 jogos e os capitães são calculadas.
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-[#080f33] border border-cyan-500/20 flex items-center justify-between">
                  <span className="text-slate-300">Acertou Resultado (Vencedor / Empate)</span>
                  <span className="font-mono font-black text-cyan-400">+3 Pts</span>
                </div>
                <div className="p-3 rounded-xl bg-[#080f33] border border-cyan-500/20 flex items-center justify-between">
                  <span className="text-slate-300">Acertou Placar Exato do Jogo</span>
                  <span className="font-mono font-black text-cyan-400">+2 Pts</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0b1747] border border-cyan-500/40 flex items-center justify-between text-white font-bold">
                  <span className="flex items-center gap-1.5">
                    <UclStarball className="w-3.5 h-3.5 text-cyan-300" />
                    Placar Exato Completo (Resultado + Placar)
                  </span>
                  <span className="font-mono font-black text-cyan-300">5 Pts</span>
                </div>
                <div className="p-3 rounded-xl bg-[#080f33] border border-cyan-500/20 flex items-center justify-between">
                  <span className="text-slate-300">Placar 0x0 sem Capitão indicado</span>
                  <span className="font-mono font-black text-amber-400">6 Pts</span>
                </div>
                <div className="p-3 rounded-xl bg-[#080f33] border border-cyan-500/20 flex items-center justify-between">
                  <span className="text-slate-300">Placar 0x0 com Capitão indicado</span>
                  <span className="font-mono font-black text-amber-400">5 Pts</span>
                </div>
                <div className="p-3 rounded-xl bg-[#080f33] border border-cyan-500/20 flex items-center justify-between">
                  <span className="text-slate-300">Gol Marcado pelo Capitão Indicado</span>
                  <span className="font-mono font-black text-amber-300">+1 Pt por gol</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-cyan-500/20 bg-[#071136] flex items-center justify-between text-[11px] text-slate-400 font-mono shrink-0">
          <span>UEFA Champions League • Copa dos Palpites</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-[#0b1747] hover:bg-cyan-900 text-white rounded-lg transition-colors cursor-pointer font-bold"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
