import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada, Palpite, Participante, JogoResultadoOficial } from '../types';
import { getRoundNumber, formatDateTimeDisplay } from '../utils/dateUtils';
import { 
  evaluateParticipantRound, 
  evaluateGuessAgainstResult, 
  ParticipantRoundBreakdown,
  GuessDetailedEvaluation
} from '../utils/scoreCalculator';
import TabelaParticipacao from './TabelaParticipacao';
import ParticipantProfileModal from './ParticipantProfileModal';
import { 
  History, 
  Trophy, 
  Award, 
  CheckCircle2, 
  XCircle, 
  Star, 
  Search, 
  Filter, 
  Users, 
  Calendar, 
  Lock, 
  Unlock, 
  ChevronRight, 
  Check, 
  AlertCircle,
  HelpCircle,
  BarChart2,
  ListFilter,
  TrendingUp
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
  const [activeTab, setActiveTab] = useState<'detalhes' | 'tabela_pontos' | 'participacao'>('detalhes');
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
        setParticipantes(pList);

        // Escolher a melhor rodada inicial padrão:
        // Priorizar a última rodada encerrada/apurada, ou a rodada 1
        if (!selectedRoundId) {
          const nowISO = new Date().toISOString();
          const closedRounds = rList.filter(r => r.status === 'encerrada' || r.fechamento <= nowISO);
          if (closedRounds.length > 0) {
            // Pegar a última rodada encerrada
            closedRounds.sort((a, b) => getRoundNumber(b.nome || b.id) - getRoundNumber(a.nome || a.id));
            setSelectedRoundId(closedRounds[0].id);
          } else if (rList.length > 0) {
            setSelectedRoundId(rList[0].id);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados iniciais de histórico:", err);
      } finally {
        setLoading(false);
      }
    }

    loadInitial();
  }, []);

  // 2. Quando selectedRoundId mudar, carregar palpites e resultados oficiais daquela rodada
  useEffect(() => {
    if (!selectedRoundId) return;

    async function loadRoundData() {
      setLoadingRoundData(true);
      try {
        const roundIds = [selectedRoundId];
        if (selectedRoundId === 'round-1') roundIds.push('round-1-quarta');
        if (selectedRoundId === 'round-1-quarta') roundIds.push('round-1');

        const qPalpites = query(
          collection(db, 'palpites'),
          where('rodada', 'in', roundIds),
          orderBy('data_hora_envio', 'asc')
        );

        // Jogos oficiais da rodada selecionada
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

        // Se a rodada já tem jogos_oficiais salvos no próprio documento, mesclar caso necessário
        const curRound = rounds.find(r => r.id === selectedRoundId);
        if (ofList.length === 0 && curRound?.jogos_oficiais && curRound.jogos_oficiais.length > 0) {
          setOfficialGames(curRound.jogos_oficiais);
        } else {
          setOfficialGames(ofList);
        }
      } catch (err) {
        console.error("Erro ao carregar dados da rodada selecionada:", err);
      } finally {
        setLoadingRoundData(false);
      }
    }

    loadRoundData();
  }, [selectedRoundId, rounds]);

  // Rodada selecionada
  const currentRound = useMemo(() => {
    return rounds.find(r => r.id === selectedRoundId);
  }, [rounds, selectedRoundId]);

  // Is market closed for this round?
  const isMarketClosed = useMemo(() => {
    if (!currentRound) return false;
    const now = new Date();
    return currentRound.status === 'encerrada' || now >= new Date(currentRound.fechamento);
  }, [currentRound]);

  // Agrupar palpites pelo último envio de cada participante
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

  // Avaliação detalhada de cada participante com o breakdown exato de pontuação
  const evaluatedParticipants = useMemo<ParticipantRoundBreakdown[]>(() => {
    const list: ParticipantRoundBreakdown[] = [];

    // Para cada participante que enviou palpites válidos
    Object.entries(validGuessesByParticipant).forEach(([pName, pGuesses]) => {
      const breakdown = evaluateParticipantRound(pGuesses as Palpite[], officialGames);
      // Garantir nome exato
      breakdown.participante = pName;
      list.push(breakdown);
    });

    // Ordenar participantes por pontuação obtida na rodada (decrescente)
    list.sort((a, b) => {
      if (b.totalPontos !== a.totalPontos) {
        return b.totalPontos - a.totalPontos;
      }
      if (b.totalAcertosPlacar !== a.totalAcertosPlacar) {
        return b.totalAcertosPlacar - a.totalAcertosPlacar;
      }
      return a.participante.localeCompare(b.participante);
    });

    return list;
  }, [validGuessesByParticipant, officialGames]);

  // Filtragem por busca
  const filteredBreakdown = useMemo(() => {
    if (!searchTerm.trim()) return evaluatedParticipants;
    const term = searchTerm.toLowerCase();
    return evaluatedParticipants.filter(p => p.participante.toLowerCase().includes(term));
  }, [evaluatedParticipants, searchTerm]);

  // Estatísticas da rodada
  const roundStats = useMemo(() => {
    const totalPalpitaram = Object.keys(validGuessesByParticipant).length;
    const somaPontos = evaluatedParticipants.reduce((acc, curr) => acc + curr.totalPontos, 0);
    const mediaPontos = totalPalpitaram > 0 ? (somaPontos / totalPalpitaram).toFixed(1) : '0';
    const maiorPontuacao = evaluatedParticipants.length > 0 ? evaluatedParticipants[0].totalPontos : 0;
    const lideresRodada = evaluatedParticipants.filter(p => p.totalPontos === maiorPontuacao && maiorPontuacao > 0);

    return {
      totalPalpitaram,
      somaPontos,
      mediaPontos,
      maiorPontuacao,
      lideresRodada
    };
  }, [evaluatedParticipants, validGuessesByParticipant]);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Cabeçalho da página - Champions League Matchday */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-cyan-500/20 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UclBadge text="UEFA MATCH ARCHIVE" variant="cyan" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">
              APURAÇÃO OFICIAL
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2.5 font-display drop-shadow-sm">
            <div className="w-2.5 h-6 bg-gradient-to-b from-cyan-400 to-blue-600 rounded-xs shadow-xs" />
            Palpites & Resultados Oficiais
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold font-mono">
            Consulte os palpites revelados, placares oficiais da UEFA e a discriminação de pontos por jogo.
          </p>
        </div>

        {/* Seletor rápido de rodada - UCL Style */}
        <div className="flex items-center gap-2 bg-[#050b28] p-1.5 rounded-xl border border-cyan-500/35 shadow-lg shadow-cyan-950/50">
          <label htmlFor="round-select-history" className="text-xs font-bold text-cyan-400 pl-2 font-mono flex items-center gap-1">
            <UclStarball className="w-3.5 h-3.5 text-cyan-400" />
            Rodada:
          </label>
          <select
            id="round-select-history"
            value={selectedRoundId}
            onChange={(e) => setSelectedRoundId(e.target.value)}
            className="bg-[#030617] border border-cyan-500/40 hover:border-cyan-400 rounded-lg px-3 py-1.5 text-xs font-black text-white focus:outline-hidden cursor-pointer"
          >
            {rounds.map(r => {
              const rNum = getRoundNumber(r.nome || r.id);
              const isEncerrada = r.status === 'encerrada';
              const isTest = r.is_test || r.id === 'rodada-teste';
              return (
                <option key={r.id} value={r.id} className="bg-[#030617] text-white">
                  {isTest ? '🧪 [TESTE] ' : ''}{r.nome} {isEncerrada ? '(Encerrada e Apurada)' : '(Em andamento)'}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Banner da Rodada Selecionada - UEFA Champions League Match Center */}
      {currentRound && (
        <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl p-5 shadow-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase font-mono ${
                currentRound.status === 'encerrada'
                  ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-500/40'
                  : 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
              }`}>
                {currentRound.status === 'encerrada' ? (
                  <>
                    <Lock className="w-3 h-3 text-cyan-400" />
                    Rodada Encerrada & Apurada
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-emerald-400" />
                    Mercado Aberto
                  </>
                )}
              </span>
              <span className="text-xs text-slate-400 font-bold font-mono">
                ID: {currentRound.id}
              </span>
            </div>
            <h2 className="text-xl font-black text-white uppercase font-display flex items-center gap-2">
              <UclStarball className="w-5 h-5 text-cyan-400" />
              {currentRound.nome}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 font-medium">
              Fechamento oficial de mercado: <strong className="text-cyan-300">Terça-feira às 13:00</strong> ({formatDateTimeDisplay(currentRound.fechamento)})
            </p>
          </div>

          {/* KPI Cards Rápidos - UEFA Style */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="bg-[#050b28] border border-cyan-500/25 rounded-xl p-3 text-center min-w-[90px] shadow-inner">
              <span className="text-[10px] text-slate-400 font-bold uppercase block font-mono">Palpitaram</span>
              <span className="text-lg font-black font-mono text-white">{roundStats.totalPalpitaram}</span>
            </div>
            <div className="bg-[#050b28] border border-cyan-500/25 rounded-xl p-3 text-center min-w-[90px] shadow-inner">
              <span className="text-[10px] text-slate-400 font-bold uppercase block font-mono">Jogos Oficiais</span>
              <span className="text-lg font-black font-mono text-cyan-300">{officialGames.length}</span>
            </div>
            <div className="bg-[#050b28] border border-cyan-500/35 rounded-xl p-3 text-center min-w-[90px] shadow-inner">
              <span className="text-[10px] text-cyan-300 font-bold uppercase block font-mono">Média Pts</span>
              <span className="text-lg font-black font-mono text-cyan-200">{roundStats.mediaPontos}</span>
            </div>
            <div className="bg-[#050b28] border border-amber-500/40 rounded-xl p-3 text-center min-w-[90px] shadow-inner">
              <span className="text-[10px] text-amber-400 font-bold uppercase block font-mono">Maior Pontuação</span>
              <span className="text-lg font-black font-mono text-amber-300">+{roundStats.maiorPontuacao} pts</span>
            </div>
          </div>
        </div>
      )}

      {/* Jogos & Placares Oficiais desta Rodada - UEFA Broadcast Board */}
      <div className="bg-gradient-to-r from-[#0a1442] via-[#050b28] to-[#04081c] border border-cyan-500/30 text-white rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-cyan-500/20">
          <div className="flex items-center gap-2">
            <UclTrophy className="w-5 h-5 text-cyan-300" />
            <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300 font-display">
              Placares Oficiais dos Jogos ({officialGames.length} confrontos apurados)
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-300 bg-[#050b28] px-2.5 py-0.5 rounded border border-cyan-500/30">
            UEFA OFFICIAL RESULTS
          </span>
        </div>

        {officialGames.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-300">
            <p className="font-semibold text-cyan-300 mb-1">
              ⏳ Nenhum placar oficial foi lançado para esta rodada ainda.
            </p>
            <p className="text-[11px] text-slate-400">
              Assim que a administração cadastrar os placares oficiais dos 5 jogos europeus em <em>Administração &gt; Avaliar Palpites</em>, as pontuações serão calculadas e exibidas aqui instantaneamente!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {officialGames.map((og, idx) => (
              <div 
                key={idx} 
                className="bg-[#050a24]/90 border border-cyan-500/30 rounded-xl p-3.5 flex flex-col justify-between shadow-lg"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs text-white truncate flex-1 font-display">
                    {og.time_mandante}
                  </span>
                  <div className="bg-[#030617] px-3 py-1 rounded-lg border border-cyan-400/50 font-mono font-black text-sm text-cyan-300 whitespace-nowrap shadow-inner">
                    {og.gols_mandante} x {og.gols_visitante}
                  </div>
                  <span className="font-black text-xs text-white truncate flex-1 text-right font-display">
                    {og.time_visitante}
                  </span>
                </div>

                {og.gols_jogadores && og.gols_jogadores.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-cyan-950 text-[10px] text-slate-400 flex flex-wrap gap-1 items-center">
                    <span className="font-bold text-cyan-400 font-mono">⚽ Gols:</span>
                    {og.gols_jogadores.map((gj, jIdx) => (
                      <span key={jIdx} className="bg-[#070e30] border border-cyan-800/40 px-1.5 py-0.5 rounded text-slate-200 font-medium">
                        {gj.jogador} ({gj.gols})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alternador de Visualização & Barra de Busca - UEFA Controls */}
      <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl backdrop-blur-md">
        {/* Abas */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => setActiveTab('detalhes')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'detalhes'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                : 'text-slate-300 hover:text-white bg-[#050b28] border border-cyan-900/40'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 text-cyan-300" />
            Palpites & Pontos por Jogo
          </button>
          <button
            onClick={() => setActiveTab('tabela_pontos')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tabela_pontos'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                : 'text-slate-300 hover:text-white bg-[#050b28] border border-cyan-900/40'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            Ranking da Rodada
          </button>
          <button
            onClick={() => setActiveTab('participacao')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'participacao'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md shadow-cyan-950/60 border border-cyan-300/40'
                : 'text-slate-300 hover:text-white bg-[#050b28] border border-cyan-900/40'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            Quem Palpitou ({roundStats.totalPalpitaram})
          </button>
        </div>

        {/* Busca por participante */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar participante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#050a24] border border-cyan-800/60 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 shadow-inner"
          />
        </div>
      </div>

      {/* Conteúdo Principal de acordo com a aba selecionada */}
      {loadingRoundData ? (
        <div className="py-16 text-center text-xs font-mono font-bold text-cyan-300 animate-pulse flex flex-col items-center gap-2">
          <UclStarball className="w-8 h-8 animate-spin text-cyan-400" />
          Carregando palpites e apurações da rodada UEFA...
        </div>
      ) : (!isMarketClosed && !currentRound?.is_test && activeTab !== 'participacao') ? (
        /* Sigilo Oficial durante a rodada aberta */
        <div className="bg-[#080f33]/90 border border-cyan-500/30 rounded-2xl p-8 text-center space-y-4 shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 bg-[#050b28] border border-cyan-500/40 rounded-2xl flex items-center justify-center mx-auto text-cyan-400 shadow-lg">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-black uppercase text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-2.5 py-0.5 rounded-full">
              Sigilo Absoluto UEFA
            </span>
            <h3 className="text-xl font-black text-white uppercase mt-2 font-display">
              Palpites Confidenciais durante o Mercado Aberto
            </h3>
            <p className="text-xs text-slate-300 max-w-lg mx-auto mt-2 leading-relaxed font-medium">
              Os palpites de cada participante nesta rodada oficial permanecem em sigilo absoluto até o encerramento do mercado (<strong className="text-cyan-300">terça-feira às 13:00</strong>) e a apuração dos resultados oficiais.
            </p>
          </div>
          <div className="pt-2 flex justify-center">
            <button
              onClick={() => setActiveTab('participacao')}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-md shadow-cyan-950/60 flex items-center gap-2"
            >
              <Users className="w-4 h-4 text-white" /> Ver Tabela de Participação (Quem Já Palpitou)
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
      ) : activeTab === 'tabela_pontos' ? (
        /* Ranking da Rodada em Tabela Compacta */
        <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="px-5 py-3.5 border-b border-cyan-500/20 bg-[#050b28]/90 flex items-center justify-between">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2 font-display">
              <UclTrophy className="w-4 h-4 text-amber-300" />
              Pontuação Conquistada na {currentRound?.nome}
            </h3>
            <span className="text-[10px] font-mono text-cyan-300 font-bold bg-cyan-950/80 px-2.5 py-0.5 rounded border border-cyan-500/30">
              {filteredBreakdown.length} participantes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#040822]/80 border-b border-cyan-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] font-mono">
                  <th className="py-3 px-4 w-14 text-center">Pos</th>
                  <th className="py-3 px-4">Participante</th>
                  <th className="py-3 px-4 text-center">Pontuação</th>
                  <th className="py-3 px-4 text-center">Acertos Resultado (+3)</th>
                  <th className="py-3 px-4 text-center">Placares Exatos (+2)</th>
                  <th className="py-3 px-4 text-center">Gols Capitão (+1)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-950/70">
                {filteredBreakdown.map((item, index) => {
                  const isTopOne = index === 0 && item.totalPontos > 0;
                  return (
                    <tr 
                      key={item.participante}
                      className={`hover:bg-cyan-950/40 transition-colors ${
                        isTopOne ? 'bg-gradient-to-r from-[#172554]/40 to-transparent' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-mono font-black text-cyan-300">
                        {isTopOne ? '👑 1º' : `${index + 1}º`}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setSelectedProfileParticipant(item.participante)}
                          className="font-bold text-white text-sm hover:text-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer text-left group"
                          title="Clique para ver o perfil completo deste participante"
                        >
                          <span className="group-hover:underline">{item.participante}</span>
                          <TrendingUp className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-200" />
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-mono font-black text-sm text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-3 py-1 rounded-full shadow-xs">
                          +{item.totalPontos} PTS
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                          {item.totalAcertosResultado}x (+{item.totalPontosResultado} pts)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40">
                          {item.totalAcertosPlacar}x (+{item.totalPontosPlacar} pts)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40">
                          {item.totalGolsCapitao} gols (+{item.totalPontosCapitao} pts)
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {filteredBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 text-xs font-mono">
                      Nenhum palpite encontrado para esta rodada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISUALIZAÇÃO PRINCIPAL: CARDS COM DISCRIMINAÇÃO DETALHADA POR JOGO - UEFA Broadcast */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
            <span>
              Mostrando <strong className="text-white">{filteredBreakdown.length}</strong> participantes que enviaram palpites
            </span>
            <span className="text-[11px] text-cyan-400 font-mono">
              ★ Resultado (+3) • Placar Exato (+2) • Capitão (+1/gol)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredBreakdown.map((item, index) => {
              const isFirst = index === 0 && item.totalPontos > 0;

              return (
                <div 
                  key={item.participante} 
                  className={`bg-[#080f33]/90 border rounded-2xl p-5 shadow-2xl transition-all flex flex-col justify-between backdrop-blur-md ${
                    isFirst 
                      ? 'border-amber-400/50 shadow-amber-950/40' 
                      : 'border-cyan-500/25 hover:border-cyan-400/50'
                  }`}
                >
                  {/* Topo do Card do Participante */}
                  <div>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-cyan-500/20">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm uppercase shadow-md ${
                          isFirst 
                            ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-black border border-amber-300' 
                            : 'bg-gradient-to-b from-[#0b1747] to-[#04081c] text-cyan-300 border border-cyan-500/40'
                        }`}>
                          {item.participante.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedProfileParticipant(item.participante)}
                              className="font-black text-white text-base hover:text-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer text-left group font-display"
                              title="Clique para ver o perfil completo deste participante"
                            >
                              <span className="group-hover:underline">{item.participante}</span>
                              <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-black tracking-wider uppercase font-mono">
                                Perfil ➔
                              </span>
                            </button>
                            {isFirst && (
                              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-black px-1.5 py-0.5 rounded uppercase font-mono">
                                ★ Líder da Rodada
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {item.jogosAvaliados.length} confrontos palpitados
                          </span>
                        </div>
                      </div>

                      {/* DESTAQUE DOS PONTOS GANHOS NESTA RODADA */}
                      <div className="text-right">
                        <span className="text-[9px] text-slate-400 uppercase font-black tracking-wider block font-mono">
                          Ganho na Rodada
                        </span>
                        <div className={`font-mono font-black text-xl sm:text-2xl leading-none ${
                          item.totalPontos > 0 ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]' : 'text-slate-500'
                        }`}>
                          +{item.totalPontos} <span className="text-xs">PTS</span>
                        </div>
                      </div>
                    </div>

                    {/* Resumo de badges de acerto do participante */}
                    <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
                      {item.totalAcertosResultado > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          {item.totalAcertosResultado}x Resultado (+{item.totalPontosResultado} pts)
                        </span>
                      )}
                      {item.totalAcertosPlacar > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 flex items-center gap-1 font-mono">
                          <UclTrophy className="w-3 h-3 text-cyan-400" />
                          {item.totalAcertosPlacar}x Placar Exato (+{item.totalPontosPlacar} pts)
                        </span>
                      )}
                      {item.totalPontosCapitao > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-mono">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          Capitão (+{item.totalPontosCapitao} pts)
                        </span>
                      )}
                      {item.totalPontos === 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-[#050b28] text-slate-400 border border-cyan-950 font-mono">
                          Nenhum acerto nesta rodada (0 pts)
                        </span>
                      )}
                    </div>

                    {/* LISTA DE JOGOS COM DISCRIMINAÇÃO DETALHADA */}
                    <div className="space-y-3">
                      {item.jogosAvaliados.map((jogoEval, jIdx) => {
                        const acertouRes = jogoEval.acertouResultado;
                        const acertouPlac = jogoEval.acertouPlacar;
                        const temCap = jogoEval.golsCapitao > 0;

                        return (
                          <div 
                            key={jIdx} 
                            className={`p-3 rounded-xl border transition-colors ${
                              jogoEval.pontos > 0 
                                ? 'bg-[#050c2c]/90 border-cyan-500/35' 
                                : 'bg-[#04081c]/80 border-cyan-950/70'
                            }`}
                          >
                            {/* Confronto Real vs Palpite */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-cyan-950">
                              <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                                  Confronto Oficial
                                </span>
                                <div className="font-black text-white text-xs sm:text-sm font-display">
                                  {jogoEval.resultadoRealFormatado !== '-' ? (
                                    <span>{jogoEval.resultadoRealFormatado}</span>
                                  ) : (
                                    <span>{jogoEval.jogoFormatado}</span>
                                  )}
                                </div>
                              </div>

                              <div className="sm:text-right">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                                  Palpite de {item.participante}
                                </span>
                                <div className="font-extrabold text-cyan-300 text-xs sm:text-sm font-mono">
                                  {jogoEval.guess.palpite}
                                </div>
                              </div>
                            </div>

                            {/* Capitão do palpite */}
                            {jogoEval.nomeCapitao && (
                              <div className="text-[11px] text-slate-300 font-medium mb-2 flex items-center gap-1.5 flex-wrap">
                                <span className="text-slate-400">Capitão indicado:</span>
                                <strong className="text-white">{jogoEval.nomeCapitao}</strong>
                                {jogoEval.golsCapitao > 0 ? (
                                  <span className="text-amber-300 font-bold bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.2 rounded text-[10px] font-mono">
                                    ⚽ Marcou {jogoEval.golsCapitao} gol(s)! (+{jogoEval.pontosCapitao} pts)
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-[10px] font-mono">
                                    (0 gols)
                                  </span>
                                )}
                              </div>
                            )}

                            {/* DISCRIMINAÇÃO DOS PONTOS DESTE JOGO */}
                            <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-1">
                                {acertouRes && !acertouPlac && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono">
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    Acertou Resultado (+3 pts)
                                  </span>
                                )}

                                {acertouPlac && !jogoEval.isSpecialZeroZero && (
                                  <>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono">
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      Resultado (+3 pts)
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-mono">
                                      <UclTrophy className="w-3 h-3 text-cyan-400" />
                                      Placar Exato (+2 pts)
                                    </span>
                                  </>
                                )}

                                {jogoEval.isSpecialZeroZero && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-mono">
                                    ⭐ Placar 0x0 Exato (+{jogoEval.pontos} pts)
                                  </span>
                                )}

                                {temCap && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 font-mono">
                                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                    Capitão (+{jogoEval.pontosCapitao} pts)
                                  </span>
                                )}

                                {!acertouRes && !acertouPlac && jogoEval.resultadoRealFormatado !== '-' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#04081c] text-slate-500 border border-cyan-950 font-mono">
                                    <XCircle className="w-3 h-3 text-slate-500" />
                                    Errou o resultado (0 pts)
                                  </span>
                                )}

                                {jogoEval.resultadoRealFormatado === '-' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#04081c] text-slate-500 border border-cyan-950 font-mono">
                                    Aguardando apuração
                                  </span>
                                )}
                              </div>

                              {/* Total de pontos deste jogo */}
                              <div className="font-mono font-black text-xs text-white bg-[#030617] px-2.5 py-1 rounded-lg border border-cyan-500/30 shadow-inner">
                                Total: <span className={jogoEval.pontos > 0 ? 'text-cyan-300' : 'text-slate-500'}>+{jogoEval.pontos} pts</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="mt-4 pt-3 border-t border-cyan-950 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-bold text-slate-300 flex items-center gap-1 font-mono">
                      <UclStarball className="w-3 h-3 text-cyan-400" />
                      {currentRound?.nome}
                    </span>
                    <span className="font-mono font-black text-cyan-300">
                      Total somado: +{item.totalPontos} pts
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredBreakdown.length === 0 && (
              <div className="col-span-full py-12 text-center text-xs text-slate-400 bg-[#080f33]/90 border border-dashed border-cyan-500/30 rounded-2xl font-mono">
                Nenhum palpite encontrado para esta rodada.
              </div>
            )}
          </div>
        </div>
      )}

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
