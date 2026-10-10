import { Palpite, JogoResultadoOficial } from '../types';

export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\bfc\b/g, '')
    .replace(/\bas\b/g, '')
    .replace(/\bssc\b/g, '')
    .replace(/\bvfb\b/g, '')
    .replace(/\bfk\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function areTeamsMatching(teamA: string, teamB: string): boolean {
  const normA = normalizeTeamName(teamA);
  const normB = normalizeTeamName(teamB);
  if (!normA || !normB) return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

export interface ParsedGuess {
  timeMandante: string;
  golsMandante: number;
  timeVisitante: string;
  golsVisitante: number;
  capitao: string;
}

export function parseGuess(p: Palpite): ParsedGuess | null {
  // If structured fields already exist
  if (
    p.time_mandante &&
    p.time_visitante &&
    p.gols_mandante !== undefined &&
    p.gols_visitante !== undefined
  ) {
    return {
      timeMandante: p.time_mandante,
      golsMandante: Number(p.gols_mandante),
      timeVisitante: p.time_visitante,
      golsVisitante: Number(p.gols_visitante),
      capitao: (p.capitao || '').trim()
    };
  }

  // Fallback: parse string format like "Arsenal FC 1 x 0 AS Roma" or "Arsenal 2x1 Roma"
  if (!p.palpite) return null;

  const match = p.palpite.match(/(.+?)\s+(\d+)\s*(?:x|X|a|-)\s*(\d+)\s+(.+)/);
  if (match) {
    return {
      timeMandante: match[1].trim(),
      golsMandante: parseInt(match[2], 10),
      golsVisitante: parseInt(match[3], 10),
      timeVisitante: match[4].trim(),
      capitao: (p.capitao || '').trim()
    };
  }

  return null;
}

export interface ScoreEvaluationResult {
  matchFound: boolean;
  pontos: number;
  acertouResultado: boolean;
  acertouPlacar: boolean;
  pontosResultado: number;
  pontosPlacar: number;
  golsCapitao: number;
  pontosCapitao: number;
  nomeCapitao: string;
  isSpecialZeroZero: boolean;
  motivo: string;
}

export function evaluateGuessAgainstResult(
  guess: Palpite,
  realGame: JogoResultadoOficial
): ScoreEvaluationResult {
  const parsed = parseGuess(guess);
  if (!parsed) {
    return {
      matchFound: false,
      pontos: 0,
      acertouResultado: false,
      acertouPlacar: false,
      pontosResultado: 0,
      pontosPlacar: 0,
      golsCapitao: 0,
      pontosCapitao: 0,
      nomeCapitao: '',
      isSpecialZeroZero: false,
      motivo: 'Formato do palpite não reconhecido'
    };
  }

  // Check if this guess corresponds to the match
  const matchesDirect = 
    areTeamsMatching(parsed.timeMandante, realGame.time_mandante) &&
    areTeamsMatching(parsed.timeVisitante, realGame.time_visitante);

  // Inverted order fallback (e.g. participant swapped home/away)
  const matchesInverted =
    areTeamsMatching(parsed.timeMandante, realGame.time_visitante) &&
    areTeamsMatching(parsed.timeVisitante, realGame.time_mandante);

  if (!matchesDirect && !matchesInverted) {
    return {
      matchFound: false,
      pontos: 0,
      acertouResultado: false,
      acertouPlacar: false,
      pontosResultado: 0,
      pontosPlacar: 0,
      golsCapitao: 0,
      pontosCapitao: 0,
      nomeCapitao: parsed.capitao || '',
      isSpecialZeroZero: false,
      motivo: 'Jogo não correspondente'
    };
  }

  const pHomeGoals = matchesDirect ? parsed.golsMandante : parsed.golsVisitante;
  const pAwayGoals = matchesDirect ? parsed.golsVisitante : parsed.golsMandante;
  const rHomeGoals = realGame.gols_mandante;
  const rAwayGoals = realGame.gols_visitante;

  const rOutcome = rHomeGoals > rAwayGoals ? 'home' : rHomeGoals < rAwayGoals ? 'away' : 'draw';
  const pOutcome = pHomeGoals > pAwayGoals ? 'home' : pHomeGoals < pAwayGoals ? 'away' : 'draw';

  const acertouResultado = rOutcome === pOutcome;
  const acertouPlacar = pHomeGoals === rHomeGoals && pAwayGoals === rAwayGoals;

  const hasCaptain = Boolean(
    parsed.capitao && 
    parsed.capitao.trim() !== '' && 
    parsed.capitao.toLowerCase() !== 'nenhum' &&
    parsed.capitao.toLowerCase() !== 'sem capitão'
  );

  let golsCapitao = 0;
  if (hasCaptain && realGame.gols_jogadores && realGame.gols_jogadores.length > 0) {
    const capNorm = normalizeTeamName(parsed.capitao);
    for (const gj of realGame.gols_jogadores) {
      if (normalizeTeamName(gj.jogador) === capNorm || gj.jogador.toLowerCase().includes(parsed.capitao.toLowerCase())) {
        golsCapitao += gj.gols;
      }
    }
  }

  // Score computation according to Copa rules:
  // Rule 4: Special 0x0
  if (rHomeGoals === 0 && rAwayGoals === 0) {
    if (acertouPlacar) {
      // If guess was 0x0:
      // Without captain = 6 pts
      // With captain = 5 pts
      const pontos = hasCaptain ? 5 : 6;
      const motivo = hasCaptain 
        ? `Placar 0x0 c/ Capitão (+5 pts)`
        : `Placar 0x0 SEM Capitão (+6 pts)`;
      return {
        matchFound: true,
        pontos,
        acertouResultado: true,
        acertouPlacar: true,
        pontosResultado: 3,
        pontosPlacar: hasCaptain ? 2 : 3,
        golsCapitao: 0,
        pontosCapitao: 0,
        nomeCapitao: parsed.capitao || '',
        isSpecialZeroZero: true,
        motivo
      };
    } else {
      // Real was 0x0, guess was not 0x0
      // If guess was another draw (e.g. 1x1), got the draw result (+3 pts)
      if (acertouResultado) {
        return {
          matchFound: true,
          pontos: 3,
          acertouResultado: true,
          acertouPlacar: false,
          pontosResultado: 3,
          pontosPlacar: 0,
          golsCapitao: 0,
          pontosCapitao: 0,
          nomeCapitao: parsed.capitao || '',
          isSpecialZeroZero: false,
          motivo: `Acertou Resultado (Empate) (+3 pts)`
        };
      }
      return {
        matchFound: true,
        pontos: 0,
        acertouResultado: false,
        acertouPlacar: false,
        pontosResultado: 0,
        pontosPlacar: 0,
        golsCapitao: 0,
        pontosCapitao: 0,
        nomeCapitao: parsed.capitao || '',
        isSpecialZeroZero: false,
        motivo: `Errou o resultado`
      };
    }
  }

  // Standard Rules:
  // Acertou resultado: +3
  // Acertou placar: +2 (total 5)
  // Capitão: +1 por gol
  let pontosResultado = 0;
  let pontosPlacar = 0;
  let pontosCapitao = 0;
  const reasons: string[] = [];

  if (acertouResultado) {
    pontosResultado = 3;
    reasons.push('Resultado (+3 pts)');
  }

  if (acertouPlacar) {
    pontosPlacar = 2;
    reasons.push('Placar Exato (+2 pts)');
  }

  if (golsCapitao > 0) {
    pontosCapitao = golsCapitao;
    reasons.push(`Capitão ${parsed.capitao} (${golsCapitao} gol${golsCapitao > 1 ? 's' : ''}: +${golsCapitao} pt${golsCapitao > 1 ? 's' : ''})`);
  }

  const totalPontos = pontosResultado + pontosPlacar + pontosCapitao;
  const motivo = reasons.length > 0 ? reasons.join(' • ') : 'Errou o resultado';

  return {
    matchFound: true,
    pontos: totalPontos,
    acertouResultado,
    acertouPlacar,
    pontosResultado,
    pontosPlacar,
    golsCapitao,
    pontosCapitao,
    nomeCapitao: parsed.capitao || '',
    isSpecialZeroZero: false,
    motivo
  };
}

export interface GuessDetailedEvaluation {
  guess: Palpite;
  realGame?: JogoResultadoOficial;
  matchFound: boolean;
  pontos: number;
  pontosResultado: number;
  pontosPlacar: number;
  pontosCapitao: number;
  golsCapitao: number;
  nomeCapitao: string;
  acertouResultado: boolean;
  acertouPlacar: boolean;
  isSpecialZeroZero: boolean;
  motivo: string;
  jogoFormatado: string;
  resultadoRealFormatado: string;
}

export interface ParticipantRoundBreakdown {
  participante: string;
  totalPontos: number;
  totalPontosResultado: number;
  totalPontosPlacar: number;
  totalPontosCapitao: number;
  totalAcertosResultado: number;
  totalAcertosPlacar: number;
  totalGolsCapitao: number;
  jogosAvaliados: GuessDetailedEvaluation[];
}

export function evaluateParticipantRound(
  userGuesses: Palpite[],
  officialGames: JogoResultadoOficial[]
): ParticipantRoundBreakdown {
  let totalPontos = 0;
  let totalPontosResultado = 0;
  let totalPontosPlacar = 0;
  let totalPontosCapitao = 0;
  let totalAcertosResultado = 0;
  let totalAcertosPlacar = 0;
  let totalGolsCapitao = 0;
  const jogosAvaliados: GuessDetailedEvaluation[] = [];

  for (const guess of userGuesses) {
    let matched = false;
    for (const realGame of officialGames) {
      const evalRes = evaluateGuessAgainstResult(guess, realGame);
      if (evalRes.matchFound) {
        matched = true;
        totalPontos += evalRes.pontos;
        totalPontosResultado += evalRes.pontosResultado;
        totalPontosPlacar += evalRes.pontosPlacar;
        totalPontosCapitao += evalRes.pontosCapitao;
        if (evalRes.acertouResultado) totalAcertosResultado++;
        if (evalRes.acertouPlacar) totalAcertosPlacar++;
        totalGolsCapitao += evalRes.golsCapitao;

        jogosAvaliados.push({
          guess,
          realGame,
          matchFound: true,
          pontos: evalRes.pontos,
          pontosResultado: evalRes.pontosResultado,
          pontosPlacar: evalRes.pontosPlacar,
          pontosCapitao: evalRes.pontosCapitao,
          golsCapitao: evalRes.golsCapitao,
          nomeCapitao: evalRes.nomeCapitao,
          acertouResultado: evalRes.acertouResultado,
          acertouPlacar: evalRes.acertouPlacar,
          isSpecialZeroZero: evalRes.isSpecialZeroZero,
          motivo: evalRes.motivo,
          jogoFormatado: `${realGame.time_mandante} x ${realGame.time_visitante}`,
          resultadoRealFormatado: `${realGame.time_mandante} ${realGame.gols_mandante} x ${realGame.gols_visitante} ${realGame.time_visitante}`
        });
        break;
      }
    }

    if (!matched) {
      jogosAvaliados.push({
        guess,
        matchFound: false,
        pontos: guess.pontos_concedidos || 0,
        pontosResultado: 0,
        pontosPlacar: 0,
        pontosCapitao: 0,
        golsCapitao: 0,
        nomeCapitao: guess.capitao || '',
        acertouResultado: false,
        acertouPlacar: false,
        isSpecialZeroZero: false,
        motivo: guess.avaliado ? 'Apurado anteriormente' : 'Aguardando resultado oficial',
        jogoFormatado: guess.palpite,
        resultadoRealFormatado: '-'
      });
      if (guess.pontos_concedidos) {
        totalPontos += guess.pontos_concedidos;
      }
    }
  }

  return {
    participante: userGuesses[0]?.participante || '',
    totalPontos,
    totalPontosResultado,
    totalPontosPlacar,
    totalPontosCapitao,
    totalAcertosResultado,
    totalAcertosPlacar,
    totalGolsCapitao,
    jogosAvaliados
  };
}
