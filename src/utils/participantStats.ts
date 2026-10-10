import { Participante, Rodada, Palpite, JogoResultadoOficial, PontuacaoLog } from '../types';
import { getRoundNumber } from './dateUtils';
import { evaluateGuessAgainstResult } from './scoreCalculator';

export interface RoundPositionRecord {
  rodadaId: string;
  rodadaNome: string;
  numeroRodada: number;
  pontosRodada: number;
  pontosAcumulados: number;
  posicao: number;
  variacao: number; // positive = subiu posições (ex: +2 quer dizer foi do 5º para o 3º lugar), negative = caiu
  acertosPlacarRodada: number;
  acertosResultadoRodada: number;
  capitaoGolsRodada: number;
}

export interface ParticipantStats {
  participanteNome: string;
  pontosTotais: number;
  posicaoAtual: number;
  totalParticipantes: number;
  
  // As 3 principais métricas requeridas:
  acertosPlacar: number;
  acertosResultado: number;
  capitaoGolsVezes: number; // quantas vezes um capitão dele fez gol
  capitaoGolsTotal: number; // soma de gols feitos pelos capitães
  
  // Informações complementares de perfil:
  totalPalpitesAvaliados: number;
  melhorPosicao: number | null;
  piorPosicao: number | null;
  historicoPosicoes: RoundPositionRecord[];
  
  // Palpites detalhados do participante
  palpitesDetalhados: {
    id: string;
    rodadaNome: string;
    rodadaId: string;
    palpiteTexto: string;
    capitao: string;
    acertouPlacar: boolean;
    acertouResultado: boolean;
    golsCapitao: number;
    pontosConcedidos: number;
    motivo: string;
    resultadoOficial?: string;
    jogoOficial?: string;
  }[];
}

/**
 * Normaliza nomes de participantes para comparação consistente
 */
export function normalizeName(name: string): string {
  return (name || '').trim().toLowerCase();
}

/**
 * Calcula todas as estatísticas e evolução de posições de um participante específico
 */
