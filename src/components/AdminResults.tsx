import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  doc, 
  addDoc, 
  increment,
  setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada, Palpite, Participante, JogoResultadoOficial } from '../types';
import { TEAMS_LIST } from '../constants/teams';
import { REAL_UCL_FIXTURES, getFixturesForRoundDate } from '../constants/uclFixtures';
import { evaluateGuessAgainstResult, parseGuess, normalizeTeamName, areTeamsMatching } from '../utils/scoreCalculator';
import { getNextTuesday13h, getNextWednesday13h, getClosingForNextRound, getClosingForRound, formatDateTimeDisplay, getRoundNumber, isTuesdayMatchday, getFriendlyClosingLabel } from '../utils/dateUtils';
import TabelaParticipacao from './TabelaParticipacao';
import { 
  Check, 
  ShieldAlert, 
  Award, 
  CheckCircle2, 
  Zap, 
  Plus, 
  Trash2, 
  Sparkles,
  Users,
  Trophy,
  Lock,
  Unlock,
  Search,
  Filter,
  Save,
  Flame,
  Minus,
  RefreshCw,
  SlidersHorizontal,
  Edit
} from 'lucide-react';
import { UclStarball, UclTrophy, UclBadge } from './UclAssets';

const SCORE_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

interface MatchResultInput {
  timeMandante: string;
  golsMandante: string;
  golsVisitante: string;
  timeVisitante: string;
}

