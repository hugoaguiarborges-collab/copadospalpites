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
        // Palpites da rodada selecionada
        const qPalpites = query(
          collection(db, 'palpites'),
          where('rodada', '==', selectedRoundId),
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
    <div className="space-y-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-neutral-200 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-6 bg-[#009739] block rounded-sm"></span>
            <h1 className="text-2xl font-black tracking-tight text-neutral-800 uppercase">
              Palpites de Rodadas Anteriores & Pontuações
            </h1>
          </div>
          <p className="text-xs text-neutral-400 mt-1 uppercase tracking-widest font-bold">
            Consulte os palpites revelados, placares oficiais e a discriminação exata de pontos conquistados por jogo.
          </p>
        </div>

        {/* Seletor rápido de rodada */}
        <div className="flex items-center gap-2 bg-neutral-100 p-1.5 rounded-xl border border-neutral-200">
          <label htmlFor="round-select-history" className="text-xs font-bold text-neutral-600 pl-2">
            Rodada:
          </label>
          <select
            id="round-select-history"
            value={selectedRoundId}
            onChange={(e) => setSelectedRoundId(e.target.value)}
            className="bg-white border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-black text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739]"
          >
            {rounds.map(r => {
              const rNum = getRoundNumber(r.nome || r.id);
              const isEncerrada = r.status === 'encerrada';
              const isTest = r.is_test || r.id === 'rodada-teste';
              return (
                <option key={r.id} value={r.id}>
                  {isTest ? '🧪 [TESTE] ' : ''}{r.nome} {isEncerrada ? '(Encerrada e Apurada)' : '(Em andamento)'}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Banner da Rodada Selecionada */}
      {currentRound && (
        <div className="bg-white border-2 border-neutral-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                currentRound.status === 'encerrada'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}>
                {currentRound.status === 'encerrada' ? (
                  <>
                    <Lock className="w-3 h-3 text-rose-400" />
                    Rodada Encerrada & Apurada
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-emerald-600" />
                    Mercado Aberto
                  </>
                )}
              </span>
              <span className="text-xs text-neutral-400 font-bold font-mono">
                ID: {currentRound.id}
              </span>
            </div>
            <h2 className="text-xl font-black text-neutral-900 uppercase">
              {currentRound.nome}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5 font-medium">
              Fechamento oficial de mercado: <strong className="text-neutral-700">Terça-feira às 13:00</strong> ({formatDateTimeDisplay(currentRound.fechamento)})
            </p>
          </div>

          {/* KPI Cards Rápidos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center min-w-[90px]">
              <span className="text-[10px] text-neutral-400 font-bold uppercase block">Palpitaram</span>
              <span className="text-lg font-black font-mono text-neutral-800">{roundStats.totalPalpitaram}</span>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-center min-w-[90px]">
              <span className="text-[10px] text-neutral-400 font-bold uppercase block">Jogos Oficiais</span>
              <span className="text-lg font-black font-mono text-neutral-800">{officialGames.length}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center min-w-[90px]">
              <span className="text-[10px] text-emerald-700 font-bold uppercase block">Média Pts</span>
              <span className="text-lg font-black font-mono text-emerald-800">{roundStats.mediaPontos}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center min-w-[90px]">
              <span className="text-[10px] text-amber-700 font-bold uppercase block">Maior Pontuação</span>
              <span className="text-lg font-black font-mono text-amber-800">+{roundStats.maiorPontuacao} pts</span>
            </div>
          </div>
        </div>
      )}

      {/* Jogos & Placares Oficiais desta Rodada */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-700">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400">
              Placares Oficiais da Rodada ({officialGames.length} jogos avaliados)
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">
            Atualização da Administração
          </span>
        </div>

        {officialGames.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-400">
            <p className="font-semibold text-neutral-300 mb-1">
              ⏳ Nenhum placar oficial foi lançado para esta rodada ainda.
            </p>
            <p className="text-[11px] text-neutral-400">
              Assim que o administrador cadastrar os placares oficiais em <em>Administração &gt; Lançamento de Resultados</em>, a pontuação de todos será calculada e discriminada aqui automaticamente!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {officialGames.map((og, idx) => (
              <div 
                key={idx} 
                className="bg-neutral-800/90 border border-neutral-700 rounded-xl p-3 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-xs text-neutral-200 truncate flex-1">
                    {og.time_mandante}
                  </span>
                  <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-neutral-600 font-mono font-black text-sm text-amber-300 whitespace-nowrap">
                    {og.gols_mandante} x {og.gols_visitante}
                  </div>
                  <span className="font-extrabold text-xs text-neutral-200 truncate flex-1 text-right">
                    {og.time_visitante}
                  </span>
                </div>

                {og.gols_jogadores && og.gols_jogadores.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-neutral-700/60 text-[10px] text-neutral-400 flex flex-wrap gap-1 items-center">
                    <span className="font-bold text-amber-400/90">⚽ Gols:</span>
                    {og.gols_jogadores.map((gj, jIdx) => (
                      <span key={jIdx} className="bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-300 font-medium">
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

      {/* Alternador de Visualização & Barra de Busca */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        {/* Abas */}
        <div className="flex items-center gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('detalhes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'detalhes'
                ? 'bg-[#009739] text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 bg-neutral-100'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Palpites & Pontos por Jogo
          </button>
          <button
            onClick={() => setActiveTab('tabela_pontos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tabela_pontos'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 bg-neutral-100'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            Ranking da Rodada
          </button>
          <button
            onClick={() => setActiveTab('participacao')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'participacao'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 bg-neutral-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Quem Palpitou ({roundStats.totalPalpitaram})
          </button>
        </div>

        {/* Busca por participante */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar participante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-medium text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739]"
          >
          </input>
        </div>
      </div>

      {/* Conteúdo Principal de acordo com a aba selecionada */}
      {loadingRoundData ? (
        <div className="py-16 text-center text-xs font-mono font-bold text-neutral-400 animate-pulse">
          Carregando palpites e apurações da rodada...
        </div>
      ) : (!isMarketClosed && !currentRound?.is_test && activeTab !== 'participacao') ? (
        /* Sigilo Oficial durante a rodada aberta */
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-8 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-black uppercase text-amber-600 bg-amber-100 px-2.5 py-0.5 rounded-full">
              Sigilo Absoluto Ativo
            </span>
            <h3 className="text-xl font-black text-neutral-800 uppercase mt-2">
              Palpites Confidenciais durante o Mercado Aberto
            </h3>
            <p className="text-xs text-neutral-500 max-w-lg mx-auto mt-2 leading-relaxed font-medium">
              Os palpites de cada participante nesta rodada oficial permanecem em sigilo absoluto até o encerramento do mercado (<strong>terça-feira às 13:00</strong>) e o lançamento dos placares oficiais pela administração.
            </p>
          </div>
          <div className="pt-2 flex justify-center">
            <button
              onClick={() => setActiveTab('participacao')}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-2"
            >
              <Users className="w-4 h-4 text-[#009739]" /> Ver Tabela de Participação (Quem Já Palpitou)
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
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
            <h3 className="font-bold text-neutral-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#009739]" />
              Pontuação Conquistada na {currentRound?.nome}
            </h3>
            <span className="text-[10px] font-mono text-neutral-500 font-bold">
              {filteredBreakdown.length} participantes
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-neutral-100/60 border-b border-neutral-200 text-neutral-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-14 text-center">Pos</th>
                  <th className="py-3 px-4">Participante</th>
                  <th className="py-3 px-4 text-center">Acertos Resultado (+3)</th>
                  <th className="py-3 px-4 text-center">Placares Exatos (+2)</th>
                  <th className="py-3 px-4 text-center">Gols Capitão (+1)</th>
                  <th className="py-3 px-4 text-right">Pontos na Rodada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-150">
                {filteredBreakdown.map((item, index) => {
                  const isTopOne = index === 0 && item.totalPontos > 0;
                  return (
                    <tr 
                      key={item.participante}
                      className={`hover:bg-neutral-50/70 transition-colors ${
                        isTopOne ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-mono font-black text-neutral-500">
                        {isTopOne ? '👑 1º' : `${index + 1}º`}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setSelectedProfileParticipant(item.participante)}
                          className="font-bold text-neutral-900 text-sm hover:text-[#009739] transition-colors flex items-center gap-1.5 cursor-pointer text-left group"
                          title="Clique para ver o perfil completo deste participante"
                        >
                          <span className="group-hover:underline">{item.participante}</span>
                          <TrendingUp className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#009739]" />
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {item.totalAcertosResultado}x (+{item.totalPontosResultado} pts)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {item.totalAcertosPlacar}x (+{item.totalPontosPlacar} pts)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          {item.totalGolsCapitao} gols (+{item.totalPontosCapitao} pts)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-black text-base text-neutral-900">
                          +{item.totalPontos} PTS
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {filteredBreakdown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-400 text-xs">
                      Nenhum palpite encontrado para esta rodada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISUALIZAÇÃO PRINCIPAL: CARDS COM DISCRIMINAÇÃO DETALHADA POR JOGO */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold px-1">
            <span>
              Mostrando <strong className="text-neutral-800">{filteredBreakdown.length}</strong> participantes que enviaram palpites
            </span>
            <span className="text-[11px] text-neutral-400">
              💡 Pontuação diferenciada por acerto de resultado (+3), placar exato (+2) e capitão (+1/gol).
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredBreakdown.map((item, index) => {
              const isFirst = index === 0 && item.totalPontos > 0;

              return (
                <div 
                  key={item.participante} 
                  className={`bg-white border-2 rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between ${
                    isFirst 
                      ? 'border-amber-300 ring-2 ring-amber-100' 
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  {/* Topo do Card do Participante */}
                  <div>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm uppercase ${
                          isFirst 
                            ? 'bg-amber-100 text-amber-800 border-2 border-amber-300' 
                            : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                        }`}>
                          {item.participante.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedProfileParticipant(item.participante)}
                              className="font-extrabold text-neutral-900 text-base hover:text-[#009739] transition-colors flex items-center gap-1.5 cursor-pointer text-left group"
                              title="Clique para ver o perfil completo deste participante"
                            >
                              <span className="group-hover:underline">{item.participante}</span>
                              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-black tracking-wider uppercase">
                                Perfil ➔
                              </span>
                            </button>
                            {isFirst && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded uppercase">
                                ★ Líder da Rodada
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {item.jogosAvaliados.length} palpites registrados
                          </span>
                        </div>
                      </div>

                      {/* DESTAQUE GIGANTE DOS PONTOS GANHOS NESTA RODADA */}
                      <div className="text-right">
                        <span className="text-[10px] text-neutral-400 uppercase font-black tracking-wider block">
                          Ganho na Rodada
                        </span>
                        <div className={`font-mono font-black text-xl sm:text-2xl leading-none ${
                          item.totalPontos > 0 ? 'text-[#009739]' : 'text-neutral-500'
                        }`}>
                          +{item.totalPontos} <span className="text-xs">PTS</span>
                        </div>
                      </div>
                    </div>

                    {/* Resumo rápido de badges de acerto do participante */}
                    <div className="flex flex-wrap gap-1.5 mb-4 text-[11px]">
                      {item.totalAcertosResultado > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {item.totalAcertosResultado}x Resultado (+{item.totalPontosResultado} pts)
                        </span>
                      )}
                      {item.totalAcertosPlacar > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                          <Trophy className="w-3 h-3" />
                          {item.totalAcertosPlacar}x Placar Exato (+{item.totalPontosPlacar} pts)
                        </span>
                      )}
                      {item.totalPontosCapitao > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          Capitão (+{item.totalPontosCapitao} pts)
                        </span>
                      )}
                      {item.totalPontos === 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold bg-neutral-100 text-neutral-500 border border-neutral-200">
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
                                ? 'bg-neutral-50/80 border-neutral-200' 
                                : 'bg-neutral-50/40 border-neutral-150'
                            }`}
                          >
                            {/* Confronto Real vs Palpite */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-2 border-b border-neutral-200/60">
                              <div>
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                                  Confronto Oficial
                                </span>
                                <div className="font-black text-neutral-900 text-xs sm:text-sm">
                                  {jogoEval.resultadoRealFormatado !== '-' ? (
                                    <span>{jogoEval.resultadoRealFormatado}</span>
                                  ) : (
                                    <span>{jogoEval.jogoFormatado}</span>
                                  )}
                                </div>
                              </div>

                              <div className="sm:text-right">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                                  Palpite de {item.participante}
                                </span>
                                <div className="font-extrabold text-[#009739] text-xs sm:text-sm">
                                  {jogoEval.guess.palpite}
                                </div>
                              </div>
                            </div>

                            {/* Capitão do palpite */}
                            {jogoEval.nomeCapitao && (
                              <div className="text-[11px] text-neutral-500 font-medium mb-2 flex items-center gap-1.5">
                                <span className="text-neutral-400">Capitão indicado:</span>
                                <strong className="text-neutral-800">{jogoEval.nomeCapitao}</strong>
                                {jogoEval.golsCapitao > 0 ? (
                                  <span className="text-amber-700 font-bold bg-amber-100 px-1.5 py-0.2 rounded text-[10px]">
                                    ⚽ Marcou {jogoEval.golsCapitao} gol(s)! (+{jogoEval.pontosCapitao} pts)
                                  </span>
                                ) : (
                                  <span className="text-neutral-400 text-[10px]">
                                    (0 gols)
                                  </span>
                                )}
                              </div>
                            )}

                            {/* DISCRIMINAÇÃO DOS PONTOS DESTE JOGO (Conforme solicitado pelo usuário!) */}
                            <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-1">
                                {/* Badge de Acerto de Resultado */}
                                {acertouRes && !acertouPlac && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    Acertou o Resultado (+3 pts)
                                  </span>
                                )}

                                {/* Badge de Acerto de Placar Exato */}
                                {acertouPlac && !jogoEval.isSpecialZeroZero && (
                                  <>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      Resultado (+3 pts)
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                                      <Trophy className="w-3 h-3 text-blue-600" />
                                      Placar Exato (+2 pts)
                                    </span>
                                  </>
                                )}

                                {/* Caso Especial 0x0 */}
                                {jogoEval.isSpecialZeroZero && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-purple-100 text-purple-800 border border-purple-300">
                                    ⭐ Placar 0x0 Exato (+{jogoEval.pontos} pts)
                                  </span>
                                )}

                                {/* Bônus de Capitão */}
                                {temCap && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    <Star className="w-3 h-3 text-amber-600 fill-amber-500" />
                                    Capitão (+{jogoEval.pontosCapitao} pts)
                                  </span>
                                )}

                                {/* Errou resultado */}
                                {!acertouRes && !acertouPlac && jogoEval.resultadoRealFormatado !== '-' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-200/80 text-neutral-600">
                                    <XCircle className="w-3 h-3 text-neutral-400" />
                                    Errou o resultado (0 pts)
                                  </span>
                                )}

                                {jogoEval.resultadoRealFormatado === '-' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-100 text-neutral-500">
                                    Aguardando apuração
                                  </span>
                                )}
                              </div>

                              {/* Total de pontos deste jogo */}
                              <div className="font-mono font-black text-xs sm:text-sm text-neutral-900 bg-white px-2 py-0.5 rounded border border-neutral-200 shadow-2xs">
                                Total do jogo: <span className={jogoEval.pontos > 0 ? 'text-[#009739]' : 'text-neutral-500'}>+{jogoEval.pontos} pts</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="mt-4 pt-3 border-t border-neutral-150 flex items-center justify-between text-[11px] text-neutral-500">
                    <span className="font-bold text-neutral-600">
                      Copa dos Palpites • {currentRound?.nome}
                    </span>
                    <span className="font-mono font-extrabold text-neutral-800">
                      Total somado: +{item.totalPontos} pts
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredBreakdown.length === 0 && (
              <div className="col-span-full py-12 text-center text-xs text-neutral-400 bg-white border border-dashed border-neutral-200 rounded-2xl">
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