export function calculateParticipantStats(
  targetParticipantName: string,
  participants: Participante[],
  rounds: Rodada[],
  guesses: Palpite[],
  officialResults: { [roundId: string]: JogoResultadoOficial[] } = {},
  scoreLogs: PontuacaoLog[] = []
): ParticipantStats {
  const normTarget = normalizeName(targetParticipantName);
  const targetP = participants.find(p => normalizeName(p.nome) === normTarget);
  const pontosTotais = targetP ? targetP.pontos : 0;

  // 1. Filtrar palpites válidos (último envio por rodada por participante)
  // Agrupar palpites por participante e por rodada
  const validGuessesByRoundByPart: Record<string, Record<string, Palpite[]>> = {};

  guesses.forEach(g => {
    const pNameNorm = normalizeName(g.participante);
    const rId = g.rodada;
    if (!validGuessesByRoundByPart[pNameNorm]) {
      validGuessesByRoundByPart[pNameNorm] = {};
    }
    if (!validGuessesByRoundByPart[pNameNorm][rId]) {
      validGuessesByRoundByPart[pNameNorm][rId] = [];
    }
    validGuessesByRoundByPart[pNameNorm][rId].push(g);
  });

  // Para cada participante e rodada, manter apenas palpites do timestamp mais recente (envio válido)
  const effectiveGuessesByPartAndRound: Record<string, Record<string, Palpite[]>> = {};

  Object.entries(validGuessesByRoundByPart).forEach(([pNorm, rMap]) => {
    effectiveGuessesByPartAndRound[pNorm] = {};
    Object.entries(rMap).forEach(([rId, pGuesses]) => {
      // Ordenar por data_hora_envio
      const sorted = [...pGuesses].sort(
        (a, b) => new Date(a.data_hora_envio).getTime() - new Date(b.data_hora_envio).getTime()
      );
      const timestamps = Array.from(new Set(sorted.map(g => g.data_hora_envio)));
      const latestTs = timestamps[timestamps.length - 1];
      effectiveGuessesByPartAndRound[pNorm][rId] = sorted.filter(g => g.data_hora_envio === latestTs);
    });
  });

  // 2. Identificar rodadas avaliadas ou com jogos oficiais
  const evaluatedRounds = rounds
    .filter(r => {
      const hasOfficialGames = (r.jogos_oficiais && r.jogos_oficiais.length > 0) || 
                              (officialResults[r.id] && officialResults[r.id].length > 0);
      const isApurada = r.apurada === true;
      const hasEvaluatedGuesses = guesses.some(g => g.rodada === r.id && (g.avaliado || g.pontos_concedidos !== undefined));
      return hasOfficialGames || isApurada || hasEvaluatedGuesses;
    })
    .sort((a, b) => {
      const numA = getRoundNumber(a.nome || a.id);
      const numB = getRoundNumber(b.nome || b.id);
      if (numA !== numB) return numA - numB;
      return (a.abertura || '').localeCompare(b.abertura || '');
    });

  // 3. Calcular pontos de cada participante rodada a rodada
  // pointsPerPartPerRound[roundId][pNorm] = pontos na rodada
  const pointsPerPartPerRound: Record<string, Record<string, number>> = {};
  // detailsPerRound para o target:
  const targetDetailsPerRound: Record<string, { placar: number; resultado: number; capitaoGols: number; points: number }> = {};

  evaluatedRounds.forEach(r => {
    pointsPerPartPerRound[r.id] = {};
    const roundOfficials = officialResults[r.id] || r.jogos_oficiais || [];

    participants.forEach(p => {
      const pNorm = normalizeName(p.nome);
      let pRoundPoints = 0;
      let pPlacarCount = 0;
      let pResultadoCount = 0;
      let pCapitaoGolsCount = 0;

      const pGuesses = effectiveGuessesByPartAndRound[pNorm]?.[r.id] || [];

      // Avaliar palpites com resultados oficiais ou usar dados gravados
      if (roundOfficials.length > 0 && pGuesses.length > 0) {
        pGuesses.forEach(g => {
          let matched = false;
          // Tentar avaliar contra os resultados oficiais
          for (const og of roundOfficials) {
            const ev = evaluateGuessAgainstResult(g, og);
            if (ev.matchFound) {
              matched = true;
              pRoundPoints += ev.pontos;
              if (ev.acertouPlacar) pPlacarCount++;
              if (ev.acertouResultado) pResultadoCount++;
              if (ev.golsCapitao > 0) pCapitaoGolsCount += ev.golsCapitao;
              break;
            }
          }

          // Se não bateu diretamente com jogo oficial, verificar se o palpite já tem pontos_concedidos gravados
          if (!matched && g.avaliado) {
            pRoundPoints += g.pontos_concedidos || 0;
            if (g.acertou_placar) pPlacarCount++;
            if (g.acertou_resultado) pResultadoCount++;
            if (g.gols_capitao && g.gols_capitao > 0) pCapitaoGolsCount += g.gols_capitao;
          }
        });
      } else {
        // Sem jogos oficiais salvos diretamente, usar palpites gravados ou logs
        pGuesses.forEach(g => {
          if (g.avaliado) {
            pRoundPoints += g.pontos_concedidos || 0;
            if (g.acertou_placar) pPlacarCount++;
            if (g.acertou_resultado) pResultadoCount++;
            if (g.gols_capitao && g.gols_capitao > 0) pCapitaoGolsCount += g.gols_capitao;
          }
        });
      }

      // Se pontos da rodada continuarem 0, checar se há log específico em pontuacoes
      if (pRoundPoints === 0 && scoreLogs.length > 0) {
        const roundNum = getRoundNumber(r.nome || r.id);
        const rLog = scoreLogs.find(
          l => normalizeName(l.participante) === pNorm &&
               (l.motivo.includes(r.nome) || l.motivo.includes(`Rodada ${roundNum}`))
        );
        if (rLog) {
          pRoundPoints = rLog.pontos;
        }
      }

      pointsPerPartPerRound[r.id][pNorm] = pRoundPoints;

      if (pNorm === normTarget) {
        targetDetailsPerRound[r.id] = {
          placar: pPlacarCount,
          resultado: pResultadoCount,
          capitaoGols: pCapitaoGolsCount,
          points: pRoundPoints
        };
      }
    });
  });

  // 4. Calcular evolução acumulada e posições em cada rodada
  const historicoPosicoes: RoundPositionRecord[] = [];
  const cumulativePointsByPart: Record<string, number> = {};

  // Inicializar pontos acumulados
  participants.forEach(p => {
    cumulativePointsByPart[normalizeName(p.nome)] = 0;
  });

  let previousPosition: number | null = null;

  evaluatedRounds.forEach(r => {
    // Adicionar pontos da rodada
    participants.forEach(p => {
      const pNorm = normalizeName(p.nome);
      const rPts = pointsPerPartPerRound[r.id]?.[pNorm] || 0;
      cumulativePointsByPart[pNorm] = (cumulativePointsByPart[pNorm] || 0) + rPts;
    });

    // Ordenar participantes pelos pontos acumulados até esta rodada
    const standingsAtThisRound = [...participants].sort((a, b) => {
      const ptsA = cumulativePointsByPart[normalizeName(a.nome)] || 0;
      const ptsB = cumulativePointsByPart[normalizeName(b.nome)] || 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      return a.nome.localeCompare(b.nome);
    });

    // Posição do target nesta rodada
    const posIndex = standingsAtThisRound.findIndex(p => normalizeName(p.nome) === normTarget);
    const posThisRound = posIndex !== -1 ? posIndex + 1 : participants.length;

    // Variação em relação à rodada anterior (ex: se era 5º e foi para 3º, variacao = +2, subiu)
    let variacao = 0;
    if (previousPosition !== null) {
      variacao = previousPosition - posThisRound;
    }
    previousPosition = posThisRound;

    const tDetails = targetDetailsPerRound[r.id] || { placar: 0, resultado: 0, capitaoGols: 0, points: 0 };

    historicoPosicoes.push({
      rodadaId: r.id,
      rodadaNome: r.nome,
      numeroRodada: getRoundNumber(r.nome || r.id),
      pontosRodada: tDetails.points,
      pontosAcumulados: cumulativePointsByPart[normTarget] || 0,
      posicao: posThisRound,
      variacao,
      acertosPlacarRodada: tDetails.placar,
      acertosResultadoRodada: tDetails.resultado,
      capitaoGolsRodada: tDetails.capitaoGols
    });
  });

  // 5. Totalizar métricas principais do participante em todos os palpites
  let totalAcertosPlacar = targetP?.acertos_placar || 0;
  let totalAcertosResultado = 0;
  let totalCapitaoFezGolVezes = 0; // Quantas vezes um capitão dele marcou gol
  let totalCapitaoGolsSoma = 0;
  let totalPalpitesAvaliados = 0;

  const palpitesDetalhados: ParticipantStats['palpitesDetalhados'] = [];

  const targetGuessesByRound = effectiveGuessesByPartAndRound[normTarget] || {};

  Object.entries(targetGuessesByRound).forEach(([rId, pGuesses]) => {
    const roundObj = rounds.find(r => r.id === rId);
    const roundName = roundObj ? roundObj.nome : `Rodada ${rId}`;
    const roundOfficials = officialResults[rId] || roundObj?.jogos_oficiais || [];

    pGuesses.forEach(g => {
      let acertouPlacar = false;
      let acertouResultado = false;
      let golsCapitao = 0;
      let pontos = g.pontos_concedidos || 0;
      let motivo = g.motivo_detalhado || '';
      let resultadoOficial = g.resultado_oficial || '';
      let jogoOficial = g.jogo_oficial || '';

      // Se temos resultados oficiais, conferir avaliação detalhada
      if (roundOfficials.length > 0) {
        for (const og of roundOfficials) {
          const ev = evaluateGuessAgainstResult(g, og);
          if (ev.matchFound) {
            acertouPlacar = ev.acertouPlacar;
            acertouResultado = ev.acertouResultado;
            golsCapitao = ev.golsCapitao;
            pontos = ev.pontos;
            motivo = ev.motivo;
            resultadoOficial = `${og.time_mandante} ${og.gols_mandante} x ${og.gols_visitante} ${og.time_visitante}`;
            jogoOficial = `${og.time_mandante} x ${og.time_visitante}`;
            break;
          }
        }
      } else {
        // Fallback aos campos salvos no próprio palpite
        acertouPlacar = Boolean(g.acertou_placar);
        acertouResultado = Boolean(g.acertou_resultado);
        golsCapitao = g.gols_capitao || 0;
      }

      if (g.avaliado || roundOfficials.length > 0 || pontos > 0) {
        totalPalpitesAvaliados++;
        if (acertouPlacar) totalAcertosPlacar++;
        if (acertouResultado) totalAcertosResultado++;
        if (golsCapitao > 0) {
          totalCapitaoFezGolVezes++;
          totalCapitaoGolsSoma += golsCapitao;
        }

        palpitesDetalhados.push({
          id: g.id,
          rodadaNome: roundName,
          rodadaId: rId,
          palpiteTexto: g.palpite,
          capitao: g.capitao || '',
          acertouPlacar,
          acertouResultado,
          golsCapitao,
          pontosConcedidos: pontos,
          motivo,
          resultadoOficial,
          jogoOficial
        });
      }
    });
  });

  // 6. Calcular posição atual geral na tabela
  const sortedParticipantsAll = [...participants].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    return a.nome.localeCompare(b.nome);
  });
  const currentPosIdx = sortedParticipantsAll.findIndex(p => normalizeName(p.nome) === normTarget);
  const posicaoAtual = currentPosIdx !== -1 ? currentPosIdx + 1 : participants.length;

  // 7. Calcular melhor e pior posição ao longo do histórico
  let melhorPosicao: number | null = null;
  let piorPosicao: number | null = null;

  if (historicoPosicoes.length > 0) {
    melhorPosicao = Math.min(...historicoPosicoes.map(h => h.posicao));
    piorPosicao = Math.max(...historicoPosicoes.map(h => h.posicao));
  } else {
    melhorPosicao = posicaoAtual;
    piorPosicao = posicaoAtual;
  }

  return {
    participanteNome: targetParticipantName,
    pontosTotais,
    posicaoAtual,
    totalParticipantes: participants.length,
    acertosPlacar: totalAcertosPlacar,
    acertosResultado: totalAcertosResultado,
    capitaoGolsVezes: totalCapitaoFezGolVezes,
    capitaoGolsTotal: totalCapitaoGolsSoma,
    totalPalpitesAvaliados,
    melhorPosicao,
    piorPosicao,
    historicoPosicoes,
    palpitesDetalhados
  };
}
