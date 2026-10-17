import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada, Palpite, Participante, JogoResultadoOficial } from '../types';
import { getRoundNumber, formatDateTimeDisplay } from '../utils/dateUtils';
import { 
  evaluateParticipantRound, 
  ParticipantRoundBreakdown,
  GuessDetailedEvaluation
} from '../utils/scoreCalculator';
import TabelaParticipacao from './TabelaParticipacao';
import ParticipantProfileModal from './ParticipantProfileModal';
import { 
  Trophy, 
  CheckCircle2, 
  XCircle, 
  Star, 
  Search, 
  Users, 
  Calendar, 
  Lock, 
  Unlock, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { UclStarball, UclTrophy, UclBadge } from './UclAssets';

interface HistoricoRodadasProps {
  initialRoundId?: string;
}

export default function HistoricoRodadas({ initialRoundId }: HistoricoRodadasProps) {
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string>(initialRoundId || '');
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [guesses, setGuesses] = useState<Palpite[]>([]);
  const [officialGames, setOfficialGames] = useState<JogoResultadoOficial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingRoundData, setLoadingRoundData] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'pontuacoes' | 'participacao'>('pontuacoes');
  const [expandedParticipants, setExpandedParticipants] = useState<Record<string, boolean>>({});
  const [showOfficialMatchesDetails, setShowOfficialMatchesDetails] = useState<boolean>(false);
  const [selectedProfileParticipant, setSelectedProfileParticipant] = useState<string | null>(null);

  // 1. Carregar rodadas e participantes
  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
      try {
        const [rSnap, pSnap] = await Promise.all([
          getDocs(collection(db, 'rodadas')),
          getDocs(collection(db, 'participantes'))
        ]);

        const rList: Rodada[] = [];
        rSnap.forEach(d => {
          rList.push({ id: d.id, ...d.data() } as Rodada);
        });
        rList.sort((a, b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
        setRounds(rList);

        const pList: Participante[] = [];
        pSnap.forEach(d => {
          pList.push({ id: d.id, ...d.data() } as Participante);
        });
        pList.sort((a, b) => a.nome.localeCompare(b.nome));
        setParticipantes(pList);

        // Seleção inteligente da rodada inicial:
        if (!selectedRoundId) {
          const nowISO = new Date().toISOString();
          const closedRounds = rList.filter(r => r.status === 'encerrada' || r.fechamento <= nowISO);
          if (closedRounds.length > 0) {
            closedRounds.sort((a, b) => getRoundNumber(b.nome || b.id) - getRoundNumber(a.nome || a.id));
            setSelectedRoundId(closedRounds[0].id);
          } else if (rList.length > 0) {
            setSelectedRoundId(rList[0].id);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados de histórico:", err);
      } finally {
        setLoading(false);
      }
    }

    loadInitial();
  }, []);

  // 2. Quando selectedRoundId mudar, carregar palpites e resultados oficiais
  useEffect(() => {
    if (!selectedRoundId) return;

    async function loadRoundData() {
      setLoadingRoundData(true);
      try {
        const curRound = rounds.find(r => r.id === selectedRoundId);
        const roundIds = Array.from(
          new Set(
            [
              selectedRoundId,
              curRound?.nome,
              curRound?.id,
              selectedRoundId === 'round-1' ? 'round-1-quarta' : null,
              selectedRoundId === 'round-1-quarta' ? 'round-1' : null
            ].filter(Boolean)
          )
        ) as string[];

        const qPalpites = query(
          collection(db, 'palpites'),
          where('rodada', 'in', roundIds),
          orderBy('data_hora_envio', 'asc')
        );

        const qOficiais = query(
          collection(db, 'resultados_oficiais'),
          where('rodada_id', '==', selectedRoundId)
        );

        const [pSnap, ofSnap] = await Promise.all([
          getDocs(qPalpites),
          getDocs(qOficiais)
        ]);

        const pList: Palpite[] = [];
        pSnap.forEach(d => {
          pList.push({ id: d.id, ...d.data() } as Palpite);
        });
        setGuesses(pList);

        const ofList: JogoResultadoOficial[] = [];
        ofSnap.forEach(d => {
          const data = d.data();
          ofList.push({
            time_mandante: data.time_mandante,
            gols_mandante: data.gols_mandante,
            time_visitante: data.time_visitante,
            gols_visitante: data.gols_visitante,
            gols_jogadores: data.artilheiros || data.gols_jogadores || []
          });
        });

        if (ofList.length === 0 && curRound?.jogos_oficiais && curRound.jogos_oficiais.length > 0) {
          setOfficialGames(curRound.jogos_oficiais);
        } else {
          setOfficialGames(ofList);
        }
      } catch (err) {
        console.error("Erro ao carregar rodada selecionada:", err);
      } finally {
        setLoadingRoundData(false);
      }
    }

    loadRoundData();
  }, [selectedRoundId, rounds]);

  const currentRound = useMemo(() => {
    return rounds.find(r => r.id === selectedRoundId);
  }, [rounds, selectedRoundId]);

  const isMarketClosed = useMemo(() => {
    if (!currentRound) return false;
    const now = new Date();
    return currentRound.status === 'encerrada' || now >= new Date(currentRound.fechamento);
  }, [currentRound]);

  // Agrupar palpites válidos pelo último envio de cada participante
  const validGuessesByParticipant = useMemo(() => {
    const groups: Record<string, Palpite[]> = {};
    guesses.forEach(g => {
      const pName = g.participante.trim();
      if (!groups[pName]) groups[pName] = [];
      groups[pName].push(g);
    });

    const valid: Record<string, Palpite[]> = {};
    Object.entries(groups).forEach(([pName, pList]) => {
      const sorted = [...pList].sort(
        (a, b) => new Date(a.data_hora_envio).getTime() - new Date(b.data_hora_envio).getTime()
      );
      const timestamps = Array.from(new Set(sorted.map(g => g.data_hora_envio)));
      const latestTs = timestamps[timestamps.length - 1];
      valid[pName] = sorted.filter(g => g.data_hora_envio === latestTs);
    });
    return valid;
  }, [guesses]);

  // Avaliação consolidada e direta de pontos
  const evaluatedParticipants = useMemo<ParticipantRoundBreakdown[]>(() => {
    const list: ParticipantRoundBreakdown[] = [];

    Object.entries(validGuessesByParticipant).forEach(([pName, pGuesses]) => {
      const breakdown = evaluateParticipantRound(pGuesses as Palpite[], officialGames);
      breakdown.participante = pName;
      list.push(breakdown);
    });

    // Ordenar por total de pontos decrescente
    list.sort((a, b) => {
      if (b.totalPontos !== a.totalPontos) return b.totalPontos - a.totalPontos;
      if (b.totalAcertosPlacar !== a.totalAcertosPlacar) return b.totalAcertosPlacar - a.totalAcertosPlacar;
      return a.participante.localeCompare(b.participante);
    });

    return list;
  }, [validGuessesByParticipant, officialGames]);

  // Filtragem
  const filteredParticipants = useMemo(() => {
    if (!searchTerm.trim()) return evaluatedParticipants;
    const term = searchTerm.toLowerCase();
    return evaluatedParticipants.filter(p => p.participante.toLowerCase().includes(term));
  }, [evaluatedParticipants, searchTerm]);

  // Toggle expand individual participant details
  const toggleExpand = (name: string) => {
    setExpandedParticipants(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    evaluatedParticipants.forEach(p => { next[p.participante] = true; });
    setExpandedParticipants(next);
  };

  const collapseAll = () => {
    setExpandedParticipants({});
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden font-sans">
      {/* 1. SELETOR DE RODADAS HORIZONTAL FLUIDO & CLEAN */}
      <div className="bg-[#080f33]/90 border border-cyan-500/20 rounded-2xl p-3 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-cyan-500/15">
          <div className="flex items-center gap-2">
            <UclStarball className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-black uppercase text-white font-display tracking-wider">
              Histórico de Rodadas
            </span>
            <span className="text-[10px] text-slate-400 font-mono font-bold">
              ({rounds.length} cadastradas)
            </span>
          </div>

          {/* Dropdown direto para salto rápido */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="round-jump" className="text-[11px] font-mono font-bold text-slate-400 hidden sm:inline">
              Ir para:
            </label>
            <select
              id="round-jump"
              value={selectedRoundId}
              onChange={(e) => setSelectedRoundId(e.target.value)}
              className="bg-[#050b28] border border-cyan-500/35 hover:border-cyan-400 rounded-lg px-2.5 py-1 text-xs font-bold text-white focus:outline-hidden cursor-pointer"
            >
              {rounds.map(r => {
                const isTest = r.is_test || r.id === 'rodada-teste';
                return (
                  <option key={r.id} value={r.id} className="bg-[#050b28] text-white">
                    {isTest ? '🧪 [TESTE] ' : ''}{r.nome} {r.status === 'encerrada' ? '✓' : '(Aberta)'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Barra horizontal com rolagem suave de rodadas */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-cyan-700/50">
          {rounds.map(r => {
            const isSelected = r.id === selectedRoundId;
            const isTest = r.is_test || r.id === 'rodada-teste';
            const isEncerrada = r.status === 'encerrada';

            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoundId(r.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/70 border border-cyan-300/40'
                    : 'bg-[#050b28] text-slate-300 hover:text-white border border-cyan-900/40 hover:border-cyan-500/40'
                }`}
              >
                {isTest && <span className="text-[10px]">🧪</span>}
                <span>{r.nome}</span>
                {isEncerrada ? (
                  <span className={`text-[10px] ${isSelected ? 'text-cyan-200' : 'text-slate-500'}`}>✓</span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. CARD COMPACTO & DIRETO DA RODADA SELECIONADA */}
      {currentRound && (
        <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl p-4 shadow-xl backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase font-mono ${
                  currentRound.status === 'encerrada'
                    ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/30'
                    : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                }`}>
                  {currentRound.status === 'encerrada' ? (
                    <>
                      <Lock className="w-2.5 h-2.5 text-cyan-400" /> Rodada Apurada
                    </>
                  ) : (
                    <>
                      <Unlock className="w-2.5 h-2.5 text-emerald-400" /> Mercado Aberto
                    </>
                  )}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Fechamento: {formatDateTimeDisplay(currentRound.fechamento)}
                </span>
              </div>
              <h2 className="text-lg font-black text-white uppercase font-display mt-1">
                {currentRound.nome}
              </h2>
            </div>

            {/* Métricas compactas */}
            <div className="flex items-center gap-2">
              <div className="bg-[#050b28] border border-cyan-500/20 rounded-xl px-3 py-1.5 text-center">
                <span className="text-[9px] text-slate-400 uppercase font-mono block">Palpites</span>
                <span className="text-sm font-black text-white font-mono">{Object.keys(validGuessesByParticipant).length}</span>
              </div>
              <div className="bg-[#050b28] border border-cyan-500/20 rounded-xl px-3 py-1.5 text-center">
                <span className="text-[9px] text-slate-400 uppercase font-mono block">Jogos Oficiais</span>
                <span className="text-sm font-black text-cyan-300 font-mono">{officialGames.length}</span>
              </div>
              {evaluatedParticipants.length > 0 && evaluatedParticipants[0].totalPontos > 0 && (
                <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-1.5 text-center">
                  <span className="text-[9px] text-amber-300 uppercase font-mono block">Maior Pontuação</span>
                  <span className="text-sm font-black text-amber-300 font-mono">+{evaluatedParticipants[0].totalPontos} pts</span>
                </div>
              )}
            </div>
          </div>

          {/* Fita de Placares Oficiais (Compacta e Direta) */}
          {officialGames.length > 0 && (
            <div className="mt-3 pt-3 border-t border-cyan-500/15">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-cyan-300 uppercase font-mono flex items-center gap-1.5">
                  <UclTrophy className="w-3.5 h-3.5 text-cyan-400" />
                  Placares Oficiais da Rodada ({officialGames.length})
                </span>
                <button
                  type="button"
                  onClick={() => setShowOfficialMatchesDetails(!showOfficialMatchesDetails)}
                  className="text-[10px] text-slate-400 hover:text-cyan-300 font-mono flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {showOfficialMatchesDetails ? 'Recolher detalhes' : 'Ver todos os jogos'}
                  {showOfficialMatchesDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Strip compacto dos jogos */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-cyan-800/40">
                {officialGames.map((og, idx) => (
                  <div 
                    key={idx}
                    className="bg-[#050b28] border border-cyan-500/20 rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-2 shrink-0 shadow-xs"
                  >
                    <span className="font-bold text-white text-[11px] truncate max-w-[100px]">{og.time_mandante}</span>
                    <span className="font-mono font-black text-cyan-300 bg-[#030617] px-1.5 py-0.5 rounded border border-cyan-500/30 text-[11px]">
                      {og.gols_mandante} x {og.gols_visitante}
                    </span>
                    <span className="font-bold text-white text-[11px] truncate max-w-[100px]">{og.time_visitante}</span>
                  </div>
                ))}
              </div>

              {/* Detalhes expandidos com artilheiros */}
              {showOfficialMatchesDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2 pt-2 border-t border-cyan-950/60 animate-fadeIn">
                  {officialGames.map((og, idx) => (
                    <div key={idx} className="bg-[#040822] p-2.5 rounded-lg border border-cyan-500/15 text-xs">
                      <div className="flex items-center justify-between font-bold text-white">
                        <span>{og.time_mandante}</span>
                        <span className="text-cyan-300 font-mono">{og.gols_mandante} x {og.gols_visitante}</span>
                        <span>{og.time_visitante}</span>
                      </div>
                      {og.gols_jogadores && og.gols_jogadores.length > 0 && (
                        <div className="mt-1 text-[10px] text-slate-400 font-mono truncate">
                          ⚽ Gols: {og.gols_jogadores.map(g => `${g.jogador} (${g.gols})`).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. BARRA DE CONTROLE: ABAS & BUSCA OBJETIVA */}
      <div className="bg-[#080f33]/90 border border-cyan-500/20 rounded-2xl p-2.5 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pontuacoes')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pontuacoes'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                : 'text-slate-300 hover:text-white bg-[#050b28] border border-cyan-900/40'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-cyan-300" />
            <span>Pontuações da Rodada</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('participacao')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'participacao'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                : 'text-slate-300 hover:text-white bg-[#050b28] border border-cyan-900/40'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-cyan-300" />
            <span>Quem Palpitou ({Object.keys(validGuessesByParticipant).length})</span>
          </button>
        </div>

        {/* Busca e botões rápidos de expandir */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {activeTab === 'pontuacoes' && evaluatedParticipants.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={expandAll}
                className="text-[10px] font-mono text-cyan-400 hover:text-white px-2 py-1 bg-[#050b28] border border-cyan-500/20 rounded-lg cursor-pointer transition-colors"
                title="Expandir detalhes de todos"
              >
                Expandir Todos
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="text-[10px] font-mono text-slate-400 hover:text-white px-2 py-1 bg-[#050b28] border border-cyan-500/20 rounded-lg cursor-pointer transition-colors"
                title="Recolher detalhes"
              >
                Recolher
              </button>
            </div>
          )}

          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar participante..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#050b28] border border-cyan-800/60 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 shadow-inner"
            />
          </div>
        </div>
      </div>

      {/* 4. CONTEÚDO PRINCIPAL: PONTUAÇÕES FLUIDAS E OBJETIVAS */}
      {loadingRoundData ? (
        <div className="py-16 text-center text-xs font-mono font-bold text-cyan-300 animate-pulse flex flex-col items-center gap-2">
          <UclStarball className="w-8 h-8 animate-spin text-cyan-400" />
          Carregando histórico e pontuações...
        </div>
      ) : (!isMarketClosed && !currentRound?.is_test && activeTab === 'pontuacoes') ? (
        /* Sigilo Oficial Durante Mercado Aberto */
        <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl p-8 text-center space-y-3 shadow-xl backdrop-blur-md">
          <div className="w-12 h-12 bg-[#050b28] border border-cyan-500/35 rounded-2xl flex items-center justify-center mx-auto text-cyan-400 shadow-md">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-white uppercase font-display">
            Palpites em Sigilo Oficial até o Fechamento
          </h3>
          <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            O mercado para a <strong>{currentRound?.nome}</strong> está em andamento. Os palpites e pontuações serão liberados e apurados imediatamente após o fechamento do mercado.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('participacao')}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-md flex items-center gap-1.5 mx-auto"
            >
              <Users className="w-3.5 h-3.5" /> Ver Tabela de Participação
            </button>
          </div>
        </div>
      ) : activeTab === 'participacao' && currentRound ? (
        <TabelaParticipacao
          round={currentRound}
          participantes={participantes}
          palpites={guesses}
          isMarketClosed={isMarketClosed}
        />
      ) : (
        /* LISTA CLEAN & DIRETA AO PONTO DOS PARTICIPANTES */
        <div className="space-y-2.5">
          {filteredParticipants.map((item, index) => {
            const isExpanded = Boolean(expandedParticipants[item.participante]);
            const isFirst = index === 0 && item.totalPontos > 0;

            return (
              <div
                key={item.participante}
                className={`bg-[#080f33]/90 border rounded-2xl overflow-hidden shadow-lg transition-all backdrop-blur-md ${
                  isFirst
                    ? 'border-amber-400/50 shadow-amber-950/20'
                    : 'border-cyan-500/20 hover:border-cyan-500/40'
                }`}
              >
                {/* LINHA RESUMO DO PARTICIPANTE (CLICÁVEL PARA EXPANDIR) */}
                <div 
                  onClick={() => toggleExpand(item.participante)}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Rank / Posição */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black font-mono text-xs shrink-0 shadow-sm ${
                      isFirst
                        ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-black border border-amber-300'
                        : 'bg-[#050b28] text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {isFirst ? '👑' : `${index + 1}º`}
                    </div>

                    {/* Nome do Participante e Chips de Acerto */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm sm:text-base font-display">
                          {item.participante}
                        </span>
                        {isFirst && (
                          <span className="text-[9px] font-black uppercase text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/40 font-mono">
                            Líder da Rodada
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProfileParticipant(item.participante);
                          }}
                          className="text-[10px] text-cyan-400 hover:text-white font-mono flex items-center gap-0.5 cursor-pointer ml-1"
                          title="Ver perfil completo"
                        >
                          <TrendingUp className="w-3 h-3" />
                          <span>Perfil</span>
                        </button>
                      </div>

                      {/* Chips diretos e objetivos */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
                        {item.totalAcertosResultado > 0 && (
                          <span className="text-emerald-300 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-md font-mono font-bold text-[10px] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            {item.totalAcertosResultado}x Vencedor (+{item.totalPontosResultado})
                          </span>
                        )}
                        {item.totalAcertosPlacar > 0 && (
                          <span className="text-cyan-300 bg-cyan-950/70 border border-cyan-500/30 px-2 py-0.5 rounded-md font-mono font-bold text-[10px] flex items-center gap-1">
                            <UclTrophy className="w-3 h-3 text-cyan-400" />
                            {item.totalAcertosPlacar}x Placar Exato (+{item.totalPontosPlacar})
                          </span>
                        )}
                        {item.totalPontosCapitao > 0 && (
                          <span className="text-amber-300 bg-amber-950/70 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono font-bold text-[10px] flex items-center gap-1">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            {item.totalGolsCapitao}x Gol Cap (+{item.totalPontosCapitao})
                          </span>
                        )}
                        {item.totalPontos === 0 && (
                          <span className="text-slate-400 bg-[#050b28] border border-cyan-950 px-2 py-0.5 rounded-md font-mono text-[10px]">
                            Nenhum acerto computado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Lado Direito: Pontuação Total e Botão Expandir */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-cyan-950/50">
                    <div className="text-left sm:text-right">
                      <span className="text-[9px] text-slate-400 uppercase font-mono block">Pontos na Rodada</span>
                      <div className={`font-mono font-black text-lg sm:text-xl leading-none ${
                        item.totalPontos > 0 ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.3)]' : 'text-slate-500'
                      }`}>
                        +{item.totalPontos} <span className="text-xs">PTS</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 hover:text-white text-xs font-mono">
                      <span>{isExpanded ? 'Recolher' : 'Ver Palpites (5)'}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
                    </div>
                  </div>
                </div>

                {/* DETALHAMENTO EXPANSÍVEL: 5 JOGOS EM TABELA COMPACTA & OBJETIVA */}
                {isExpanded && (
                  <div className="bg-[#040822] border-t border-cyan-500/20 p-3 sm:p-4 space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pb-1.5 border-b border-cyan-950/60 font-bold">
                      <span>Confronto & Palpite Escolhido</span>
                      <span>Resultado & Pontuação Concedida</span>
                    </div>

                    <div className="divide-y divide-cyan-950/60">
                      {item.jogosAvaliados.map((jogoEval, jIdx) => {
                        const acertouRes = jogoEval.acertouResultado;
                        const acertouPlac = jogoEval.acertouPlacar;
                        const golsCap = jogoEval.golsCapitao;

                        return (
                          <div 
                            key={jIdx}
                            className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            {/* Confronto e Palpite */}
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-xs sm:text-sm font-display">
                                  {jogoEval.resultadoRealFormatado !== '-' 
                                    ? jogoEval.resultadoRealFormatado 
                                    : jogoEval.jogoFormatado}
                                </span>
                                {jogoEval.resultadoRealFormatado === '-' && (
                                  <span className="text-[10px] text-slate-500 font-mono">(Aguardando apuração)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-300">
                                <span>Palpite: <strong>{jogoEval.guess.palpite}</strong></span>
                                {jogoEval.nomeCapitao && (
                                  <span className="text-slate-400">
                                    • Cap: <strong className="text-amber-300">{jogoEval.nomeCapitao}</strong> 
                                    {golsCap > 0 && <span className="text-amber-400 font-bold"> ({golsCap} gol)</span>}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Resumo de acertos e badge de pontos */}
                            <div className="flex items-center gap-2 self-start sm:self-auto">
                              <div className="flex flex-wrap gap-1 text-[10px] font-mono font-bold">
                                {acertouPlac && (
                                  <span className="text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-1.5 py-0.5 rounded">
                                    Placar Exato (+2)
                                  </span>
                                )}
                                {acertouRes && (
                                  <span className="text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                                    Vencedor (+3)
                                  </span>
                                )}
                                {golsCap > 0 && (
                                  <span className="text-amber-300 bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.5 rounded">
                                    Capitão (+{jogoEval.pontosCapitao})
                                  </span>
                                )}
                                {!acertouRes && !acertouPlac && jogoEval.resultadoRealFormatado !== '-' && (
                                  <span className="text-slate-500 bg-[#060c28] px-1.5 py-0.5 rounded">
                                    0 pts
                                  </span>
                                )}
                              </div>

                              <div className={`font-mono font-black text-xs px-2.5 py-1 rounded-lg border shrink-0 ${
                                jogoEval.pontos > 0
                                  ? 'bg-[#06123d] text-cyan-300 border-cyan-500/40'
                                  : 'bg-[#030617] text-slate-500 border-cyan-950'
                              }`}>
                                +{jogoEval.pontos} pts
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredParticipants.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-400 bg-[#080f33]/90 border border-dashed border-cyan-500/25 rounded-2xl font-mono">
              Nenhum palpite encontrado para esta rodada.
            </div>
          )}
        </div>
      )}

      {/* Modal do Perfil */}
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
