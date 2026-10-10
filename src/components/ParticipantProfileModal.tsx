import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Participante, Rodada, Palpite, JogoResultadoOficial, PontuacaoLog } from '../types';
import { calculateParticipantStats, ParticipantStats } from '../utils/participantStats';
import { 
  X, 
  Trophy, 
  Target, 
  Award, 
  Crown, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Sparkles, 
  Users, 
  CheckCircle2, 
  Calendar, 
  HelpCircle,
  ChevronDown,
  Activity
} from 'lucide-react';
import { UclStarball, UclTrophy, UclBadge } from './UclAssets';

interface ParticipantProfileModalProps {
  participantName: string;
  onClose: () => void;
  onSelectParticipant?: (name: string) => void;
}

export default function ParticipantProfileModal({
  participantName,
  onClose,
  onSelectParticipant
}: ParticipantProfileModalProps) {
  const [participants, setParticipants] = useState<Participante[]>([]);
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [guesses, setGuesses] = useState<Palpite[]>([]);
  const [officialResults, setOfficialResults] = useState<{ [roundId: string]: JogoResultadoOficial[] }>({});
  const [scoreLogs, setScoreLogs] = useState<PontuacaoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedName, setSelectedName] = useState<string>(participantName);
  const [hoveredRoundIndex, setHoveredRoundIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'grafico' | 'palpites'>('grafico');

  // Atualiza nome selecionado caso mude pela prop externa
  useEffect(() => {
    setSelectedName(participantName);
  }, [participantName]);

  // Carregar dados necessários do Firestore
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        const [pSnap, rSnap, gSnap, ofSnap, logsSnap] = await Promise.all([
          getDocs(query(collection(db, 'participantes'), orderBy('pontos', 'desc'))),
          getDocs(collection(db, 'rodadas')),
          getDocs(collection(db, 'palpites')),
          getDocs(collection(db, 'resultados_oficiais')),
          getDocs(query(collection(db, 'pontuacoes'), orderBy('data_hora', 'asc')))
        ]);

        if (!isMounted) return;

        const pList: Participante[] = [];
        pSnap.forEach(d => pList.push({ id: d.id, ...d.data() } as Participante));
        setParticipants(pList);

        const rList: Rodada[] = [];
        rSnap.forEach(d => rList.push({ id: d.id, ...d.data() } as Rodada));
        setRounds(rList);

        const gList: Palpite[] = [];
        gSnap.forEach(d => gList.push({ id: d.id, ...d.data() } as Palpite));
        setGuesses(gList);

        const ofMap: { [roundId: string]: JogoResultadoOficial[] } = {};
        ofSnap.forEach(d => {
          const data = d.data();
          const rId = data.rodada_id;
          if (rId) {
            if (!ofMap[rId]) ofMap[rId] = [];
            ofMap[rId].push({
              time_mandante: data.time_mandante,
              gols_mandante: data.gols_mandante,
              time_visitante: data.time_visitante,
              gols_visitante: data.gols_visitante,
              gols_jogadores: data.artilheiros || data.gols_jogadores || []
            });
          }
        });
        setOfficialResults(ofMap);

        const logsList: PontuacaoLog[] = [];
        logsSnap.forEach(d => logsList.push({ id: d.id, ...d.data() } as PontuacaoLog));
        setScoreLogs(logsList);

      } catch (err) {
        console.error("Erro ao carregar dados para o perfil:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Calcular estatísticas do participante selecionado
  const stats: ParticipantStats = useMemo(() => {
    return calculateParticipantStats(
      selectedName,
      participants,
      rounds,
      guesses,
      officialResults,
      scoreLogs
    );
  }, [selectedName, participants, rounds, guesses, officialResults, scoreLogs]);

  // Fechar no ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Lista ordenada de participantes para o dropdown
  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [participants]);

  // SVG Chart Dimensions
  const chartHeight = 220;
  const chartWidth = 560;
  const paddingX = 45;
  const paddingTop = 25;
  const paddingBottom = 40;

  // Gerar coordenadas dos pontos do gráfico
  const chartPoints = useMemo(() => {
    const history = stats.historicoPosicoes;
    if (history.length === 0) return [];

    const totalParticipantsCount = Math.max(stats.totalParticipantes, 36);
    // Min e max posições do histórico
    const minPos = 1; // Topo = 1º lugar
    const maxPos = Math.max(...history.map(h => h.posicao), 10);

    const availableWidth = chartWidth - paddingX * 2;
    const availableHeight = chartHeight - paddingTop - paddingBottom;

    return history.map((item, index) => {
      // Eixo X distribuído
      const x = history.length === 1 
        ? chartWidth / 2 
        : paddingX + (index / (history.length - 1)) * availableWidth;

      // Eixo Y: 1º lugar é o topo (y = paddingTop), pior lugar é o fundo (y = paddingTop + availableHeight)
      const range = maxPos - minPos || 1;
      const normalized = (item.posicao - minPos) / range;
      const y = paddingTop + normalized * availableHeight;

      return {
        x,
        y,
        posicao: item.posicao,
        rodadaNome: item.rodadaNome,
        numeroRodada: item.numeroRodada,
        pontosRodada: item.pontosRodada,
        pontosAcumulados: item.pontosAcumulados,
        variacao: item.variacao,
        record: item
      };
    });
  }, [stats.historicoPosicoes, stats.totalParticipantes]);

  // Linha SVG path (curva suave)
  const linePathD = useMemo(() => {
    if (chartPoints.length === 0) return '';
    if (chartPoints.length === 1) {
      return `M ${chartPoints[0].x - 30} ${chartPoints[0].y} L ${chartPoints[0].x + 30} ${chartPoints[0].y}`;
    }

    return chartPoints.reduce((acc, point, i) => {
      if (i === 0) return `M ${point.x} ${point.y}`;
      // Usar curva Bezier suave entre pontos
      const prev = chartPoints[i - 1];
      const cx1 = prev.x + (point.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (point.x - prev.x) / 2;
      const cy2 = point.y;
      return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${point.x} ${point.y}`;
    }, '');
  }, [chartPoints]);

  // Área preenchida sob a curva (gradiente verde)
  const areaPathD = useMemo(() => {
    if (chartPoints.length === 0) return '';
    const bottomY = chartHeight - paddingBottom;
    if (chartPoints.length === 1) {
      const p = chartPoints[0];
      return `M ${p.x - 30} ${p.y} L ${p.x + 30} ${p.y} L ${p.x + 30} ${bottomY} L ${p.x - 30} ${bottomY} Z`;
    }

    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    return `${linePathD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [chartPoints, linePathD]);

  const handleChangeParticipant = (name: string) => {
    setSelectedName(name);
    setHoveredRoundIndex(null);
    if (onSelectParticipant) onSelectParticipant(name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#030719]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-[#080f33]/95 w-full max-w-3xl rounded-2xl shadow-2xl shadow-black/80 border border-cyan-500/35 flex flex-col max-h-[92vh] overflow-hidden text-slate-100 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar - UEFA Champions League Broadcast */}
        <div className="bg-gradient-to-r from-[#0a1545] via-[#050b28] to-[#030719] border-b border-cyan-500/25 text-white p-5 sm:p-6 shrink-0 relative">
          {/* Botão Fechar */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white bg-white/10 hover:bg-cyan-500/30 p-2 rounded-full transition-colors cursor-pointer border border-cyan-500/20"
            title="Fechar Perfil (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-10">
            {/* Identificação do Participante */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-700 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-cyan-950/60 border border-cyan-300/40 font-display">
                  {selectedName.slice(0, 2).toUpperCase()}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-[#04081c] p-1 rounded-full border border-cyan-400/50">
                  <UclStarball className="w-3.5 h-3.5 text-cyan-400" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase font-display leading-tight drop-shadow-sm">
                    {selectedName}
                  </h2>
                  <span className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-md shadow-cyan-950/60 font-mono border border-cyan-300/30">
                    <UclTrophy className="w-3.5 h-3.5 text-cyan-200" />
                    {stats.posicaoAtual}º Lugar
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-300 mt-1 font-mono font-medium">
                  <span>Pontuação Geral: <strong className="text-cyan-300 text-sm font-black">{stats.pontosTotais} PTS</strong></span>
                  <span>•</span>
                  <span>{stats.totalParticipantes} Participantes UEFA</span>
                </div>
              </div>
            </div>

            {/* Dropdown seletor rápido para trocar de participante */}
            <div className="sm:self-end">
              <label className="block text-[10px] text-slate-400 uppercase font-black tracking-wider mb-1 font-mono">
                Trocar Participante
              </label>
              <div className="relative">
                <select
                  value={selectedName}
                  onChange={(e) => handleChangeParticipant(e.target.value)}
                  className="bg-[#050b28] text-white text-xs font-bold py-2 pl-3 pr-8 rounded-xl border border-cyan-500/40 hover:border-cyan-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-400 appearance-none cursor-pointer shadow-inner"
                >
                  {sortedParticipants.map(p => (
                    <option key={p.id} value={p.nome} className="bg-[#030617] text-white">
                      {p.nome} ({p.pontos} pts)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-cyan-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-6 bg-[#04081f]/80">
          {loading ? (
            <div className="py-20 text-center font-mono text-cyan-300 text-sm animate-pulse flex flex-col items-center justify-center gap-3">
              <UclStarball className="w-8 h-8 text-cyan-400 animate-spin" />
              Calculando estatísticas oficiais da Champions League...
            </div>
          ) : (
            <>
              {/* ============================================================== */}
              {/* OS 3 CARDS PRINCIPAIS                                          */}
              {/* 1. Acertos de Placar | 2. Acertos de Resultado | 3. Capitão Gol */}
              {/* ============================================================== */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono">
                    <UclStarball className="w-3.5 h-3.5 text-cyan-400" />
                    Estatísticas de Acertos UEFA
                  </h3>
                  <span className="text-[10px] text-cyan-400 font-bold uppercase font-mono">
                    Edição Europeia 2026
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* CARD 1: ACERTOS DE PLACAR */}
                  <div className="bg-[#050c2c]/90 rounded-2xl p-4.5 border border-cyan-500/35 shadow-xl hover:border-cyan-400 transition-all flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-cyan-500/10 rounded-bl-full -z-0 opacity-70 group-hover:scale-110 transition-transform"></div>
                    
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5 font-mono">
                          <Target className="w-4 h-4 text-cyan-400" />
                          Acertos de Placar
                        </span>
                        <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase font-mono">
                          +2 pts
                        </span>
                      </div>

                      <div className="text-3xl sm:text-4xl font-black text-white tracking-tight my-1 font-display">
                        {stats.acertosPlacar}
                      </div>

                      <p className="text-[11px] text-slate-400 font-medium leading-tight mt-1">
                        Critério oficial de desempate da copa.
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-cyan-950 flex items-center justify-between text-[10.5px] font-bold text-slate-400 relative z-10 font-mono">
                      <span>Placares Exatos:</span>
                      <strong className="text-cyan-300">{stats.acertosPlacar} cravadas</strong>
                    </div>
                  </div>

                  {/* CARD 2: ACERTOS DE RESULTADO */}
                  <div className="bg-[#050c2c]/90 rounded-2xl p-4.5 border border-blue-500/35 shadow-xl hover:border-blue-400 transition-all flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-bl-full -z-0 opacity-70 group-hover:scale-110 transition-transform"></div>

                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5 font-mono">
                          <Award className="w-4 h-4 text-blue-400" />
                          Acertos de Resultado
                        </span>
                        <span className="bg-blue-950/80 text-blue-300 border border-blue-500/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase font-mono">
                          +3 pts
                        </span>
                      </div>

                      <div className="text-3xl sm:text-4xl font-black text-white tracking-tight my-1 font-display">
                        {stats.acertosResultado}
                      </div>

                      <p className="text-[11px] text-slate-400 font-medium leading-tight mt-1">
                        Previu o clube vencedor ou empate europeu.
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-cyan-950 flex items-center justify-between text-[10.5px] font-bold text-slate-400 relative z-10 font-mono">
                      <span>Pontos por vitória/empate:</span>
                      <strong className="text-blue-300">3 pts / jogo</strong>
                    </div>
                  </div>

                  {/* CARD 3: CAPITÃO FEZ GOL */}
                  <div className="bg-[#050c2c]/90 rounded-2xl p-4.5 border border-amber-500/35 shadow-xl hover:border-amber-400 transition-all flex flex-col justify-between relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-bl-full -z-0 opacity-70 group-hover:scale-110 transition-transform"></div>

                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5 font-mono">
                          <Crown className="w-4 h-4 text-amber-400" />
                          Capitão Fez Gol
                        </span>
                        <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase font-mono">
                          +1 pt / gol
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2 my-1">
                        <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">
                          {stats.capitaoGolsVezes}
                        </span>
                        <span className="text-xs font-bold text-slate-400 uppercase font-mono">
                          {stats.capitaoGolsVezes === 1 ? 'vez' : 'vezes'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 font-medium leading-tight mt-1">
                        Vezes em que o capitão escalado marcou gol.
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-cyan-950 flex items-center justify-between text-[10.5px] font-bold text-slate-400 relative z-10 font-mono">
                      <span>Gols totais de capitães:</span>
                      <strong className="text-amber-300">{stats.capitaoGolsTotal} gols</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================== */}
              {/* NAVEGAÇÃO DE ABAS                                              */}
              {/* ============================================================== */}
              <div className="border-b border-cyan-500/20 flex items-center gap-2 pt-2">
                <button
                  onClick={() => setActiveTab('grafico')}
                  className={`pb-2.5 px-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 cursor-pointer font-mono ${
                    activeTab === 'grafico'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Gráfico de Posições na Tabela
                </button>
                <button
                  onClick={() => setActiveTab('palpites')}
                  className={`pb-2.5 px-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 cursor-pointer font-mono ${
                    activeTab === 'palpites'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  Histórico de Palpites ({stats.palpitesDetalhados.length})
                </button>
              </div>

              {/* ============================================================== */}
              {/* ABA 1: GRÁFICO DE POSIÇÕES                                     */}
              {/* ============================================================== */}
              {activeTab === 'grafico' && (
                <div className="space-y-4">
                  {/* Resumo Rápido de Posições */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#050b28] p-3 rounded-xl border border-cyan-500/25">
                      <span className="text-[10px] text-slate-400 uppercase font-black block font-mono">Posição Atual</span>
                      <span className="text-lg font-black text-white font-mono">{stats.posicaoAtual}º Lugar</span>
                    </div>
                    <div className="bg-[#050b28] p-3 rounded-xl border border-cyan-500/25">
                      <span className="text-[10px] text-slate-400 uppercase font-black block font-mono">Melhor Posição</span>
                      <span className="text-lg font-black text-cyan-300 font-mono">
                        {stats.melhorPosicao ? `${stats.melhorPosicao}º Lugar` : '—'}
                      </span>
                    </div>
                    <div className="bg-[#050b28] p-3 rounded-xl border border-cyan-500/25">
                      <span className="text-[10px] text-slate-400 uppercase font-black block font-mono">Pior Posição</span>
                      <span className="text-lg font-black text-slate-400 font-mono">
                        {stats.piorPosicao ? `${stats.piorPosicao}º Lugar` : '—'}
                      </span>
                    </div>
                    <div className="bg-[#050b28] p-3 rounded-xl border border-cyan-500/25">
                      <span className="text-[10px] text-slate-400 uppercase font-black block font-mono">Rodadas Jogadas</span>
                      <span className="text-lg font-black text-white font-mono">
                        {stats.historicoPosicoes.length}
                      </span>
                    </div>
                  </div>

                  {/* Card do Gráfico - UEFA Neon Grid */}
                  <div className="bg-[#050b28] rounded-2xl border border-cyan-500/30 p-4 sm:p-5 shadow-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-cyan-950 gap-2">
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-tight text-white flex items-center gap-1.5 font-display">
                          <TrendingUp className="w-4 h-4 text-cyan-400" />
                          Trajetória na Fase de Liga
                        </h4>
                        <p className="text-[11px] text-slate-400 font-bold uppercase mt-0.5 font-mono">
                          Evolução da colocação rodada a rodada (1º lugar no topo)
                        </p>
                      </div>

                      {chartPoints.length > 0 && (
                        <div className="flex items-center gap-3 text-xs font-bold font-mono">
                          <span className="flex items-center gap-1.5 text-cyan-300">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,240,255,0.8)]"></span>
                            Colocação do Participante
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Renderização do Gráfico SVG */}
                    {chartPoints.length === 0 ? (
                      <div className="py-14 px-4 text-center">
                        <div className="w-12 h-12 bg-[#04081c] border border-cyan-500/30 text-cyan-400 rounded-full flex items-center justify-center mx-auto mb-3">
                          <TrendingUp className="w-6 h-6" />
                        </div>
                        <h5 className="font-bold text-white text-sm mb-1 font-display">
                          Aguardando a conclusão da 1ª rodada
                        </h5>
                        <p className="text-xs text-slate-400 max-w-md mx-auto font-mono">
                          Assim que os placares oficiais de uma rodada forem lançados, o gráfico de evolução das posições aparecerá aqui automaticamente!
                        </p>
                      </div>
                    ) : (
                      <div className="pt-4 overflow-x-auto">
                        <div className="min-w-[500px]">
                          <svg 
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                            className="w-full h-auto overflow-visible select-none"
                          >
                            <defs>
                              <linearGradient id="profileAreaGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Linhas horizontais de referência */}
                            <line 
                              x1={paddingX} 
                              y1={paddingTop} 
                              x2={chartWidth - paddingX} 
                              y2={paddingTop} 
                              stroke="#0e2366" 
                              strokeDasharray="3 3" 
                            />
                            <text 
                              x={paddingX - 8} 
                              y={paddingTop + 4} 
                              textAnchor="end" 
                              className="text-[10px] fill-cyan-300 font-mono font-bold"
                            >
                              1º
                            </text>

                            <line 
                              x1={paddingX} 
                              y1={chartHeight / 2} 
                              x2={chartWidth - paddingX} 
                              y2={chartHeight / 2} 
                              stroke="#0a1742" 
                              strokeDasharray="2 2" 
                            />

                            <line 
                              x1={paddingX} 
                              y1={chartHeight - paddingBottom} 
                              x2={chartWidth - paddingX} 
                              y2={chartHeight - paddingBottom} 
                              stroke="#0e2366" 
                              strokeDasharray="3 3" 
                            />
                            <text 
                              x={paddingX - 8} 
                              y={chartHeight - paddingBottom + 4} 
                              textAnchor="end" 
                              className="text-[10px] fill-slate-500 font-mono font-bold"
                            >
                              {Math.max(...chartPoints.map(p => p.posicao), 7)}º
                            </text>

                            {/* Área sob a curva */}
                            <path 
                              d={areaPathD} 
                              fill="url(#profileAreaGradient)" 
                            />

                            {/* Linha principal */}
                            <path 
                              d={linePathD} 
                              fill="none" 
                              stroke="#00f0ff" 
                              strokeWidth="3.5" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              className="drop-shadow-[0_0_10px_rgba(0,240,255,0.7)]"
                            />

                            {/* Marcadores em cada ponto */}
                            {chartPoints.map((p, idx) => {
                              const isHovered = hoveredRoundIndex === idx;
                              const isBest = p.posicao === stats.melhorPosicao;

                              return (
                                <g 
                                  key={idx}
                                  className="cursor-pointer transition-all duration-200"
                                  onMouseEnter={() => setHoveredRoundIndex(idx)}
                                  onMouseLeave={() => setHoveredRoundIndex(null)}
                                >
                                  {/* Círculo externo com pulsante no hover */}
                                  <circle 
                                    cx={p.x} 
                                    cy={p.y} 
                                    r={isHovered ? 8 : 5.5} 
                                    fill={isBest ? "#f59e0b" : "#00f0ff"} 
                                    stroke="#04081c" 
                                    strokeWidth="2.5" 
                                    className="transition-all"
                                  />

                                  {/* Rótulo da rodada no eixo X */}
                                  <text 
                                    x={p.x} 
                                    y={chartHeight - paddingBottom + 20} 
                                    textAnchor="middle" 
                                    className={`text-[10px] font-mono font-bold ${
                                      isHovered ? 'fill-cyan-300 font-black' : 'fill-slate-500'
                                    }`}
                                  >
                                    R{p.numeroRodada}
                                  </text>

                                  {/* Badge flutuante acima do ponto */}
                                  <g transform={`translate(${p.x}, ${p.y - 14})`}>
                                    <rect 
                                      x="-14" 
                                      y="-12" 
                                      width="28" 
                                      height="14" 
                                      rx="4" 
                                      fill={isHovered ? "#00f0ff" : "#0a194e"} 
                                      stroke="#00f0ff"
                                      strokeWidth="0.8"
                                    />
                                    <text 
                                      x="0" 
                                      y="-2" 
                                      textAnchor="middle" 
                                      fill={isHovered ? "#000000" : "#ffffff"} 
                                      className="text-[8.5px] font-mono font-black"
                                    >
                                      {p.posicao}º
                                    </text>
                                  </g>
                                </g>
                              );
                            })}
                          </svg>
                        </div>

                        {/* Detalhe interativo ao passar o mouse */}
                        {hoveredRoundIndex !== null && chartPoints[hoveredRoundIndex] && (
                          <div className="mt-3 p-3 bg-[#06123d] border border-cyan-500/40 rounded-xl flex items-center justify-between text-xs animate-in fade-in duration-150">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-cyan-300 uppercase font-display">
                                {chartPoints[hoveredRoundIndex].rodadaNome}
                              </span>
                              <span className="text-slate-500">•</span>
                              <span className="font-mono font-black text-white">
                                {chartPoints[hoveredRoundIndex].posicao}º Lugar
                              </span>
                              {chartPoints[hoveredRoundIndex].variacao > 0 && (
                                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold px-1.5 py-0.2 rounded-sm flex items-center gap-0.5 font-mono">
                                  <TrendingUp className="w-3 h-3" />
                                  Subiu {chartPoints[hoveredRoundIndex].variacao} posições
                                </span>
                              )}
                              {chartPoints[hoveredRoundIndex].variacao < 0 && (
                                <span className="text-[10px] bg-rose-950 text-rose-300 border border-rose-500/40 font-bold px-1.5 py-0.2 rounded-sm flex items-center gap-0.5 font-mono">
                                  <TrendingDown className="w-3 h-3" />
                                  Caiu {Math.abs(chartPoints[hoveredRoundIndex].variacao)} posições
                                </span>
                              )}
                              {chartPoints[hoveredRoundIndex].variacao === 0 && (
                                <span className="text-[10px] bg-[#04081c] text-slate-400 border border-cyan-950 font-bold px-1.5 py-0.2 rounded-sm flex items-center gap-0.5 font-mono">
                                  <Minus className="w-3 h-3" />
                                  Manteve posição
                                </span>
                              )}
                            </div>

                            <div className="font-mono text-xs">
                              <span className="text-slate-400">Pontos na rodada: </span>
                              <strong className="text-cyan-300">+{chartPoints[hoveredRoundIndex].pontosRodada} pts</strong>
                              <span className="text-slate-600 mx-1.5">|</span>
                              <span className="text-slate-400">Acumulado: </span>
                              <strong className="text-white">{chartPoints[hoveredRoundIndex].pontosAcumulados} pts</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tabela de Variação Rodada a Rodada */}
                  {stats.historicoPosicoes.length > 0 && (
                    <div className="bg-[#050b28] rounded-2xl border border-cyan-500/25 overflow-hidden shadow-xl">
                      <div className="px-4 py-2.5 bg-[#030617] border-b border-cyan-950 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                          Histórico Detalhado por Rodada
                        </span>
                        <span className="text-[10px] text-cyan-300 font-mono">
                          {stats.historicoPosicoes.length} rodadas apuradas
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-sans text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-cyan-950 text-[10px] font-bold uppercase text-slate-400 bg-[#040822]/80 font-mono">
                              <th className="px-4 py-2">Rodada</th>
                              <th className="px-4 py-2 text-center">Posição</th>
                              <th className="px-4 py-2 text-center">Variação</th>
                              <th className="px-4 py-2 text-center">Placares</th>
                              <th className="px-4 py-2 text-center">Resultados</th>
                              <th className="px-4 py-2 text-right">Pts Rodada</th>
                              <th className="px-4 py-2 text-right">Pts Acumulado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-cyan-950/70 font-mono text-[11px]">
                            {stats.historicoPosicoes.map((h, i) => (
                              <tr key={i} className="hover:bg-cyan-950/40 transition-colors">
                                <td className="px-4 py-2.5 font-bold text-white font-sans">
                                  {h.rodadaNome}
                                </td>
                                <td className="px-4 py-2.5 text-center font-black">
                                  <span className={`inline-block px-2 py-0.5 rounded-sm ${
                                    h.posicao === 1 ? 'bg-amber-400 text-black font-black' :
                                    h.posicao <= 3 ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' :
                                    'text-slate-300'
                                  }`}>
                                    {h.posicao}º
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {h.variacao > 0 && (
                                    <span className="text-emerald-400 font-bold inline-flex items-center gap-0.5">
                                      <TrendingUp className="w-3 h-3" />
                                      +{h.variacao}
                                    </span>
                                  )}
                                  {h.variacao < 0 && (
                                    <span className="text-rose-400 font-bold inline-flex items-center gap-0.5">
                                      <TrendingDown className="w-3 h-3" />
                                      {h.variacao}
                                    </span>
                                  )}
                                  {h.variacao === 0 && (
                                    <span className="text-slate-500 font-bold inline-flex items-center gap-0.5">
                                      <Minus className="w-3 h-3" />
                                      0
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-center font-bold text-cyan-300">
                                  {h.acertosPlacarRodada > 0 ? `${h.acertosPlacarRodada} 🎯` : '0'}
                                </td>
                                <td className="px-4 py-2.5 text-center font-bold text-sky-300">
                                  {h.acertosResultadoRodada > 0 ? `${h.acertosResultadoRodada} ⚽` : '0'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-black text-cyan-300">
                                  +{h.pontosRodada}
                                </td>
                                <td className="px-4 py-2.5 text-right font-black text-white">
                                  {h.pontosAcumulados} pts
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================== */}
              {/* ABA 2: HISTÓRICO DE PALPITES DO PARTICIPANTE                   */}
              {/* ============================================================== */}
              {activeTab === 'palpites' && (
                <div className="space-y-3">
                  {stats.palpitesDetalhados.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 font-bold uppercase font-mono">
                      Nenhum palpite avaliado registrado para este participante até o momento.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {stats.palpitesDetalhados.map((item, idx) => (
                        <div 
                          key={idx}
                          className="bg-[#050b28] rounded-xl border border-cyan-500/25 p-3.5 shadow-xl flex flex-col justify-between space-y-2 hover:border-cyan-400/50 transition-colors"
                        >
                          <div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
                              <span className="font-bold text-slate-300">{item.rodadaNome}</span>
                              <span className="font-black text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-600/40">
                                +{item.pontosConcedidos} pts
                              </span>
                            </div>

                            <div className="font-bold text-white text-xs my-1 font-display">
                              {item.jogoOficial || item.palpiteTexto}
                            </div>

                            <div className="text-[11px] font-mono text-slate-200 bg-[#030617] px-2.5 py-1.5 rounded-lg border border-cyan-900/60">
                              Palpite: <strong className="text-cyan-300">{item.palpiteTexto}</strong>
                              {item.capitao && (
                                <span className="ml-2 text-amber-300 font-bold">
                                  (Cap: {item.capitao})
                                </span>
                              )}
                            </div>

                            {item.resultadoOficial && (
                              <div className="text-[11px] font-mono text-slate-300 mt-1">
                                Placar Oficial: <strong className="text-white">{item.resultadoOficial}</strong>
                              </div>
                            )}
                          </div>

                          {/* Badges de Conquistas neste Palpite */}
                          <div className="pt-2 border-t border-cyan-950 flex items-center gap-1.5 flex-wrap font-mono">
                            {item.acertouPlacar && (
                              <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                Placar Exato (+2)
                              </span>
                            )}
                            {item.acertouResultado && (
                              <span className="bg-blue-950/80 text-blue-300 border border-blue-500/40 text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-1">
                                <Award className="w-3 h-3" />
                                Acertou Resultado (+3)
                              </span>
                            )}
                            {item.golsCapitao > 0 && (
                              <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase flex items-center gap-1">
                                <Crown className="w-3 h-3" />
                                Capitão {item.golsCapitao} {item.golsCapitao === 1 ? 'gol' : 'gols'} (+{item.golsCapitao})
                              </span>
                            )}
                            {!item.acertouResultado && !item.acertouPlacar && item.golsCapitao === 0 && (
                              <span className="bg-[#030617] text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase border border-cyan-950">
                                Não pontuou
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Bottom Bar */}
        <div className="bg-[#050b28]/95 border-t border-cyan-500/25 px-6 py-3.5 flex items-center justify-between text-xs shrink-0 font-mono">
          <div className="text-slate-400 font-medium">
            Visualizando perfil UEFA de <strong className="text-white">{selectedName}</strong>
          </div>
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs px-5 py-2 rounded-xl transition-all cursor-pointer shadow-md shadow-cyan-950/60 uppercase"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
