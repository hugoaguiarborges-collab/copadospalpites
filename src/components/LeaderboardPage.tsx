import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Participante, Palpite } from '../types';
import { 
  Users, 
  Award, 
  TrendingUp, 
  Target, 
  Crown, 
  Flame, 
  ArrowUp, 
  ArrowDown, 
  Minus,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Star,
  Search,
  Filter,
  Rocket,
  BarChart3,
  CheckCircle2,
  Pin
} from 'lucide-react';
import ParticipantProfileModal from './ParticipantProfileModal';
import { UclStarball, UclTrophy, UclBadge } from './UclAssets';

interface ScoreLog {
  id: string;
  participante: string;
  pontos: number;
  motivo?: string;
  data_hora: string;
}

export default function LeaderboardPage() {
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [scoreLogs, setScoreLogs] = useState<ScoreLog[]>([]);
  const [palpites, setPalpites] = useState<Palpite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfileParticipant, setSelectedProfileParticipant] = useState<string | null>(null);

  // Filtros e busca interativos (Pontos Corridos)
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'todos' | 'podio' | 'naifo'>('todos');
  const [sortBy, setSortBy] = useState<'pontos' | 'placares' | 'subida' | 'nome'>('pontos');

  // Participante fixado / favorito ("Marcar Eu")
  const [pinnedParticipant, setPinnedParticipant] = useState<string>(() => {
    try {
      return localStorage.getItem('bolao_pinned_participant') || '';
    } catch {
      return '';
    }
  });

  const handleTogglePin = (name: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newPinned = pinnedParticipant === name ? '' : name;
    setPinnedParticipant(newPinned);
    try {
      if (newPinned) {
        localStorage.setItem('bolao_pinned_participant', newPinned);
      } else {
        localStorage.removeItem('bolao_pinned_participant');
      }
    } catch {
      // Ignora erro de localStorage
    }
  };

  // Escuta em tempo real dos participantes ordenados por pontos
  useEffect(() => {
    const qP = query(
      collection(db, 'participantes'),
      orderBy('pontos', 'desc')
    );

    const unsubscribeP = onSnapshot(qP, (snapshot) => {
      const pList: Participante[] = [];
      snapshot.forEach((doc) => {
        pList.push({ id: doc.id, ...doc.data() } as Participante);
      });
      // Ordenação oficial de pontos corridos: Pontos (desc) -> Acertos de Placar (desc) -> Ordem Alfabética
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
      console.error("Erro ao carregar participantes do ranking:", err);
      setLoading(false);
    });

    // Carregar logs de pontuação para calcular evolução de posições e destaque da rodada
    const qLogs = query(collection(db, 'pontuacoes'), orderBy('data_hora', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, (snap) => {
      const list: ScoreLog[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as ScoreLog);
      });
      setScoreLogs(list);
    }, (err) => {
      console.warn("Aviso ao carregar logs de pontuação:", err);
    });

    // Carregar palpites para cálculo exato de placares
    getDocs(collection(db, 'palpites')).then(snap => {
      const gList: Palpite[] = [];
      snap.forEach(d => gList.push({ id: d.id, ...d.data() } as Palpite));
      setPalpites(gList);
    }).catch(err => console.warn("Aviso ao carregar palpites:", err));

    return () => {
      unsubscribeP();
      unsubscribeLogs();
    };
  }, []);

  // 1. Cálculo dos pontos da última rodada apurada por participante
  const latestRoundScores = useMemo(() => {
    const map: Record<string, number> = {};
    scoreLogs.forEach(log => {
      const pName = log.participante;
      const pts = Number(log.pontos || 0);
      if (pName && map[pName] === undefined && pts >= 0) {
        map[pName] = pts;
      }
    });
    return map;
  }, [scoreLogs]);

  // 2. Placares exatos por participante
  const placaresExatosMap = useMemo(() => {
    const map: Record<string, number> = {};
    palpites.forEach(g => {
      if (g.acertou_placar && g.participante) {
        map[g.participante] = (map[g.participante] || 0) + 1;
      }
    });
    return map;
  }, [palpites]);

  // 3. Variação de Posição (Subiu / Desceu / Manteve)
  const rankMovements = useMemo(() => {
    if (participantes.length === 0) return {};

    const prevStandings = participantes.map(p => {
      const recentGain = latestRoundScores[p.nome] || 0;
      const prevPts = Math.max(0, (p.pontos || 0) - recentGain);
      return { nome: p.nome, prevPts };
    }).sort((a, b) => b.prevPts - a.prevPts);

    const movements: Record<string, number> = {};
    participantes.forEach((p, currIndex) => {
      const currRank = currIndex + 1;
      const prevIndex = prevStandings.findIndex(ps => ps.nome.toLowerCase() === p.nome.toLowerCase());
      const prevRank = prevIndex !== -1 ? prevIndex + 1 : currRank;
      movements[p.nome] = prevRank - currRank; // > 0 subiu, < 0 caiu, 0 manteve
    });

    return movements;
  }, [participantes, latestRoundScores]);

  // 4. Cálculo do participante "On Fire" (maior pontuador da última rodada)
  const onFireParticipant = useMemo(() => {
    let topName = '';
    let topPts = 0;
    Object.entries(latestRoundScores).forEach(([name, pts]) => {
      const numPts = Number(pts || 0);
      if (numPts > topPts) {
        topPts = numPts;
        topName = name;
      }
    });
    return topPts > 0 ? { name: topName, points: topPts } : null;
  }, [latestRoundScores]);

  // 5. Cálculo do "naifo da rodada 😂🏳️‍🌈" (pior pontuador da última rodada apurada)
  const naifoDaRodada = useMemo(() => {
    const entries = Object.entries(latestRoundScores);
    if (entries.length === 0) return null;
    let minPts = Infinity;
    let worstName = '';
    entries.forEach(([name, pts]) => {
      const numPts = Number(pts || 0);
      if (numPts < minPts) {
        minPts = numPts;
        worstName = name;
      }
    });
    return minPts < Infinity && worstName ? { name: worstName, points: minPts } : null;
  }, [latestRoundScores]);

  // 6. Cálculo do participante "Mestre dos Placares" (mais placares exatos cravados)
  const topPlacaresParticipant = useMemo(() => {
    let topName = '';
    let topCount = 0;
    participantes.forEach(p => {
      const c = placaresExatosMap[p.nome] ?? p.acertos_placar ?? 0;
      if (c > topCount) {
        topCount = c;
        topName = p.nome;
      }
    });
    return topCount > 0 ? { name: topName, count: topCount } : null;
  }, [participantes, placaresExatosMap]);

  // 7. Participante com a maior subida de posições (Maior Escalada 🚀)
  const topClimber = useMemo(() => {
    let bestClimber = '';
    let maxJump = 0;
    Object.entries(rankMovements).forEach(([name, jump]) => {
      const numJump = Number(jump || 0);
      if (numJump > maxJump) {
        maxJump = numJump;
        bestClimber = name;
      }
    });
    return maxJump > 0 ? { name: bestClimber, jump: maxJump } : null;
  }, [rankMovements]);

  const totalParticipantes = participantes.length;
  const lider = totalParticipantes > 0 ? participantes[0] : null;
  const liderPontos = lider ? lider.pontos : 0;
  const segundo = totalParticipantes > 1 ? participantes[1] : null;
  const terceiro = totalParticipantes > 2 ? participantes[2] : null;
  const naifoDoCampeonato = totalParticipantes > 0 ? participantes[totalParticipantes - 1] : null;

  // Informações do participante fixado pelo usuário
  const pinnedData = useMemo(() => {
    if (!pinnedParticipant) return null;
    const index = participantes.findIndex(p => p.nome.toLowerCase() === pinnedParticipant.toLowerCase());
    if (index === -1) return null;
    const p = participantes[index];
    const rank = index + 1;
    const gapToLeader = liderPontos - p.pontos;
    const isNaifo = rank === totalParticipantes;
    return {
      participante: p,
      rank,
      gapToLeader,
      isNaifo
    };
  }, [pinnedParticipant, participantes, liderPontos, totalParticipantes]);

  // Filtragem e ordenação dos participantes
  const filteredAndSortedParticipants = useMemo(() => {
    let list = [...participantes];

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter(p => p.nome.toLowerCase().includes(term));
    }

    // Filtros rápidos
    if (selectedFilter === 'podio') {
      list = list.slice(0, 3);
    } else if (selectedFilter === 'naifo') {
      if (list.length > 0) {
        list = [list[list.length - 1]];
      }
    }

    // Ordenação personalizada
    if (sortBy === 'placares') {
      list.sort((a, b) => {
        const pA = placaresExatosMap[a.nome] ?? a.acertos_placar ?? 0;
        const pB = placaresExatosMap[b.nome] ?? b.acertos_placar ?? 0;
        if (pB !== pA) return pB - pA;
        return b.pontos - a.pontos;
      });
    } else if (sortBy === 'subida') {
      list.sort((a, b) => {
        const jA = rankMovements[a.nome] || 0;
        const jB = rankMovements[b.nome] || 0;
        if (jB !== jA) return jB - jA;
        return b.pontos - a.pontos;
      });
    } else if (sortBy === 'nome') {
      list.sort((a, b) => a.nome.localeCompare(b.nome));
    }

    return list;
  }, [participantes, searchTerm, selectedFilter, sortBy, placaresExatosMap, rankMovements]);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden font-sans">
      {/* CABEÇALHO OFICIAL CHAMPIONS LEAGUE - PONTOS CORRIDOS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-cyan-500/20 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UclBadge text="UEFA CHAMPIONS LEAGUE" variant="cyan" />
            <span className="text-[10px] font-mono text-cyan-400 tracking-wider uppercase font-bold">
              CLASSIFICAÇÃO GERAL • PONTOS CORRIDOS
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase flex items-center gap-2.5 font-display drop-shadow-sm">
            <div className="w-2.5 h-7 bg-gradient-to-b from-cyan-400 via-blue-500 to-indigo-600 rounded-xs shadow-md shadow-cyan-500/20" />
            Tabela de Pontos Corridos
          </h1>
          <p className="text-xs text-slate-300 mt-1 uppercase tracking-wider font-semibold font-mono flex items-center gap-2">
            <span>Campeonato por pontos corridos • Desempate Oficial por Placares Exatos (🎯)</span>
          </p>
        </div>

        {/* Ações Rápidas: Fixar Participante + Perfil */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={pinnedParticipant}
            onChange={(e) => handleTogglePin(e.target.value)}
            className="bg-[#050b28] border border-amber-500/40 hover:border-amber-400 text-amber-200 text-xs font-bold py-2 px-3 rounded-xl shadow-lg cursor-pointer focus:outline-hidden"
            title="Escolha seu nome para fixar sua linha e ver seu status"
          >
            <option value="">⭐️ Fixar Meu Perfil no Ranking...</option>
            {[...participantes].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => (
              <option key={p.id} value={p.nome}>
                ⭐️ {p.nome} ({p.pontos} pts)
              </option>
            ))}
          </select>

          {participantes.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setSelectedProfileParticipant(e.target.value);
              }}
              className="bg-[#050b28] border border-cyan-500/40 hover:border-cyan-400 text-slate-100 text-xs font-bold py-2 px-3 rounded-xl shadow-lg cursor-pointer focus:outline-hidden"
            >
              <option value="">👤 Ver Perfil de Alguém...</option>
              {[...participantes].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => (
                <option key={p.id} value={p.nome}>
                  {p.nome} ({p.pontos} pts • 🎯 {placaresExatosMap[p.nome] || p.acertos_placar || 0})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* BANNER DO PARTICIPANTE FIXADO (SELECIONADO PELO USUÁRIO) */}
      {pinnedData && (
        <div className="bg-gradient-to-r from-cyan-950/80 via-[#0a1b4d] to-[#08133b] border-2 border-cyan-400/60 rounded-2xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-lg shadow-md shrink-0">
              ⭐️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-black uppercase text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">
                  MEU STATUS NO CAMPEONATO
                </span>
                <span className="font-mono font-black text-xs text-cyan-300">
                  {pinnedData.rank}º Lugar de {totalParticipantes} • {pinnedData.participante.pontos} PTS
                </span>
                {pinnedData.rank === 1 ? (
                  <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/90 px-2 py-0.5 rounded border border-amber-400/50">
                    👑 Líder Isolado
                  </span>
                ) : pinnedData.isNaifo ? (
                  <span className="text-[10px] font-mono font-bold text-rose-300 bg-rose-950/90 px-2 py-0.5 rounded border border-rose-500/50">
                    o naifo do campeonato 🏳️‍🌈
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold text-slate-300 bg-[#050b28] px-2 py-0.5 rounded border border-cyan-500/30">
                    Distância para o 1º: -{pinnedData.gapToLeader} pts
                  </span>
                )}
              </div>
              <p className="text-xs text-white font-bold mt-1">
                Você é <strong>{pinnedData.participante.nome}</strong>, com 🎯 {placaresExatosMap[pinnedData.participante.nome] || pinnedData.participante.acertos_placar || 0} placares exatos cravados!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedProfileParticipant(pinnedData.participante.nome)}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer flex items-center gap-1 shadow-md"
            >
              <span>Ver Meu Perfil</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleTogglePin(pinnedData.participante.nome)}
              className="px-2.5 py-1.5 bg-[#050b28] hover:bg-rose-950/80 text-slate-300 hover:text-rose-300 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer border border-cyan-500/30"
              title="Desafixar meu nome"
            >
              ✕ Desafixar
            </button>
          </div>
        </div>
      )}

      {/* CARDS VISUAIS DE DESTAQUE DO RANKING (KPIS DE PONTOS CORRIDOS) */}
      {!loading && totalParticipantes > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* CARD 1: LÍDER GERAL */}
          <div 
            onClick={() => lider && setSelectedProfileParticipant(lider.nome)}
            className="bg-gradient-to-b from-[#13225c] to-[#071033] border border-amber-400/50 rounded-2xl p-3.5 shadow-lg cursor-pointer transition-all hover:-translate-y-0.5 group relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-black uppercase text-amber-300 tracking-wider flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                LÍDER DO CAMPEONATO
              </span>
              <span className="text-xs font-mono font-black text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/30">
                1º LUGAR
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-black text-white truncate group-hover:text-amber-300 transition-colors font-display">
              {lider?.nome || '—'}
            </h4>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-amber-300">
                {liderPontos}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400">PTS</span>
              {segundo && (
                <span className="text-[10px] font-mono text-amber-200/80 ml-auto bg-amber-950/50 px-1.5 py-0.5 rounded">
                  +{liderPontos - segundo.pontos} pts à frente
                </span>
              )}
            </div>
          </div>

          {/* CARD 2: MESTRE DOS PLACARES */}
          <div 
            onClick={() => topPlacaresParticipant && setSelectedProfileParticipant(topPlacaresParticipant.name)}
            className="bg-[#050b28] border border-cyan-500/40 rounded-2xl p-3.5 shadow-lg cursor-pointer transition-all hover:-translate-y-0.5 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-black uppercase text-cyan-300 tracking-wider flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                MESTRE DOS PLACARES
              </span>
              <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/30">
                🎯 CRAVADA
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-black text-white truncate group-hover:text-cyan-300 transition-colors font-display">
              {topPlacaresParticipant?.name || 'Aguardando'}
            </h4>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-cyan-300">
                {topPlacaresParticipant?.count || 0}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400">PLACAR(ES) EXATOS</span>
            </div>
          </div>

          {/* CARD 3: DESTAQUE DA RODADA (ON FIRE) */}
          <div 
            onClick={() => onFireParticipant && setSelectedProfileParticipant(onFireParticipant.name)}
            className="bg-[#050b28] border border-orange-500/40 rounded-2xl p-3.5 shadow-lg cursor-pointer transition-all hover:-translate-y-0.5 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-black uppercase text-orange-400 tracking-wider flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                ON FIRE (RODADA)
              </span>
              <span className="text-xs font-mono font-bold text-orange-300 bg-orange-950/80 px-2 py-0.5 rounded-full border border-orange-500/30">
                🔥 DESTAQUE
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-black text-white truncate group-hover:text-orange-300 transition-colors font-display">
              {onFireParticipant?.name || 'Sem rodada apurada'}
            </h4>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-orange-400">
                +{onFireParticipant?.points || 0}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400">PTS NA ÚLTIMA</span>
            </div>
          </div>

          {/* CARD 4: NAIFO DA RODADA */}
          <div 
            onClick={() => naifoDaRodada && setSelectedProfileParticipant(naifoDaRodada.name)}
            className="bg-gradient-to-b from-[#310c22] to-[#140613] border border-rose-500/50 rounded-2xl p-3.5 shadow-lg cursor-pointer transition-all hover:-translate-y-0.5 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-black uppercase text-rose-300 tracking-wider flex items-center gap-1">
                😂🏳️‍🌈 NAIFO DA RODADA
              </span>
              <span className="text-xs font-mono font-bold text-rose-300 bg-rose-950/90 px-2 py-0.5 rounded-full border border-rose-500/40">
                MENOR PONTUAÇÃO
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-black text-white truncate group-hover:text-rose-300 transition-colors font-display">
              {naifoDaRodada?.name || 'Nenhuma rodada'}
            </h4>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-rose-400">
                {naifoDaRodada ? `${naifoDaRodada.points} PTS` : '—'}
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-400">PIOR DA RODADA</span>
            </div>
          </div>
        </div>
      )}

      {/* PÓDIO VISUAL UEFA CHAMPIONS LEAGUE (TOP 3 - SEM EFEITO DE PULSO AO VIVO) */}
      {!loading && totalParticipantes >= 3 && (
        <div className="bg-gradient-to-b from-[#091442] via-[#060c2b] to-[#04081c] border border-cyan-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-cyan-500/15">
            <div className="flex items-center gap-2">
              <UclTrophy className="w-5 h-5 text-amber-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-cyan-300 font-display">
                Pódio de Honra dos Líderes • Top 3
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
              ZONA DE OURO
            </span>
          </div>

          {/* Grid do Pódio com 2º Lugar na esquerda, 1º no centro (elevado) e 3º na direita */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end max-w-2xl mx-auto pt-2 pb-2">
            
            {/* 2º LUGAR (PRATA) */}
            {segundo && (
              <div 
                onClick={() => setSelectedProfileParticipant(segundo.nome)}
                className="bg-[#050b28]/90 border border-slate-400/40 hover:border-slate-300 rounded-2xl p-3 sm:p-4 text-center cursor-pointer transition-all hover:-translate-y-1 shadow-lg group flex flex-col items-center justify-between h-[180px] sm:h-[200px]"
              >
                <div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-slate-200 to-slate-400 text-slate-950 flex items-center justify-center font-black text-sm sm:text-base mx-auto shadow-md border-2 border-slate-300">
                    2
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-300 block mt-1 uppercase">
                    🥈 2º Lugar
                  </span>
                  <h4 className="font-bold text-white text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[130px] mx-auto mt-0.5 group-hover:text-cyan-300 transition-colors">
                    {segundo.nome}
                  </h4>
                </div>

                <div className="w-full">
                  <div className="font-mono font-black text-sm sm:text-lg text-slate-200">
                    {segundo.pontos} <span className="text-[10px]">PTS</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-rose-300/80 bg-rose-950/50 px-1.5 py-0.5 rounded block mt-0.5">
                    -{liderPontos - segundo.pontos} pts do 1º
                  </span>
                </div>
              </div>
            )}

            {/* 1º LUGAR (OURO - ELEVADO) */}
            {lider && (
              <div 
                onClick={() => setSelectedProfileParticipant(lider.nome)}
                className="bg-gradient-to-b from-[#13225c] to-[#071033] border-2 border-amber-400/70 hover:border-amber-300 rounded-2xl p-4 sm:p-5 text-center cursor-pointer transition-all hover:-translate-y-1.5 shadow-2xl shadow-amber-950/50 group flex flex-col items-center justify-between h-[210px] sm:h-[235px] relative"
              >
                <div className="absolute -top-3.5 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-[10px] font-black uppercase font-mono px-3 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-amber-300">
                  <Crown className="w-3 h-3 text-slate-950 fill-slate-950" />
                  <span>LÍDER ISOLADO</span>
                </div>

                <div className="pt-2">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-black text-lg sm:text-xl mx-auto shadow-lg shadow-amber-900/60 border-2 border-amber-200">
                    👑
                  </div>
                  <span className="text-[10px] font-mono font-black text-amber-300 block mt-1 uppercase tracking-wider">
                    🥇 1º Lugar
                  </span>
                  <h4 className="font-black text-white text-sm sm:text-base truncate max-w-[120px] sm:max-w-[150px] mx-auto mt-0.5 group-hover:text-amber-300 transition-colors font-display">
                    {lider.nome}
                  </h4>
                </div>

                <div className="w-full">
                  <div className="font-mono font-black text-lg sm:text-2xl text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.4)]">
                    {lider.pontos} <span className="text-xs">PTS</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-amber-200/90 bg-amber-950/80 px-2 py-0.5 rounded-full inline-block mt-0.5 border border-amber-500/30">
                    🎯 {placaresExatosMap[lider.nome] || lider.acertos_placar || 0} Placares Exatos
                  </span>
                </div>
              </div>
            )}

            {/* 3º LUGAR (BRONZE) */}
            {terceiro && (
              <div 
                onClick={() => setSelectedProfileParticipant(terceiro.nome)}
                className="bg-[#050b28]/90 border border-amber-700/50 hover:border-amber-600 rounded-2xl p-3 sm:p-4 text-center cursor-pointer transition-all hover:-translate-y-1 shadow-lg group flex flex-col items-center justify-between h-[170px] sm:h-[190px]"
              >
                <div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-b from-amber-700 to-amber-900 text-amber-100 flex items-center justify-center font-black text-sm sm:text-base mx-auto shadow-md border-2 border-amber-600">
                    3
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-400 block mt-1 uppercase">
                    🥉 3º Lugar
                  </span>
                  <h4 className="font-bold text-white text-xs sm:text-sm truncate max-w-[100px] sm:max-w-[130px] mx-auto mt-0.5 group-hover:text-cyan-300 transition-colors">
                    {terceiro.nome}
                  </h4>
                </div>

                <div className="w-full">
                  <div className="font-mono font-black text-sm sm:text-lg text-amber-200">
                    {terceiro.pontos} <span className="text-[10px]">PTS</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold text-rose-300/80 bg-rose-950/50 px-1.5 py-0.5 rounded block mt-0.5">
                    -{liderPontos - terceiro.pontos} pts do 1º
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BARRA DE FILTROS E PESQUISA INTERATIVA */}
      <div className="bg-[#080f33] border border-cyan-500/25 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Campo de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar participante no ranking..."
            className="w-full pl-9 pr-8 py-2 bg-[#050b28] border border-cyan-500/30 rounded-xl text-xs text-white placeholder-slate-400 font-mono focus:outline-hidden focus:border-cyan-400 transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Abas de Filtro Rápidas (Pontos Corridos) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <button
            type="button"
            onClick={() => setSelectedFilter('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedFilter === 'todos'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'bg-[#050b28] text-slate-300 hover:text-white border border-cyan-500/20'
            }`}
          >
            Todos ({totalParticipantes})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('podio')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              selectedFilter === 'podio'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'bg-[#050b28] text-amber-300 hover:text-amber-200 border border-amber-500/30'
            }`}
          >
            <span>🏆 Top 3 (Pódio)</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('naifo')}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              selectedFilter === 'naifo'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-[#050b28] text-rose-300 hover:text-rose-200 border border-rose-500/30'
            }`}
          >
            <span>o naifo do campeonato 🏳️‍🌈</span>
          </button>
        </div>

        {/* Ordenador */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-slate-400 font-bold hidden sm:inline">Ordenar:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-[#050b28] border border-cyan-500/30 text-slate-200 text-xs font-mono font-bold py-1.5 px-2.5 rounded-xl focus:outline-hidden cursor-pointer"
          >
            <option value="pontos">Pontos (Oficial)</option>
            <option value="placares">🎯 Placares Exatos</option>
            <option value="subida">🚀 Maior Subida</option>
            <option value="nome">Ordem Alfabética</option>
          </select>
        </div>
      </div>

      {/* TABELA PRINCIPAL DE PONTOS CORRIDOS */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="px-5 py-3.5 border-b border-cyan-500/20 bg-[#050b28]/90 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UclStarball className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-xs uppercase tracking-wider font-display">
              Classificação Geral • Pontos Corridos
            </h3>
          </div>
          <span className="text-[10px] font-mono text-cyan-300 font-bold bg-cyan-950/80 px-2.5 py-0.5 rounded border border-cyan-500/30">
            Exibindo {filteredAndSortedParticipants.length} de {totalParticipantes}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-cyan-300 font-mono font-bold flex flex-col items-center gap-2">
            <UclStarball className="w-6 h-6 animate-spin text-cyan-400" />
            Carregando tabela oficial do Bolão...
          </div>
        ) : filteredAndSortedParticipants.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-bold uppercase font-mono">
            Nenhum participante encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans border-collapse">
              <thead>
                <tr className="border-b border-cyan-950 text-[10px] font-bold uppercase text-slate-400 bg-[#040822]/90 font-mono">
                  <th className="px-4 py-3 text-center w-16">Pos</th>
                  <th className="px-3 py-3 text-center w-16">Var</th>
                  <th className="px-4 py-3">Participante & Aproveitamento</th>
                  <th className="px-4 py-3 text-center w-36">
                    <span className="inline-flex items-center gap-1.5 text-cyan-300 font-black">
                      <Award className="w-3.5 h-3.5 text-cyan-400" />
                      Pontuação
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center w-28 text-slate-300">
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Target className="w-3 h-3 text-cyan-400" />
                      Placares
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-950/70 text-xs">
                {filteredAndSortedParticipants.map((p, index) => {
                  // Calcular posição oficial real baseada no ranking original
                  const originalIndex = participantes.findIndex(orig => orig.id === p.id);
                  const position = originalIndex !== -1 ? originalIndex + 1 : index + 1;
                  const isTopOne = position === 1;
                  const isLast = position === participantes.length && participantes.length > 1;
                  const movement = rankMovements[p.nome] || 0;
                  const gapToLeader = liderPontos - p.pontos;
                  const placares = placaresExatosMap[p.nome] ?? p.acertos_placar ?? 0;
                  const recentGain = latestRoundScores[p.nome] ?? 0;
                  const isOnFire = onFireParticipant?.name === p.nome;
                  const isNaifoDaRodada = naifoDaRodada?.name === p.nome && (latestRoundScores[p.nome] !== undefined);
                  const isTopClimber = topClimber?.name === p.nome;
                  const isTopPlacares = topPlacaresParticipant?.name === p.nome && (topPlacaresParticipant?.count || 0) > 0;
                  const isPinned = pinnedParticipant.toLowerCase() === p.nome.toLowerCase();

                  // Percentual para a micro-barra de progresso
                  const progressPct = liderPontos > 0 ? Math.min(100, Math.round((p.pontos / liderPontos) * 100)) : 100;

                  // Renderizar divisor antes do último colocado ("o naifo do campeonato 🏳️‍🌈") quando em modo 'todos'
                  const showNaifoDivider = selectedFilter === 'todos' && !searchTerm && position === participantes.length - 1 && participantes.length > 4;

                  return (
                    <React.Fragment key={p.id}>
                      <tr 
                        onClick={() => setSelectedProfileParticipant(p.nome)}
                        className={`hover:bg-cyan-950/40 transition-colors cursor-pointer group border-l-4 ${
                          isPinned
                            ? 'border-l-amber-400 bg-amber-950/20 ring-1 ring-amber-400/30'
                            : isLast
                            ? 'border-l-rose-500 bg-gradient-to-r from-rose-950/25 to-transparent'
                            : isTopOne
                            ? 'border-l-amber-400 bg-gradient-to-r from-amber-950/15 to-transparent'
                            : position === 2
                            ? 'border-l-slate-300 bg-gradient-to-r from-slate-900/40 to-transparent'
                            : position === 3
                            ? 'border-l-amber-600 bg-gradient-to-r from-amber-950/10 to-transparent'
                            : 'border-l-cyan-600/40'
                        }`}
                        title={`Clique para ver estatísticas completas de ${p.nome}`}
                      >
                        {/* Posição com Medalha ou Número */}
                        <td className="px-4 py-3 text-center">
                          {isTopOne ? (
                            <div className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-950/50">
                              1
                            </div>
                          ) : position === 2 ? (
                            <div className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-200 text-slate-900 font-bold text-xs shadow-xs">
                              2
                            </div>
                          ) : position === 3 ? (
                            <div className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-amber-700 text-amber-100 font-bold text-xs">
                              3
                            </div>
                          ) : (
                            <span className="font-mono text-xs font-bold text-slate-400">
                              {position}º
                            </span>
                          )}
                        </td>

                        {/* Variação de Posição com Seta e Número */}
                        <td className="px-3 py-3 text-center font-mono">
                          {movement > 0 ? (
                            <span 
                              className="inline-flex items-center gap-0.5 text-emerald-400 font-black text-[11px] bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30" 
                              title={`Subiu ${movement} posição(ões) nesta rodada`}
                            >
                              <ArrowUp className="w-3 h-3 text-emerald-400" />
                              +{movement}
                            </span>
                          ) : movement < 0 ? (
                            <span 
                              className="inline-flex items-center gap-0.5 text-rose-400 font-black text-[11px] bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-500/30" 
                              title={`Caiu ${Math.abs(movement)} posição(ões) nesta rodada`}
                            >
                              <ArrowDown className="w-3 h-3 text-rose-400" />
                              {movement}
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-slate-500 font-bold text-[11px]" title="Manteve a posição">
                              <Minus className="w-3 h-3 text-slate-600" />
                            </span>
                          )}
                        </td>

                        {/* Nome do Participante, Badges e Micro-Barra de Distância */}
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold text-sm group-hover:text-cyan-300 transition-colors font-display ${
                                isPinned ? 'text-amber-300 font-black' : 'text-white'
                              }`}>
                                {p.nome}
                              </span>

                              {isPinned && (
                                <span className="text-[9px] font-mono font-black uppercase text-amber-300 bg-amber-950/90 border border-amber-400/60 px-1.5 py-0.2 rounded flex items-center gap-1">
                                  ⭐️ VOCÊ
                                </span>
                              )}

                              {isTopOne && (
                                <span className="text-[9px] font-mono font-black uppercase text-amber-300 bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.2 rounded">
                                  Líder Geral
                                </span>
                              )}

                              {isOnFire && (
                                <span className="text-[9px] font-mono font-black uppercase text-orange-400 bg-orange-950/90 border border-orange-400/50 px-1.5 py-0.2 rounded flex items-center gap-1 shadow-xs">
                                  <Flame className="w-2.5 h-2.5 text-orange-400 fill-orange-400" />
                                  On Fire (+{recentGain} pts)
                                </span>
                              )}

                              {isNaifoDaRodada && (
                                <span className="text-[9px] font-mono font-black uppercase text-rose-300 bg-rose-950/90 border border-rose-500/50 px-1.5 py-0.2 rounded flex items-center gap-1 shadow-xs" title={`Pior pontuador da última rodada apurada (${recentGain} pts)`}>
                                  naifo da rodada 😂🏳️‍🌈
                                </span>
                              )}

                              {isTopClimber && (
                                <span className="text-[9px] font-mono font-black uppercase text-emerald-300 bg-emerald-950/90 border border-emerald-400/50 px-1.5 py-0.2 rounded flex items-center gap-1 shadow-xs">
                                  <Rocket className="w-2.5 h-2.5 text-emerald-400" />
                                  Subiu Mais
                                </span>
                              )}

                              {isTopPlacares && (
                                <span className="text-[9px] font-mono font-black uppercase text-cyan-300 bg-cyan-950/90 border border-cyan-400/50 px-1.5 py-0.2 rounded flex items-center gap-1 shadow-xs">
                                  <Target className="w-2.5 h-2.5 text-cyan-400" />
                                  Mestre
                                </span>
                              )}

                              {isLast && (
                                <span className="text-rose-300 font-bold text-[10px] whitespace-nowrap bg-rose-950/90 px-2 py-0.5 rounded border border-rose-500/40 font-mono shadow-xs">
                                  o naifo do campeonato 🏳️‍🌈
                                </span>
                              )}
                            </div>

                            {/* Distância para o líder & micro barra de progresso visual */}
                            <div className="flex items-center gap-2 max-w-xs">
                              <div className="flex-1 h-1.5 bg-[#050b28] rounded-full overflow-hidden border border-cyan-950">
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    isTopOne 
                                      ? 'bg-gradient-to-r from-amber-400 to-amber-500' 
                                      : isLast
                                      ? 'bg-gradient-to-r from-rose-600 to-rose-400'
                                      : 'bg-gradient-to-r from-cyan-500 to-blue-600'
                                  }`}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                                {isTopOne ? (
                                  <span className="text-amber-300 font-bold">100% (Topo)</span>
                                ) : (
                                  <span>-{gapToLeader} pts do 1º</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Pontuação */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 font-mono font-black text-sm text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-3 py-0.5 rounded-full shadow-xs">
                              {p.pontos} PTS
                            </span>
                            {recentGain > 0 ? (
                              <span className="text-[9px] font-mono text-emerald-400 font-bold mt-0.5">
                                (+{recentGain} na última)
                              </span>
                            ) : recentGain === 0 && latestRoundScores[p.nome] !== undefined ? (
                              <span className="text-[9px] font-mono text-rose-400 font-bold mt-0.5">
                                (0 pts na última)
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Placares Exatos */}
                        <td className="px-4 py-3 text-center font-mono">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-slate-300 bg-[#050b28] border border-cyan-900/50 font-bold text-xs">
                            <Target className="w-3 h-3 text-cyan-400" />
                            {placares}
                          </span>
                        </td>

                        {/* Ações: Fixar e Ver Perfil */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => handleTogglePin(p.nome, e)}
                              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                                isPinned 
                                  ? 'bg-amber-400 text-slate-950 border-amber-300' 
                                  : 'bg-[#050b28] text-slate-400 hover:text-amber-300 border-cyan-900/60'
                              }`}
                              title={isPinned ? 'Desmarcar participante' : 'Fixar como meu participante'}
                            >
                              <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-slate-950' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProfileParticipant(p.nome);
                              }}
                              className="px-2 py-1 rounded-lg bg-[#050b28] hover:bg-cyan-950 text-cyan-400 hover:text-white border border-cyan-500/30 text-[11px] font-mono font-bold transition-all flex items-center gap-1"
                              title="Ver perfil completo e histórico de palpites"
                            >
                              <span>Ver</span>
                              <TrendingUp className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* DIVISOR DESTAQUE ANTES DO NAIFO DO CAMPEONATO */}
                      {showNaifoDivider && (
                        <tr>
                          <td colSpan={6} className="px-4 py-2 bg-gradient-to-r from-rose-950/50 via-rose-900/20 to-transparent border-y border-rose-500/40">
                            <div className="flex items-center gap-2 text-[10px] font-mono font-black text-rose-400 uppercase tracking-widest">
                              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                              <span>🏳️‍🌈 O NAIFO DO CAMPEONATO 🏳️‍🌈</span>
                              <div className="flex-1 h-px bg-rose-500/30 ml-2"></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* LEGENDA DE PONTOS CORRIDOS E CRITÉRIOS DE DESEMPATE */}
        <div className="px-5 py-3.5 border-t border-cyan-500/20 bg-[#040822] flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-400"></span>
              <span className="text-slate-300 font-bold">Top 3 (Pódio de Honra)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-500"></span>
              <span className="text-rose-300 font-bold">o naifo do campeonato 🏳️‍🌈</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-bold">▲ Subiu</span>
            <span className="text-rose-400 font-bold">▼ Caiu</span>
            <span className="text-slate-400">▬ Manteve</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300 font-bold">🎯 Desempate Oficial por Placares Exatos</span>
          </div>
        </div>
      </div>

      {/* MODAL DE ESTATÍSTICAS INDIVIDUAIS DO PARTICIPANTE */}
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