export default function AdminResults() {
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [guesses, setGuesses] = useState<Palpite[]>([]);
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState<Participante[]>([]);

  // List of Official Matches to evaluate in this round (placar geral do jogo)
  const [officialMatches, setOfficialMatches] = useState<MatchResultInput[]>([
    { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '' }
  ]);

  // Individual Captain Goals state per guess ID: { [guessId]: numberOfGoals }
  const [individualCaptainGoals, setIndividualCaptainGoals] = useState<Record<string, number>>({});
  const [individualCaptainNames, setIndividualCaptainNames] = useState<Record<string, string>>({});
  const [editingCaptainGuessId, setEditingCaptainGuessId] = useState<string | null>(null);
  const [editingCaptainTempName, setEditingCaptainTempName] = useState<string>('');
  const [savingGuessId, setSavingGuessId] = useState<string | null>(null);

  const handleSetCustomCaptainName = (guessId: string, name: string) => {
    setIndividualCaptainNames(prev => ({
      ...prev,
      [guessId]: name
    }));
  };

  // Search and filter in evaluation preview
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'com_capitao' | 'com_gols' | 'acertou_placar'>('todos');

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [processingAuto, setProcessingAuto] = useState(false);

  const [activeAdminTab, setActiveAdminTab] = useState<'apuracao' | 'participacao'>('apuracao');

  // Load rounds and participants
  useEffect(() => {
    async function loadData() {
      try {
        const rSnap = await getDocs(collection(db, 'rodadas'));
        const rList: Rodada[] = [];
        rSnap.forEach(docObj => {
          rList.push({ id: docObj.id, ...docObj.data() } as Rodada);
        });
        
        // Sort rounds by round number
        rList.sort((a,b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
        setRounds(rList);
        
        if (rList.length > 0 && !selectedRoundId) {
          // Select open round or first round
          const openOrFirst = rList.find(r => r.status === 'aberta') || rList[0];
          setSelectedRoundId(openOrFirst.id);
        }

        const pSnap = await getDocs(collection(db, 'participantes'));
        const pList: Participante[] = [];
        pSnap.forEach((docObj) => {
          pList.push({ id: docObj.id, ...docObj.data() } as Participante);
        });
        setParticipants(pList);
      } catch (err) {
        console.error("Error loading initial admin data:", err);
      }
    }
    loadData();
  }, []);

  // Function to extract unique matches from guesses in this round
  const extractMatchesFromGuesses = (guessList: Palpite[]): MatchResultInput[] => {
    const uniqueMatches: MatchResultInput[] = [];
    const seenKeys = new Set<string>();

    // 1. Draw guesses or full-match guesses with both clubs specified
    for (const g of guessList) {
      const parsed = parseGuess(g);
      if (parsed && parsed.timeMandante && parsed.timeVisitante) {
        const canonicalHome = TEAMS_LIST.find(t => areTeamsMatching(t, parsed.timeMandante)) || parsed.timeMandante;
        const canonicalAway = TEAMS_LIST.find(t => areTeamsMatching(t, parsed.timeVisitante)) || parsed.timeVisitante;
        
        const matchKey = `${normalizeTeamName(canonicalHome)}__vs__${normalizeTeamName(canonicalAway)}`;
        const reverseKey = `${normalizeTeamName(canonicalAway)}__vs__${normalizeTeamName(canonicalHome)}`;

        if (!seenKeys.has(matchKey) && !seenKeys.has(reverseKey)) {
          seenKeys.add(matchKey);
          uniqueMatches.push({
            timeMandante: canonicalHome,
            timeVisitante: canonicalAway,
            golsMandante: '',
            golsVisitante: ''
          });
        }
      }
    }

    // 2. Cross-reference winner guesses with verified UCL calendar fixtures
    const targetR = rounds.find(r => r.id === selectedRoundId);
    const fixtures = getFixturesForRoundDate(targetR?.nome || targetR?.id || '20/10');
    for (const f of fixtures) {
      const matchKey = `${normalizeTeamName(f.time_mandante)}__vs__${normalizeTeamName(f.time_visitante)}`;
      const reverseKey = `${normalizeTeamName(f.time_visitante)}__vs__${normalizeTeamName(f.time_mandante)}`;

      if (!seenKeys.has(matchKey) && !seenKeys.has(reverseKey)) {
        const hasGuess = guessList.some(g => {
          const p = parseGuess(g);
          if (!p) return false;
          return areTeamsMatching(p.timeMandante, f.time_mandante) ||
                 areTeamsMatching(p.timeMandante, f.time_visitante) ||
                 (p.timeVisitante && (areTeamsMatching(p.timeVisitante, f.time_mandante) || areTeamsMatching(p.timeVisitante, f.time_visitante)));
        });

        if (hasGuess) {
          seenKeys.add(matchKey);
          uniqueMatches.push({
            timeMandante: f.time_mandante,
            timeVisitante: f.time_visitante,
            golsMandante: '',
            golsVisitante: ''
          });
        }
      }
    }

    // 3. If still fewer than 5 matches, fill with official round fixtures so admin has 5 ready matches
    for (const f of fixtures) {
      if (uniqueMatches.length >= 5) break;
      const matchKey = `${normalizeTeamName(f.time_mandante)}__vs__${normalizeTeamName(f.time_visitante)}`;
      const reverseKey = `${normalizeTeamName(f.time_visitante)}__vs__${normalizeTeamName(f.time_mandante)}`;
      if (!seenKeys.has(matchKey) && !seenKeys.has(reverseKey)) {
        seenKeys.add(matchKey);
        uniqueMatches.push({
          timeMandante: f.time_mandante,
          timeVisitante: f.time_visitante,
          golsMandante: '',
          golsVisitante: ''
        });
      }
    }

    return uniqueMatches;
  };

  // Load guesses and existing official results when selected round changes
  const loadGuessesForSelectedRound = async () => {
    if (!selectedRoundId) return;

    setLoading(true);
    try {
      const q = query(
        collection(db, 'palpites'),
        where('rodada', '==', selectedRoundId),
        orderBy('data_hora_envio', 'asc')
      );
      const snap = await getDocs(q);
      const list: Palpite[] = [];
      snap.forEach((docObj) => {
        list.push({ id: docObj.id, ...docObj.data() } as Palpite);
      });
      setGuesses(list);

      // Pre-fill individual captain goals from already saved guesses
      setIndividualCaptainGoals(prev => {
        const nextMap = { ...prev };
        list.forEach(g => {
          if (nextMap[g.id] === undefined) {
            nextMap[g.id] = g.gols_capitao !== undefined && g.gols_capitao !== null ? g.gols_capitao : 0;
          }
        });
        return nextMap;
      });

      // Check if this round already has official matches registered
      const targetR = rounds.find(r => r.id === selectedRoundId);
      if (targetR?.jogos_oficiais && targetR.jogos_oficiais.length > 0) {
        setOfficialMatches(prev => {
          return targetR.jogos_oficiais!.map(jo => {
            const existing = prev.find(p => 
              (areTeamsMatching(p.timeMandante, jo.time_mandante) && areTeamsMatching(p.timeVisitante, jo.time_visitante)) ||
              (areTeamsMatching(p.timeMandante, jo.time_visitante) && areTeamsMatching(p.timeVisitante, jo.time_mandante))
            );
            return {
              timeMandante: jo.time_mandante,
              timeVisitante: jo.time_visitante,
              golsMandante: existing && existing.golsMandante !== '' ? existing.golsMandante : String(jo.gols_mandante),
              golsVisitante: existing && existing.golsVisitante !== '' ? existing.golsVisitante : String(jo.gols_visitante)
            };
          });
        });
      } else {
        const qOficiais = query(
          collection(db, 'resultados_oficiais'),
          where('rodada_id', '==', selectedRoundId)
        );
        const snapOficiais = await getDocs(qOficiais);
        if (!snapOficiais.empty) {
          const loaded: MatchResultInput[] = [];
          snapOficiais.forEach(d => {
            const data = d.data();
            loaded.push({
              timeMandante: data.time_mandante || '',
              timeVisitante: data.time_visitante || '',
              golsMandante: String(data.gols_mandante ?? ''),
              golsVisitante: String(data.gols_visitante ?? '')
            });
          });
          if (loaded.length > 0) {
            setOfficialMatches(prev => {
              return loaded.map(l => {
                const existing = prev.find(p => 
                  (areTeamsMatching(p.timeMandante, l.timeMandante) && areTeamsMatching(p.timeVisitante, l.timeVisitante)) ||
                  (areTeamsMatching(p.timeMandante, l.timeVisitante) && areTeamsMatching(p.timeVisitante, l.timeMandante))
                );
                return existing && (existing.golsMandante !== '' || existing.golsVisitante !== '') ? existing : l;
              });
            });
          }
        } else {
          // AUTO-DISCOVERY: No official results saved yet, automatically discover matches from participants' guesses and official fixtures!
          const autoDiscovered = extractMatchesFromGuesses(list);
          if (autoDiscovered.length > 0) {
            setOfficialMatches(prev => {
              return autoDiscovered.map(ad => {
                const existing = prev.find(p => 
                  (areTeamsMatching(p.timeMandante, ad.timeMandante) && areTeamsMatching(p.timeVisitante, ad.timeVisitante)) ||
                  (areTeamsMatching(p.timeMandante, ad.timeVisitante) && areTeamsMatching(p.timeVisitante, ad.timeMandante))
                );
                return existing && (existing.golsMandante !== '' || existing.golsVisitante !== '') ? existing : ad;
              });
            });
          } else {
            setOfficialMatches([
              { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '' },
              { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '' },
              { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '' },
              { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '' },
              { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '' }
            ]);
          }
        }
      }
    } catch (err) {
      console.error("Error loading guesses in AdminResults:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to re-detect games from submitted guesses on demand
  const handleAutoPopulateMatchesFromGuesses = () => {
    const auto = extractMatchesFromGuesses(guesses);
    if (auto.length > 0) {
      setOfficialMatches(prev => {
        return auto.map(ad => {
          const existing = prev.find(p => 
            (areTeamsMatching(p.timeMandante, ad.timeMandante) && areTeamsMatching(p.timeVisitante, ad.timeVisitante)) ||
            (areTeamsMatching(p.timeMandante, ad.timeVisitante) && areTeamsMatching(p.timeVisitante, ad.timeMandante))
          );
          return existing && (existing.golsMandante !== '' || existing.golsVisitante !== '') ? existing : ad;
        });
      });
      setSuccessMsg(`Confrontos preenchidos automaticamente com base nos palpites e calendário oficial (${auto.length} confrontos carregados). Basta ajustar os placares!`);
    } else {
      setErrorMsg('Nenhum confronto identificado para esta rodada.');
    }
  };

  // Helper to load official UCL fixtures directly
  const handleLoadOfficialFixtures = () => {
    const targetR = rounds.find(r => r.id === selectedRoundId);
    const fixtures = getFixturesForRoundDate(targetR?.nome || targetR?.id || '20/10');
    if (fixtures && fixtures.length > 0) {
      setOfficialMatches(prev => {
        return fixtures.slice(0, 5).map(f => {
          const existing = prev.find(p => 
            (areTeamsMatching(p.timeMandante, f.time_mandante) && areTeamsMatching(p.timeVisitante, f.time_visitante)) ||
            (areTeamsMatching(p.timeMandante, f.time_visitante) && areTeamsMatching(p.timeVisitante, f.time_mandante))
          );
          return {
            timeMandante: f.time_mandante,
            timeVisitante: f.time_visitante,
            golsMandante: existing ? existing.golsMandante : '',
            golsVisitante: existing ? existing.golsVisitante : ''
          };
        });
      });
      setSuccessMsg(`5 confrontos oficiais da rodada da Champions League carregados! Preencha os placares.`);
    }
  };

  useEffect(() => {
    loadGuessesForSelectedRound();
    setSuccessMsg('');
    setErrorMsg('');
  }, [selectedRoundId]);

  // Handlers for official matches input
  const handleMatchInputChange = (index: number, field: keyof MatchResultInput, value: string) => {
    setOfficialMatches(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddOfficialMatch = () => {
    setOfficialMatches(prev => [
      ...prev,
      { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '' }
    ]);
  };

  const handleRemoveOfficialMatch = (index: number) => {
    if (officialMatches.length <= 1) return;
    setOfficialMatches(prev => prev.filter((_, i) => i !== index));
  };

  // Handler for individual captain goals
  const handleSetCaptainGoals = (guessId: string, goals: number) => {
    const clamped = Math.max(0, Math.min(20, goals));
    setIndividualCaptainGoals(prev => ({
      ...prev,
      [guessId]: clamped
    }));
  };

  // Extract only the latest (valid) submission guesses for each participant
  const validGuessesByParticipant: Record<string, Palpite[]> = {};
  const participantGroups: Record<string, Palpite[]> = guesses.reduce((acc, curr) => {
    if (!acc[curr.participante]) acc[curr.participante] = [];
    acc[curr.participante].push(curr);
    return acc;
  }, {} as Record<string, Palpite[]>);

  for (const [pName, pGuesses] of Object.entries(participantGroups)) {
    const sorted = [...pGuesses].sort((a,b) => new Date(a.data_hora_envio).getTime() - new Date(b.data_hora_envio).getTime());
    const uploadTimestamps = Array.from(new Set(sorted.map(g => g.data_hora_envio)));
    const latestTimestamp = uploadTimestamps[uploadTimestamps.length - 1];
    validGuessesByParticipant[pName] = sorted.filter(g => g.data_hora_envio === latestTimestamp);
  }

  // Pre-calculate automatic preview for all valid matches
  const validOfficialGames = officialMatches.filter(
    m => m.timeMandante && m.timeVisitante && m.golsMandante !== '' && m.golsVisitante !== ''
  );

  interface ParticipantEvalDetail {
    jogo: string;
    palpiteTexto: string;
    resultadoReal: string;
    pontos: number;
    motivo: string;
    guessId: string;
    capitaoNome: string;
    hasCaptain: boolean;
    acertouResultado?: boolean;
    acertouPlacar?: boolean;
    pontosResultado?: number;
    pontosPlacar?: number;
    pontosCapitao?: number;
    golsCapitao: number;
    isSaved?: boolean;
  }

  interface ParticipantEvalSummary {
    participante: string;
    totalPontos: number;
    totalPontosJogo: number;
    totalPontosCapitao: number;
    totalGolsCapitao: number;
    detalhes: ParticipantEvalDetail[];
  }

  const evaluationPreview: ParticipantEvalSummary[] = [];

  if (validOfficialGames.length > 0) {
    for (const [pName, pGuesses] of Object.entries(validGuessesByParticipant)) {
      let userTotal = 0;
      let userPontosJogo = 0;
      let userPontosCapitao = 0;
      let userGolsCapitao = 0;
      const userDetails: ParticipantEvalDetail[] = [];

      for (const realGame of validOfficialGames) {
        const gameObj: JogoResultadoOficial = {
          time_mandante: realGame.timeMandante,
          gols_mandante: parseInt(realGame.golsMandante, 10),
          time_visitante: realGame.timeVisitante,
          gols_visitante: parseInt(realGame.golsVisitante, 10),
          gols_jogadores: [] // gols agora são marcados individualmente em cada palpite
        };

        const realResultText = `${realGame.timeMandante} ${realGame.golsMandante} x ${realGame.golsVisitante} ${realGame.timeVisitante}`;

        // Find matching guess from this participant
        for (const guess of pGuesses) {
          const effectiveCaptain = individualCaptainNames[guess.id] !== undefined
            ? individualCaptainNames[guess.id]
            : (guess.capitao || '');
          const guessWithCaptain = { ...guess, capitao: effectiveCaptain };

          // Check captain goals override set individually by admin
          const individualGoals = individualCaptainGoals[guess.id] !== undefined 
            ? individualCaptainGoals[guess.id] 
            : (guess.gols_capitao || 0);

          const evalRes = evaluateGuessAgainstResult(guessWithCaptain, gameObj, individualGoals);
          if (evalRes.matchFound) {
            userTotal += evalRes.pontos;
            userPontosJogo += (evalRes.pontosResultado + evalRes.pontosPlacar);
            userPontosCapitao += evalRes.pontosCapitao;
            userGolsCapitao += evalRes.golsCapitao;

            const hasCap = Boolean(
              effectiveCaptain && 
              effectiveCaptain.trim() !== '' && 
              effectiveCaptain.toLowerCase() !== 'nenhum' && 
              effectiveCaptain.toLowerCase() !== 'sem capitão'
            );

            userDetails.push({
              jogo: `${realGame.timeMandante} x ${realGame.timeVisitante}`,
              palpiteTexto: guess.palpite,
              resultadoReal: realResultText,
              pontos: evalRes.pontos,
              motivo: evalRes.motivo,
              acertouResultado: evalRes.acertouResultado,
              acertouPlacar: evalRes.acertouPlacar,
              pontosResultado: evalRes.pontosResultado,
              pontosPlacar: evalRes.pontosPlacar,
              pontosCapitao: evalRes.pontosCapitao,
              golsCapitao: evalRes.golsCapitao,
              guessId: guess.id,
              capitaoNome: effectiveCaptain,
              hasCaptain: hasCap,
              isSaved: guess.avaliado
            });
          }
        }
      }

      if (userDetails.length > 0) {
        evaluationPreview.push({
          participante: pName,
          totalPontos: userTotal,
          totalPontosJogo: userPontosJogo,
          totalPontosCapitao: userPontosCapitao,
          totalGolsCapitao: userGolsCapitao,
          detalhes: userDetails
        });
      }
    }
  }

  // Filter evaluation preview by search and status
  const filteredEvaluation = evaluationPreview.filter(item => {
    if (searchFilter.trim()) {
      const s = searchFilter.toLowerCase();
      const matchName = item.participante.toLowerCase().includes(s);
      const matchCap = item.detalhes.some(d => d.capitaoNome.toLowerCase().includes(s));
      if (!matchName && !matchCap) return false;
    }

    if (statusFilter === 'com_capitao') {
      return item.detalhes.some(d => d.hasCaptain);
    }
    if (statusFilter === 'com_gols') {
      return item.totalGolsCapitao > 0;
    }
    if (statusFilter === 'acertou_placar') {
      return item.detalhes.some(d => d.acertouPlacar);
    }

    return true;
  });

  // Summary Metrics of the preview
  const totalParticipantesApurados = evaluationPreview.length;
  const totalPontosADistribuir = evaluationPreview.reduce((sum, i) => sum + i.totalPontos, 0);
  const totalGolsCapitaoMarcados = evaluationPreview.reduce((sum, i) => sum + i.totalGolsCapitao, 0);
  const totalAcertosPlacarExato = evaluationPreview.reduce(
    (sum, i) => sum + i.detalhes.filter(d => d.acertouPlacar).length, 0
  );

  // Individual Palpite Save Handler
  const handleSaveIndividualGuess = async (
    guessId: string, 
    participantName: string, 
    detail: ParticipantEvalDetail
  ) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSavingGuessId(guessId);

    try {
      const targetRound = rounds.find(r => r.id === selectedRoundId);
      const roundName = targetRound ? targetRound.nome : 'Rodada';
      const nowISO = new Date().toISOString();

      const existingGuess = guesses.find(g => g.id === guessId);
      const prevPoints = existingGuess?.pontos_concedidos || 0;
      const diffPoints = detail.pontos - prevPoints;

      // 1. Update the individual guess document in Firestore safely
      const effectiveCap = (individualCaptainNames[guessId] !== undefined 
        ? individualCaptainNames[guessId] 
        : (detail.capitaoNome || '')).trim();

      await updateDoc(doc(db, 'palpites', guessId), {
        avaliado: true,
        pontos_concedidos: detail.pontos ?? 0,
        motivo_detalhado: detail.motivo || '',
        acertou_resultado: Boolean(detail.acertouResultado),
        acertou_placar: Boolean(detail.acertouPlacar),
        gols_capitao: detail.golsCapitao ?? 0,
        pontos_capitao: detail.pontosCapitao ?? 0,
        capitao_fez_gol: (detail.golsCapitao || 0) > 0,
        capitao: effectiveCap,
        resultado_oficial: detail.resultadoReal || '',
        jogo_oficial: detail.jogo || ''
      });

      // 2. If point differential is non-zero, update participant total and add log
      if (diffPoints !== 0) {
        const matchingP = participants.find(
          p => p.nome.trim().toLowerCase() === participantName.trim().toLowerCase()
        );
        if (matchingP) {
          await updateDoc(doc(db, 'participantes', matchingP.id), {
            pontos: increment(diffPoints)
          });

          await addDoc(collection(db, 'pontuacoes'), {
            participante: matchingP.nome,
            pontos: diffPoints,
            motivo: `Atualização Individual de Gol/Placar • ${roundName} • ${detail.jogo} (${detail.motivo})`,
            data_hora: nowISO
          });
        }
      }

      setSuccessMsg(`Palpite de ${participantName} salvo com sucesso! (${detail.golsCapitao} gol(s) do capitão, +${detail.pontos} pts)`);
      await loadGuessesForSelectedRound();
    } catch (err: any) {
      console.error("Error saving individual guess:", err);
      setErrorMsg(`Erro ao salvar palpite individual: ${err?.message || err}`);
    } finally {
      setSavingGuessId(null);
    }
  };

  // Automatic Batch Update Execution
  const handleExecuteAutomaticScoring = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (validOfficialGames.length === 0) {
      setErrorMsg('Por favor, selecione os times e os placares de pelo menos um jogo oficial.');
      return;
    }

    if (evaluationPreview.length === 0) {
      setErrorMsg('Nenhum palpite enviado nesta rodada coincide com os jogos oficiais configurados.');
      return;
    }

    setProcessingAuto(true);
    try {
      const targetRound = rounds.find(r => r.id === selectedRoundId);
      const roundName = targetRound ? targetRound.nome : 'Rodada';
      const nowISO = new Date().toISOString();

      let participantsUpdatedCount = 0;

      for (const evalItem of evaluationPreview) {
        const matchingParticipant = participants.find(
          p => p.nome.trim().toLowerCase() === evalItem.participante.trim().toLowerCase()
        );

        // Calculate points previously awarded for these guesses in this round
        const previouslyAwarded = evalItem.detalhes.reduce((sum, d) => {
          const g = guesses.find(guess => guess.id === d.guessId);
          return sum + (g?.pontos_concedidos || 0);
        }, 0);

        const diffPoints = evalItem.totalPontos - previouslyAwarded;

        if (matchingParticipant && diffPoints !== 0) {
          // 1. Update participant total points safely with differential to prevent duplication
          await updateDoc(doc(db, 'participantes', matchingParticipant.id), {
            pontos: increment(diffPoints)
          });

          // 2. Add score log
          const descr = evalItem.detalhes
            .map(d => `${d.jogo}: [${d.palpiteTexto}] -> ${d.resultadoReal} (+${d.pontos} pts: ${d.motivo})`)
            .join(' | ');

          await addDoc(collection(db, 'pontuacoes'), {
            participante: matchingParticipant.nome,
            pontos: diffPoints,
            motivo: `Apuração Oficial • ${roundName} • ${descr}`,
            data_hora: nowISO
          });

          participantsUpdatedCount++;
        }

        // 3. Mark guess documents as evaluated with individual captain goals safely
        for (const detail of evalItem.detalhes) {
          if (detail.guessId) {
            const effectiveCap = (individualCaptainNames[detail.guessId] !== undefined 
              ? individualCaptainNames[detail.guessId] 
              : (detail.capitaoNome || '')).trim();

            await updateDoc(doc(db, 'palpites', detail.guessId), {
              avaliado: true,
              pontos_concedidos: detail.pontos ?? 0,
              motivo_detalhado: detail.motivo || '',
              acertou_resultado: Boolean(detail.acertouResultado),
              acertou_placar: Boolean(detail.acertouPlacar),
              gols_capitao: detail.golsCapitao ?? 0,
              pontos_capitao: detail.pontosCapitao ?? 0,
              capitao_fez_gol: (detail.golsCapitao || 0) > 0,
              capitao: effectiveCap,
              resultado_oficial: detail.resultadoReal || '',
              jogo_oficial: detail.jogo || ''
            });
          }
        }
      }

      // 4. Save official match results
      const jogosOficiaisList: JogoResultadoOficial[] = [];
      for (let i = 0; i < validOfficialGames.length; i++) {
        const og = validOfficialGames[i];
        const resId = `${selectedRoundId}_jogo_${i + 1}`;
        const gameData: JogoResultadoOficial = {
          time_mandante: og.timeMandante,
          gols_mandante: parseInt(og.golsMandante, 10),
          time_visitante: og.timeVisitante,
          gols_visitante: parseInt(og.golsVisitante, 10),
          gols_jogadores: []
        };
        jogosOficiaisList.push(gameData);

        await setDoc(doc(db, 'resultados_oficiais', resId), {
          rodada_id: selectedRoundId,
          rodada_nome: roundName,
          ...gameData,
          data_apuracao: nowISO
        });
      }

      // 5. Encerrar a rodada atual com os jogos oficiais e abrir automaticamente o mercado da próxima rodada!
      await updateDoc(doc(db, 'rodadas', selectedRoundId), {
        status: 'encerrada',
        jogos_oficiais: jogosOficiaisList,
        apurada: true,
        data_apuracao: nowISO
      });

      const isEvaluatingTestRound = selectedRoundId === 'rodada-teste' || targetRound?.is_test;
      let nextRoundMsg = '';

      if (isEvaluatingTestRound) {
        // Na rodada de teste, o mercado reabre automaticamente para novos testes
        const testClose = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);
        await updateDoc(doc(db, 'rodadas', selectedRoundId), {
          status: 'aberta',
          fechamento: testClose.toISOString()
        });
        nextRoundMsg = ` Placares atualizados e o mercado da Rodada de Teste foi REABERTO AUTOMATICAMENTE para novos testes!`;
      } else {
        const currentRoundNum = getRoundNumber(roundName || selectedRoundId);
        const wasTuesday = isTuesdayMatchday(targetRound);

        let nextRound: Rodada | undefined;

        if (wasTuesday) {
          // Terça apurada: a próxima etapa é a QUARTA da MESMA rodada!
          nextRound = rounds.find(r => 
            !r.is_test && 
            r.id !== 'rodada-teste' && 
            getRoundNumber(r.nome || r.id) === currentRoundNum &&
            !isTuesdayMatchday(r)
          );
        } else {
          // Quarta apurada: a próxima etapa é a TERÇA da PRÓXIMA rodada (currentRoundNum + 1)!
          nextRound = rounds.find(r => 
            !r.is_test && 
            r.id !== 'rodada-teste' && 
            getRoundNumber(r.nome || r.id) === currentRoundNum + 1 &&
            isTuesdayMatchday(r)
          );
        }

        // Fallback: se não encontrar por separação explícita de dia, busca próxima rodada disponível
        if (!nextRound) {
          nextRound = rounds.find(r => 
            !r.is_test && 
            r.id !== 'rodada-teste' && 
            r.id !== selectedRoundId && 
            !r.apurada && 
            r.status !== 'aberta'
          );
        }

        if (nextRound) {
          const { fechamento: nextClosing, targetDateLabel: nextDate, targetDayName } = getClosingForNextRound(targetRound, new Date());
          const nextMatches = REAL_UCL_FIXTURES[nextDate] || REAL_UCL_FIXTURES['21/10'];

          await updateDoc(doc(db, 'rodadas', nextRound.id), {
            status: 'aberta',
            abertura: nowISO,
            fechamento: nextClosing.toISOString(),
            data_jogos: nextDate,
            jogos_disponiveis: nextMatches
          });
          nextRoundMsg = ` A ${roundName} foi encerrada e o mercado da ${nextRound.nome} foi ABERTO AUTOMATICAMENTE com fechamento na ${targetDayName} (${formatDateTimeDisplay(nextClosing.toISOString())})!`;
        } else {
          nextRoundMsg = ` A ${roundName} foi encerrada.`;
        }
      }

      // Reload fresh participants, rounds and guesses
      const pSnapUpdated = await getDocs(collection(db, 'participantes'));
      const pListUpdated: Participante[] = [];
      pSnapUpdated.forEach((docObj) => {
        pListUpdated.push({ id: docObj.id, ...docObj.data() } as Participante);
      });
      setParticipants(pListUpdated);

      const rSnapUpdated = await getDocs(collection(db, 'rodadas'));
      const rListUpdated: Rodada[] = [];
      rSnapUpdated.forEach(docObj => {
        rListUpdated.push({ id: docObj.id, ...docObj.data() } as Rodada);
      });
      rListUpdated.sort((a,b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
      setRounds(rListUpdated);

      await loadGuessesForSelectedRound();

      setSuccessMsg(
        `Apuração concluída com sucesso! ${participantsUpdatedCount} participante(s) receberam pontos calculados.${nextRoundMsg}`
      );
    } catch (err: any) {
      console.error("Error executing automatic scoring:", err);
      setErrorMsg(`Erro ao atualizar placares automaticamente: ${err?.message || err}`);
    } finally {
      setProcessingAuto(false);
    }
  };

  const targetSelectedRound = rounds.find(r => r.id === selectedRoundId);

  const handleOpenMarketNow = async () => {
    if (!selectedRoundId) return;
    const now = new Date();
    const { fechamento: nextClosing, targetDayName } = getClosingForRound(targetSelectedRound, now);
    try {
      await updateDoc(doc(db, 'rodadas', selectedRoundId), {
        status: 'aberta',
        abertura: now.toISOString(),
        fechamento: nextClosing.toISOString()
      });
      setSuccessMsg(`Mercado da rodada aberto com sucesso! Fechamento na ${targetDayName} (${formatDateTimeDisplay(nextClosing.toISOString())}).`);
      const rSnapUpdated = await getDocs(collection(db, 'rodadas'));
      const rListUpdated: Rodada[] = [];
      rSnapUpdated.forEach(docObj => {
        rListUpdated.push({ id: docObj.id, ...docObj.data() } as Rodada);
      });
      rListUpdated.sort((a,b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
      setRounds(rListUpdated);
    } catch (err: any) {
      setErrorMsg(`Erro ao abrir mercado: ${err?.message || err}`);
    }
  };

  const handleCloseMarketNow = async () => {
    if (!selectedRoundId) return;
    try {
      await updateDoc(doc(db, 'rodadas', selectedRoundId), {
        status: 'encerrada'
      });
      setSuccessMsg(`Mercado da rodada encerrado com sucesso.`);
      const rSnapUpdated = await getDocs(collection(db, 'rodadas'));
      const rListUpdated: Rodada[] = [];
      rSnapUpdated.forEach(docObj => {
        rListUpdated.push({ id: docObj.id, ...docObj.data() } as Rodada);
      });
      rListUpdated.sort((a,b) => getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id));
      setRounds(rListUpdated);
    } catch (err: any) {
      setErrorMsg(`Erro ao fechar mercado: ${err?.message || err}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title - UEFA Match Control Room */}
      <div className="border-b border-cyan-500/20 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UclBadge text="UEFA CONTROL ROOM" variant="cyan" />
            <span className="text-[10px] font-mono font-bold text-cyan-300/70 tracking-widest uppercase">APURAÇÃO OFICIAL</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black font-display text-white uppercase flex items-center gap-2 tracking-tight">
            <UclStarball className="w-6 h-6 text-cyan-400" glow />
            Lançamento de Resultados & Gols dos Capitães
          </h3>
          <p className="text-xs text-slate-300 font-medium mt-1 max-w-2xl">
            Insira os placares oficiais dos confrontos da UEFA Champions League. Os acertos de vencedor e placar exato são calculados em tempo real, permitindo creditar os gols de capitão e atualizar o ranking oficial.
          </p>
        </div>
      </div>

      {/* Select Round Selector and Market Status */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 p-5 shadow-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="select-round-assess" className="text-xs font-black text-cyan-300 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
            <UclStarball className="w-3.5 h-3.5 text-cyan-400" /> Rodada:
          </label>
          <select
            id="select-round-assess"
            value={selectedRoundId}
            onChange={(e) => setSelectedRoundId(e.target.value)}
            className="px-3 py-2 bg-[#050b28] border border-cyan-500/40 rounded-xl text-xs font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-400 cursor-pointer min-w-[240px]"
          >
            <option value="">-- Selecione a Rodada --</option>
            {rounds.map(r => {
              const isTest = r.is_test || r.id === 'rodada-teste';
              return (
                <option key={r.id} value={r.id} className="bg-[#080f33] text-white">
                  {isTest ? '🧪 [TESTE] ' : ''}{r.nome} ({r.status === 'aberta' ? 'Mercado Aberto' : 'Mercado Fechado'})
                </option>
              );
            })}
          </select>
        </div>

        {targetSelectedRound && (
          <div className="flex flex-wrap items-center gap-2.5">
            {targetSelectedRound.status === 'aberta' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-cyan-950/80 text-cyan-300 border border-cyan-400/50 shadow-xs shadow-cyan-900/40">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                MERCADO ABERTO • Fechamento: {getFriendlyClosingLabel(targetSelectedRound.fechamento)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-950/80 text-rose-300 border border-rose-500/40 shadow-xs">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                MERCADO FECHADO
              </span>
            )}

            {targetSelectedRound.status === 'encerrada' ? (
              <button
                type="button"
                onClick={handleOpenMarketNow}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-emerald-950/50"
                title="Abre o mercado agora com fechamento na próxima terça-feira às 13:00"
              >
                <Unlock className="w-3.5 h-3.5" /> Abrir Mercado Desta Rodada
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCloseMarketNow}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-rose-950/50"
                title="Fecha o mercado antecipadamente"
              >
                <Lock className="w-3.5 h-3.5" /> Fechar Mercado Agora
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs: Apuração Automática vs Tabela de Participação */}
      <div className="flex flex-wrap items-center gap-2 border-b border-cyan-500/20 pb-2">
        <button
          onClick={() => setActiveAdminTab('apuracao')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
            activeAdminTab === 'apuracao'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-950/70 border border-cyan-300/40'
              : 'bg-[#080f33]/80 text-slate-300 border border-cyan-500/15 hover:border-cyan-500/35 hover:text-white'
          }`}
        >
          <Zap className="w-4 h-4 text-cyan-200" /> 1. Placares dos Jogos & Gols dos Capitães
        </button>
        <button
          onClick={() => setActiveAdminTab('participacao')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
            activeAdminTab === 'participacao'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-950/70 border border-cyan-300/40'
              : 'bg-[#080f33]/80 text-slate-300 border border-cyan-500/15 hover:border-cyan-500/35 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4 text-cyan-300" /> 2. Tabela de Participação (Quem Palpitou vs Quem Não Palpitou)
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 rounded-xl text-xs flex items-center gap-2.5 font-bold animate-fadeIn shadow-lg shadow-emerald-950/50">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs flex items-center gap-2.5 font-bold animate-fadeIn shadow-lg shadow-rose-950/50">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* RENDER CONDITIONAL TAB */}
      {activeAdminTab === 'participacao' && targetSelectedRound ? (
        <TabelaParticipacao
          round={targetSelectedRound}
          participantes={participants}
          palpites={guesses}
          isMarketClosed={targetSelectedRound.status === 'encerrada'}
        />
      ) : activeAdminTab === 'participacao' && !targetSelectedRound ? (
        <div className="p-12 text-center text-sm text-slate-400 bg-[#080f33]/90 border border-cyan-500/20 rounded-2xl">
          Selecione uma rodada para visualizar a tabela de participação.
        </div>
      ) : null}

      {activeAdminTab === 'apuracao' && (
        <>

      {/* Step 1: Official Matches Input Card */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 p-6 shadow-2xl backdrop-blur-md space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              Passo 1: Confrontos e Placares Oficiais dos Jogos ({officialMatches.length} confronto{officialMatches.length > 1 ? 's' : ''})
            </h4>
            <p className="text-[11px] text-slate-300 font-medium mt-1">
              Cadastre os confrontos oficiais com os dois adversários (ex: <strong>Arsenal 2 x 1 Barcelona</strong>). O sistema interpreta automaticamente quem venceu ou empatou e pontua os participantes (tanto quem foi de Arsenal quanto quem foi de Barcelona), <strong>sem diferenciação entre time da casa ou fora</strong>!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLoadOfficialFixtures}
              className="text-xs font-bold text-amber-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors bg-amber-950/60 hover:bg-amber-900/70 px-3 py-2 rounded-xl border border-amber-500/40 shadow-xs"
              title="Carrega os 5 confrontos oficiais do calendário verificado da UEFA Champions League"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" /> Carregar Calendário UCL
            </button>

            <button
              type="button"
              onClick={handleAutoPopulateMatchesFromGuesses}
              className="text-xs font-bold text-cyan-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors bg-cyan-950/60 hover:bg-cyan-900/70 px-3 py-2 rounded-xl border border-cyan-500/40 shadow-xs"
              title="Detecta e preenche todos os jogos que os participantes palpitaram nesta rodada"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" /> Detectar dos Palpites
            </button>

            <button
              type="button"
              onClick={handleAddOfficialMatch}
              className="text-xs font-bold text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors bg-[#0f1b52] hover:bg-[#152570] px-3 py-2 rounded-xl border border-cyan-500/20 shadow-xs"
              title="Adicionar outro confronto manual à lista"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" /> Adicionar Confronto
            </button>
          </div>
        </div>

        {/* Informative Rule Callout */}
        <div className="bg-[#040924] border border-cyan-500/20 rounded-xl p-3 text-[11px] text-slate-300 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-cyan-300 block mb-0.5">Como funciona a interpretação automática:</span>
            O participante palpitou apenas indicando o seu vencedor (ex: Hugo escolheu <em>Arsenal 2x1</em>; Marcelo escolheu <em>Barcelona 2x1</em>). Aqui no ADM você coloca o confronto com os dois clubes (ex: <em>Arsenal 2 x 1 Barcelona</em>). O sistema identifica automaticamente o resultado: Hugo ganha +5 pts (resultado + placar exato) e Marcelo ganha 0 pts (Barcelona perdeu de 1x2).
          </div>
        </div>

        {/* Fluid Match Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {officialMatches.map((match, idx) => {
            const hasCompleteScore = match.golsMandante !== '' && match.golsVisitante !== '';
            const gM = parseInt(match.golsMandante || '0', 10);
            const gV = parseInt(match.golsVisitante || '0', 10);
            const isHomeWinner = match.timeMandante && match.timeVisitante && hasCompleteScore && gM > gV;
            const isAwayWinner = match.timeMandante && match.timeVisitante && hasCompleteScore && gV > gM;
            const isDraw = match.timeMandante && match.timeVisitante && hasCompleteScore && gM === gV;

            // Find guesses from participants referencing either club in this confrontation
            const relatedGuesses = (match.timeMandante || match.timeVisitante) ? guesses.filter(g => {
              const p = parseGuess(g);
              if (!p) return false;
              const matchesHome = match.timeMandante && (areTeamsMatching(p.timeMandante, match.timeMandante) || (p.timeVisitante && areTeamsMatching(p.timeVisitante, match.timeMandante)));
              const matchesAway = match.timeVisitante && (areTeamsMatching(p.timeMandante, match.timeVisitante) || (p.timeVisitante && areTeamsMatching(p.timeVisitante, match.timeVisitante)));
              return matchesHome || matchesAway;
            }) : [];

            return (
              <div 
                key={idx} 
                className={`p-4 rounded-xl border transition-all ${
                  hasCompleteScore
                    ? 'border-cyan-400/60 bg-[#0b1442]/90 shadow-md shadow-cyan-950/60'
                    : 'border-cyan-500/20 bg-[#050b28]/70 hover:border-cyan-500/40'
                }`}
              >
                {/* Header of Match Card */}
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-cyan-500/15">
                  <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300 font-mono flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${hasCompleteScore ? 'bg-cyan-400 shadow-[0_0_8px_#00f0ff]' : 'bg-slate-600'}`}></span>
                    Confronto {idx + 1}
                  </span>

                  <div className="flex items-center gap-2">
                    {hasCompleteScore && (
                      <span className="text-[10px] font-black uppercase text-cyan-200 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-400/40 font-mono">
                        Placar Definido
                      </span>
                    )}
                    {officialMatches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOfficialMatch(idx)}
                        className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Remover confronto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Team Selectors and Scoreboard */}
                <div className="space-y-3">
                  {/* Home Team & Score */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <select
                        value={match.timeMandante}
                        onChange={(e) => handleMatchInputChange(idx, 'timeMandante', e.target.value)}
                        className="w-full p-2 bg-[#080f33] border border-cyan-500/30 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-400"
                      >
                        <option value="">-- Clube A (Adversário 1) --</option>
                        {TEAMS_LIST.map((team) => (
                          <option key={team} value={team} disabled={team === match.timeVisitante} className="bg-[#080f33] text-white">
                            {team}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Goals Stepper / Input */}
                    <div className="flex items-center border border-cyan-500/35 rounded-lg overflow-hidden bg-[#050b28] shrink-0 shadow-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const curr = parseInt(match.golsMandante || '0', 10);
                          const nextVal = Math.max(0, curr - 1);
                          handleMatchInputChange(idx, 'golsMandante', String(nextVal));
                        }}
                        className="w-7 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-cyan-950/50 active:bg-cyan-900/60 cursor-pointer text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        placeholder="-"
                        value={match.golsMandante}
                        onChange={(e) => handleMatchInputChange(idx, 'golsMandante', e.target.value)}
                        className="w-10 h-8 text-center text-xs font-black font-mono text-cyan-200 border-x border-cyan-500/25 bg-[#080f33] focus:outline-hidden focus:bg-[#0c164a]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const curr = parseInt(match.golsMandante || '0', 10);
                          handleMatchInputChange(idx, 'golsMandante', String(curr + 1));
                        }}
                        className="w-7 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-cyan-950/50 active:bg-cyan-900/60 cursor-pointer text-xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Quick vs Divider */}
                  <div className="text-center text-[10px] font-black text-cyan-400 font-mono uppercase tracking-widest">
                    x
                  </div>

                  {/* Away Team & Score */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <select
                        value={match.timeVisitante}
                        onChange={(e) => handleMatchInputChange(idx, 'timeVisitante', e.target.value)}
                        className="w-full p-2 bg-[#080f33] border border-cyan-500/30 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-400"
                      >
                        <option value="">-- Clube B (Adversário 2) --</option>
                        {TEAMS_LIST.map((team) => (
                          <option key={team} value={team} disabled={team === match.timeMandante} className="bg-[#080f33] text-white">
                            {team}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Goals Stepper / Input */}
                    <div className="flex items-center border border-cyan-500/35 rounded-lg overflow-hidden bg-[#050b28] shrink-0 shadow-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const curr = parseInt(match.golsVisitante || '0', 10);
                          const nextVal = Math.max(0, curr - 1);
                          handleMatchInputChange(idx, 'golsVisitante', String(nextVal));
                        }}
                        className="w-7 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-cyan-950/50 active:bg-cyan-900/60 cursor-pointer text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        placeholder="-"
                        value={match.golsVisitante}
                        onChange={(e) => handleMatchInputChange(idx, 'golsVisitante', e.target.value)}
                        className="w-10 h-8 text-center text-xs font-black font-mono text-cyan-200 border-x border-cyan-500/25 bg-[#080f33] focus:outline-hidden focus:bg-[#0c164a]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const curr = parseInt(match.golsVisitante || '0', 10);
                          handleMatchInputChange(idx, 'golsVisitante', String(curr + 1));
                        }}
                        className="w-7 h-8 flex items-center justify-center text-slate-300 hover:text-white hover:bg-cyan-950/50 active:bg-cyan-900/60 cursor-pointer text-xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Fast Goal Buttons Row */}
                  <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-cyan-500/15">
                    <span className="text-[10px] font-bold text-cyan-300/70">Atalhos rápidos:</span>
                    <div className="flex items-center gap-1">
                      {[
                        { label: '0x0', m: '0', v: '0' },
                        { label: '1x0', m: '1', v: '0' },
                        { label: '2x1', m: '2', v: '1' },
                        { label: '3x1', m: '3', v: '1' },
                        { label: '1x1', m: '1', v: '1' },
                        { label: '0x1', m: '0', v: '1' },
                        { label: '1x2', m: '1', v: '2' },
                        { label: '2x0', m: '2', v: '0' }
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            handleMatchInputChange(idx, 'golsMandante', preset.m);
                            handleMatchInputChange(idx, 'golsVisitante', preset.v);
                          }}
                          className="px-1.5 py-0.5 rounded bg-[#080f33] hover:bg-cyan-950/80 text-cyan-300 border border-cyan-500/25 text-[10px] font-mono font-bold cursor-pointer transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Official Match Interpretation Box */}
                  {match.timeMandante && match.timeVisitante && hasCompleteScore && (
                    <div className="mt-3 p-3 rounded-lg bg-[#040924] border border-cyan-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 font-bold flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" /> Interpretação Oficial:
                        </span>
                        <span className="text-[11px] font-black font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-200 border border-cyan-500/30">
                          {isHomeWinner && `Vitória do ${match.timeMandante} (${gM}x${gV})`}
                          {isAwayWinner && `Vitória do ${match.timeVisitante} (${gV}x${gM})`}
                          {isDraw && `Empate (${gM}x${gV})`}
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-300">
                        {isHomeWinner && (
                          <>
                            Quem palpitou vitória do <strong className="text-white">{match.timeMandante}</strong> pontua (+3 pts resultado, +2 pts se indicou {gM}x{gV}). Palpites em {match.timeVisitante} ou Empate não pontuam.
                          </>
                        )}
                        {isAwayWinner && (
                          <>
                            Quem palpitou vitória do <strong className="text-white">{match.timeVisitante}</strong> pontua (+3 pts resultado, +2 pts se indicou {gV}x{gM}). Palpites em {match.timeMandante} ou Empate não pontuam.
                          </>
                        )}
                        {isDraw && (
                          <>
                            Quem palpitou <strong className="text-white">Empate</strong> entre estes clubes pontua (+3 pts resultado, +2 pts se cravou {gM}x{gV}). Palpites em vitória não pontuam.
                          </>
                        )}
                      </p>

                      {/* Quick summary of participants identified for this match */}
                      {relatedGuesses.length > 0 && (
                        <div className="pt-2 border-t border-cyan-500/15 space-y-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                            Palpites identificados neste confronto ({relatedGuesses.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {relatedGuesses.map(g => {
                              const evalRes = evaluateGuessAgainstResult(g, {
                                time_mandante: match.timeMandante,
                                gols_mandante: gM,
                                time_visitante: match.timeVisitante,
                                gols_visitante: gV
                              });
                              return (
                                <span 
                                  key={g.id}
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                                    evalRes.pontos > 0 
                                      ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300' 
                                      : 'bg-slate-900/80 border-slate-700 text-slate-400'
                                  }`}
                                  title={`${g.participante}: ${g.palpite} -> ${evalRes.motivo}`}
                                >
                                  <strong>{g.participante}</strong> ({g.palpite}): {evalRes.pontos > 0 ? `+${evalRes.pontos} pts` : '0 pts'}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 2: Individual Captain Goals & Real-Time Palpites Evaluation */}
      {validOfficialGames.length > 0 && (
        <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 p-6 shadow-2xl backdrop-blur-md space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-cyan-500/20 pb-4">
            <div>
              <h4 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                Passo 2: Marcação Individual de Gol de Cada Capitão
              </h4>
              <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                Os confrontos já calcularam os acertos automaticamente. Marque abaixo quantos gols o capitão de cada participante fez (+1 pt por gol).
              </p>
            </div>

            {/* Quick Metrics Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 bg-[#050b28] rounded-lg text-[11px] font-bold text-slate-300 border border-cyan-500/20">
                👥 {totalParticipantesApurados} Participantes
              </span>
              <span className="px-2.5 py-1 bg-emerald-950/60 rounded-lg text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                🎯 {totalAcertosPlacarExato} Placar(es) Exato(s)
              </span>
              <span className="px-2.5 py-1 bg-amber-950/60 rounded-lg text-[11px] font-bold text-amber-300 border border-amber-500/30">
                ⚽ {totalGolsCapitaoMarcados} Gol(s) de Capitão
              </span>
              <span className="px-2.5 py-1 bg-gradient-to-r from-cyan-950 to-blue-950 rounded-lg text-[11px] font-black text-cyan-200 border border-cyan-400/40">
                🏆 +{totalPontosADistribuir} pts a Creditar
              </span>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#050b28]/80 p-3 rounded-xl border border-cyan-500/20">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar por participante ou capitão..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#080f33] border border-cyan-500/30 rounded-lg text-xs font-medium text-white focus:outline-hidden focus:ring-2 focus:ring-cyan-400"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[10px] font-bold text-cyan-300/70 uppercase tracking-wider shrink-0 flex items-center gap-1 font-mono">
                <Filter className="w-3 h-3" /> Filtro:
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter('todos')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  statusFilter === 'todos'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black'
                    : 'bg-[#080f33] border border-cyan-500/20 text-slate-300 hover:text-white'
                }`}
              >
                Todos ({evaluationPreview.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('com_capitao')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  statusFilter === 'com_capitao'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black'
                    : 'bg-[#080f33] border border-cyan-500/20 text-slate-300 hover:text-white'
                }`}
              >
                Com Capitão
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('com_gols')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  statusFilter === 'com_gols'
                    ? 'bg-amber-600 text-white font-black'
                    : 'bg-[#080f33] border border-cyan-500/20 text-slate-300 hover:text-white'
                }`}
              >
                Capitão com Gol 🔥
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('acertou_placar')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  statusFilter === 'acertou_placar'
                    ? 'bg-emerald-600 text-white font-black'
                    : 'bg-[#080f33] border border-cyan-500/20 text-slate-300 hover:text-white'
                }`}
              >
                Placar Exato 🎯
              </button>
            </div>
          </div>

          {/* Participant Cards with Individual Goal Inputs */}
          {filteredEvaluation.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-[#050b28]/60 rounded-xl border border-cyan-500/20 font-bold">
              Nenhum palpite corresponde aos filtros selecionados.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEvaluation.map((item) => (
                <div 
                  key={item.participante}
                  className="rounded-xl border border-cyan-500/20 bg-[#050b28]/85 shadow-lg shadow-cyan-950/40 hover:border-cyan-500/40 transition-all overflow-hidden"
                >
                  {/* Participant Header Bar */}
                  <div className="px-4 py-3 bg-[#080f33]/90 border-b border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-black flex items-center justify-center text-xs shadow-xs">
                        {item.participante.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-extrabold text-white text-sm">{item.participante}</span>
                        <div className="text-[10px] text-cyan-300/70 font-mono">
                          {item.detalhes.length} jogo(s) avaliado(s)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.totalGolsCapitao > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 font-mono">
                          ⚽ {item.totalGolsCapitao} gol(s) de capitão (+{item.totalGolsCapitao} pts)
                        </span>
                      )}
                      <span className="px-3 py-1 rounded-lg bg-cyan-950/90 border border-cyan-400/50 text-cyan-200 font-black text-xs font-mono shadow-xs">
                        Total a Somar: +{item.totalPontos} pts
                      </span>
                    </div>
                  </div>

                  {/* Guess Items List */}
                  <div className="p-4 divide-y divide-cyan-500/10 space-y-3">
                    {item.detalhes.map((det, dIdx) => (
                      <div 
                        key={`${item.participante}-${det.guessId}-${dIdx}`}
                        className={`pt-3 first:pt-0 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center ${
                          det.pontos > 0 ? 'bg-cyan-950/15' : ''
                        }`}
                      >
                        {/* Match & Guess Info */}
                        <div className="lg:col-span-4 space-y-1">
                          <div className="text-[11px] font-mono font-bold text-cyan-300 uppercase">
                            {det.jogo}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-extrabold text-white font-mono">
                              Palpite: {det.palpiteTexto}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-300 font-mono">
                            Resultado Real: <strong className="text-cyan-200">{det.resultadoReal}</strong>
                          </div>

                          {/* Automatic Match Result Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {det.acertouPlacar ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono">
                                🎯 Placar Exato (+2 pts)
                              </span>
                            ) : null}
                            {det.acertouResultado ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-950/80 text-cyan-300 border border-cyan-500/40 font-mono">
                                🏆 Acertou Vencedor/Empate (+3 pts)
                              </span>
                            ) : !det.acertouPlacar ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#080f33] text-slate-400 font-mono">
                                Errou o resultado (0 pts)
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Individual Captain Goal Marking Control */}
                        <div className="lg:col-span-5 bg-[#080f33]/90 p-3 rounded-xl border border-cyan-500/20 space-y-2">
                          {editingCaptainGuessId === det.guessId ? (
                            <div className="space-y-1.5 p-2 bg-[#050b28] rounded-lg border border-cyan-400/40">
                              <span className="text-[10px] font-bold text-cyan-300 block">
                                Digite o nome do capitão:
                              </span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  placeholder="Nome do capitão (ex: Haaland)..."
                                  value={editingCaptainTempName}
                                  onChange={(e) => setEditingCaptainTempName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSetCustomCaptainName(det.guessId, editingCaptainTempName.trim());
                                      setEditingCaptainGuessId(null);
                                    }
                                  }}
                                  className="flex-1 px-2 py-1 text-xs bg-[#030617] border border-cyan-500/50 rounded text-white font-bold placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-300"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSetCustomCaptainName(det.guessId, editingCaptainTempName.trim());
                                    setEditingCaptainGuessId(null);
                                  }}
                                  className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black rounded cursor-pointer transition-colors"
                                >
                                  OK
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCaptainGuessId(null)}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer transition-colors"
                                >
                                  ✕
                                </button>
                              </div>
                              {/* Sugestões rápidas de estrelas da Champions */}
                              <div className="flex items-center gap-1 overflow-x-auto pt-1 scrollbar-none">
                                {['Haaland', 'Mbappé', 'Vini Jr', 'Saka', 'Kane', 'Lewa'].map((star) => (
                                  <button
                                    key={star}
                                    type="button"
                                    onClick={() => {
                                      setEditingCaptainTempName(star);
                                      handleSetCustomCaptainName(det.guessId, star);
                                      setEditingCaptainGuessId(null);
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#0a1338] hover:bg-cyan-900 text-cyan-300 border border-cyan-700/40 cursor-pointer"
                                  >
                                    +{star}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold text-slate-300 flex items-center gap-1.5 flex-wrap">
                                ⚽ Capitão:{' '}
                                {det.hasCaptain ? (
                                  <strong className="text-white bg-[#050b28] px-2 py-0.5 rounded border border-cyan-500/30">
                                    {det.capitaoNome}
                                  </strong>
                                ) : (
                                  <span className="text-slate-400 italic">Sem capitão</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCaptainGuessId(det.guessId);
                                    setEditingCaptainTempName(det.capitaoNome || '');
                                  }}
                                  className="px-1.5 py-0.5 text-cyan-400 hover:text-white bg-[#050b28] hover:bg-cyan-950 border border-cyan-500/25 rounded transition-colors cursor-pointer text-[10px] flex items-center gap-1 font-bold"
                                  title="Editar ou atribuir capitão para este palpite"
                                >
                                  <Edit className="w-2.5 h-2.5" />
                                  <span>{det.hasCaptain ? 'Alterar' : '+ Adicionar'}</span>
                                </button>
                              </span>

                              {det.golsCapitao > 0 ? (
                                <span className="text-[10px] font-black text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-500/40 animate-pulse font-mono">
                                  🔥 +{det.golsCapitao} pt(s) capitão
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 font-mono">
                                  0 gol
                                </span>
                              )}
                            </div>
                          )}

                          {/* Interactive Stepper & Buttons */}
                          {det.hasCaptain ? (
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Stepper */}
                              <div className="flex items-center border border-cyan-500/35 rounded-lg overflow-hidden bg-[#050b28] shadow-xs">
                                <button
                                  type="button"
                                  onClick={() => handleSetCaptainGoals(det.guessId, det.golsCapitao - 1)}
                                  disabled={det.golsCapitao <= 0}
                                  className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-cyan-950/50 active:bg-cyan-900/60 disabled:opacity-30 cursor-pointer transition-colors"
                                  title="Diminuir gol"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-9 h-7 flex items-center justify-center font-mono font-black text-xs text-cyan-200 bg-[#080f33]">
                                  {det.golsCapitao}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSetCaptainGoals(det.guessId, det.golsCapitao + 1)}
                                  className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-cyan-950/50 active:bg-cyan-900/60 cursor-pointer transition-colors"
                                  title="Adicionar gol"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Quick selector buttons */}
                              <div className="flex items-center gap-1">
                                {[0, 1, 2, 3].map((gVal) => (
                                  <button
                                    key={gVal}
                                    type="button"
                                    onClick={() => handleSetCaptainGoals(det.guessId, gVal)}
                                    className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors font-mono ${
                                      det.golsCapitao === gVal
                                        ? gVal > 0 
                                          ? 'bg-amber-600 text-white font-black shadow-xs' 
                                          : 'bg-cyan-600 text-white font-black shadow-xs'
                                        : 'bg-[#050b28] border border-cyan-500/25 text-slate-300 hover:text-white'
                                    }`}
                                  >
                                    {gVal === 0 ? '0' : `${gVal} gol${gVal > 1 ? 's' : ''}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 italic">
                              Sem capitão. Clique em "+ Adicionar" acima para definir o capitão.
                            </p>
                          )}
                        </div>

                        {/* Calculated Points Breakdown & Individual Save */}
                        <div className="lg:col-span-3 flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-2">
                          <div className="text-right">
                            <div className="text-[10px] font-mono text-cyan-300/70 font-bold">
                              Jogo: +{(det.pontosResultado || 0) + (det.pontosPlacar || 0)} | Capitão: +{det.pontosCapitao || 0}
                            </div>
                            <div className="text-base font-black font-mono text-cyan-400">
                              +{det.pontos} pt{det.pontos !== 1 ? 's' : ''}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSaveIndividualGuess(det.guessId, item.participante, det)}
                            disabled={savingGuessId === det.guessId}
                            className="px-3.5 py-1.5 bg-[#0f1b52] hover:bg-cyan-900 active:bg-black text-cyan-200 hover:text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer border border-cyan-500/30 shadow-xs transition-colors disabled:opacity-50"
                            title="Salvar apenas este palpite individualmente"
                          >
                            <Save className="w-3 h-3" />
                            {savingGuessId === det.guessId ? 'Salvando...' : 'Salvar Palpite'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom Execution Button for Whole Round */}
          <div className="pt-4 border-t border-cyan-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={handleExecuteAutomaticScoring}
                disabled={processingAuto || evaluationPreview.length === 0}
                className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 active:from-cyan-600 active:to-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-950/80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4 fill-white" />
                {processingAuto 
                  ? 'Atualizando Todos os Placares e Gols no Banco...' 
                  : 'Lançar e Atualizar Todos os Placares e Gols da Rodada'
                }
              </button>
              <p className="text-[10px] font-mono text-cyan-300/70 mt-1.5">
                ★ Grava os placares oficiais, salva os gols individuais de cada capitão, credita os pontos no ranking geral e encerra a rodada.
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono font-bold text-slate-300 block">
                Total Geral Calculado:
              </span>
              <span className="text-lg font-black font-mono text-cyan-400">
                +{totalPontosADistribuir} pontos em {totalParticipantesApurados} participante(s)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Participants & Guesses Status Explorer */}
      <div className="bg-[#080f33]/90 rounded-2xl border border-cyan-500/25 overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="px-6 py-4 border-b border-cyan-500/20 bg-[#050b28]/60 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              Palpites Registrados na Rodada ({Object.keys(validGuessesByParticipant).length} Participantes)
            </h4>
            <p className="text-[10px] text-cyan-300/70 font-bold uppercase tracking-wider">
              Visualização consolidada de todos os palpites válidos enviados
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 font-mono">Buscando palpites...</div>
        ) : Object.keys(validGuessesByParticipant).length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Nenhum palpite enviado ainda para esta rodada.
          </div>
        ) : (
          <div className="divide-y divide-cyan-500/10">
            {Object.entries(validGuessesByParticipant).map(([participantName, pGuesses]) => (
              <div key={participantName} className="p-4 hover:bg-cyan-950/20 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">{participantName}</span>
                  <span className="text-[10px] font-mono text-cyan-300/70 font-bold">
                    {pGuesses.length} jogo(s) palpitado(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pGuesses.map((g, idx) => (
                    <div key={g.id || idx} className="p-2.5 rounded-lg border border-cyan-500/20 bg-[#050b28] text-xs">
                      <div className="font-black text-cyan-200 font-mono text-xs">{g.palpite}</div>
                      {g.capitao && (
                        <div className="text-[10px] text-slate-300 mt-0.5 flex items-center justify-between">
                          <span>Capitão: <strong className="text-white">{g.capitao}</strong></span>
                          {g.gols_capitao !== undefined && g.gols_capitao > 0 && (
                            <span className="text-amber-300 font-bold">({g.gols_capitao} gol(s))</span>
                          )}
                        </div>
                      )}
                      {g.avaliado ? (
                        <div className="mt-1 text-[9px] font-black text-emerald-400 font-mono flex items-center gap-1">
                          <Check className="w-3 h-3" /> Avaliado (+{g.pontos_concedidos || 0} pts)
                        </div>
                      ) : (
                        <div className="mt-1 text-[9px] font-bold text-slate-500 font-mono">
                          Pendente
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
