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
  setDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada, Palpite, Participante, JogoResultadoOficial } from '../types';
import { TEAMS_LIST } from '../constants/teams';
import { evaluateGuessAgainstResult } from '../utils/scoreCalculator';
import { getNextTuesday13h, formatDateTimeDisplay, getRoundNumber } from '../utils/dateUtils';
import TabelaParticipacao from './TabelaParticipacao';
import { 
  Check, 
  ShieldAlert, 
  Award, 
  ChevronDown, 
  CheckCircle2, 
  Zap, 
  Plus, 
  Trash2, 
  Sparkles,
  RotateCcw,
  Users,
  Trophy,
  Lock,
  Unlock
} from 'lucide-react';

const SCORE_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

interface MatchResultInput {
  timeMandante: string;
  golsMandante: string;
  golsVisitante: string;
  timeVisitante: string;
  artilheiros: { jogador: string; gols: number }[];
}

export default function AdminResults() {
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [guesses, setGuesses] = useState<Palpite[]>([]);
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState<Participante[]>([]);

  // List of Official Matches to evaluate in this round
  const [officialMatches, setOfficialMatches] = useState<MatchResultInput[]>([
    { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', artilheiros: [] }
  ]);

  const [scorerInput, setScorerInput] = useState<{ matchIndex: number; jogador: string; gols: number }>({
    matchIndex: 0,
    jogador: '',
    gols: 1
  });

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
        console.error(err);
      }
    }
    loadData();
  }, []);

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

      // Check if this round already has official matches registered
      const targetR = rounds.find(r => r.id === selectedRoundId);
      if (targetR?.jogos_oficiais && targetR.jogos_oficiais.length > 0) {
        setOfficialMatches(targetR.jogos_oficiais.map(jo => ({
          timeMandante: jo.time_mandante,
          timeVisitante: jo.time_visitante,
          golsMandante: String(jo.gols_mandante),
          golsVisitante: String(jo.gols_visitante),
          artilheiros: jo.gols_jogadores || []
        })));
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
              golsVisitante: String(data.gols_visitante ?? ''),
              artilheiros: data.artilheiros || data.gols_jogadores || []
            });
          });
          if (loaded.length > 0) {
            setOfficialMatches(loaded);
          }
        }
      }
    } catch (err) {
      console.error("Error loading guesses in AdminResults:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGuessesForSelectedRound();
    setSuccessMsg('');
    setErrorMsg('');
  }, [selectedRoundId]);

  // Handlers for official matches input
  const handleMatchInputChange = (index: number, field: keyof MatchResultInput, value: any) => {
    setOfficialMatches(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddOfficialMatch = () => {
    setOfficialMatches(prev => [
      ...prev,
      { timeMandante: '', golsMandante: '', golsVisitante: '', timeVisitante: '', artilheiros: [] }
    ]);
  };

  const handleRemoveOfficialMatch = (index: number) => {
    if (officialMatches.length <= 1) return;
    setOfficialMatches(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddScorer = (matchIndex: number) => {
    if (!scorerInput.jogador.trim()) return;
    setOfficialMatches(prev => {
      const updated = [...prev];
      const currentArtilheiros = updated[matchIndex].artilheiros || [];
      updated[matchIndex] = {
        ...updated[matchIndex],
        artilheiros: [...currentArtilheiros, { jogador: scorerInput.jogador.trim(), gols: scorerInput.gols }]
      };
      return updated;
    });
    setScorerInput({ matchIndex, jogador: '', gols: 1 });
  };

  const handleRemoveScorer = (matchIndex: number, scorerIdx: number) => {
    setOfficialMatches(prev => {
      const updated = [...prev];
      updated[matchIndex] = {
        ...updated[matchIndex],
        artilheiros: updated[matchIndex].artilheiros.filter((_, idx) => idx !== scorerIdx)
      };
      return updated;
    });
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

  interface ParticipantEvalSummary {
    participante: string;
    totalPontos: number;
    detalhes: {
      jogo: string;
      palpiteTexto: string;
      resultadoReal: string;
      pontos: number;
      motivo: string;
      guessId: string;
      acertouResultado?: boolean;
      acertouPlacar?: boolean;
      pontosResultado?: number;
      pontosPlacar?: number;
      pontosCapitao?: number;
      golsCapitao?: number;
    }[];
  }

  const evaluationPreview: ParticipantEvalSummary[] = [];

  if (validOfficialGames.length > 0) {
    for (const [pName, pGuesses] of Object.entries(validGuessesByParticipant)) {
      let userTotal = 0;
      const userDetails: ParticipantEvalSummary['detalhes'] = [];

      for (const realGame of validOfficialGames) {
        const gameObj: JogoResultadoOficial = {
          time_mandante: realGame.timeMandante,
          gols_mandante: parseInt(realGame.golsMandante, 10),
          time_visitante: realGame.timeVisitante,
          gols_visitante: parseInt(realGame.golsVisitante, 10),
          gols_jogadores: realGame.artilheiros
        };

        const realResultText = `${realGame.timeMandante} ${realGame.golsMandante} x ${realGame.golsVisitante} ${realGame.timeVisitante}`;

        // Find matching guess from this participant
        for (const guess of pGuesses) {
          const evalRes = evaluateGuessAgainstResult(guess, gameObj);
          if (evalRes.matchFound) {
            userTotal += evalRes.pontos;
            userDetails.push({
              jogo: `${realGame.timeMandante} x ${realGame.timeVisitante}`,
              palpiteTexto: guess.palpite + (guess.capitao ? ` (Capitão: ${guess.capitao})` : ''),
              resultadoReal: realResultText,
              pontos: evalRes.pontos,
              motivo: evalRes.motivo,
              acertouResultado: evalRes.acertouResultado,
              acertouPlacar: evalRes.acertouPlacar,
              pontosResultado: evalRes.pontosResultado,
              pontosPlacar: evalRes.pontosPlacar,
              pontosCapitao: evalRes.pontosCapitao,
              golsCapitao: evalRes.golsCapitao,
              guessId: guess.id
            });
          }
        }
      }

      if (userDetails.length > 0) {
        evaluationPreview.push({
          participante: pName,
          totalPontos: userTotal,
          detalhes: userDetails
        });
      }
    }
  }

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

        if (matchingParticipant && evalItem.totalPontos > 0) {
          // 1. Update participant total points
          await updateDoc(doc(db, 'participantes', matchingParticipant.id), {
            pontos: increment(evalItem.totalPontos)
          });

          // 2. Add score log
          const descr = evalItem.detalhes
            .map(d => `${d.jogo}: [${d.palpiteTexto}] -> ${d.resultadoReal} (+${d.pontos} pts: ${d.motivo})`)
            .join(' | ');

          await addDoc(collection(db, 'pontuacoes'), {
            participante: matchingParticipant.nome,
            pontos: evalItem.totalPontos,
            motivo: `Apuração Automática • ${roundName} • ${descr}`,
            data_hora: nowISO
          });

          participantsUpdatedCount++;
        }

        // 3. Mark guess documents as evaluated with full itemized breakdown
        for (const detail of evalItem.detalhes) {
          if (detail.guessId) {
            await updateDoc(doc(db, 'palpites', detail.guessId), {
              avaliado: true,
              pontos_concedidos: detail.pontos,
              motivo_detalhado: detail.motivo,
              acertou_resultado: detail.acertouResultado,
              acertou_placar: detail.acertouPlacar,
              gols_capitao: detail.golsCapitao,
              resultado_oficial: detail.resultadoReal,
              jogo_oficial: detail.jogo
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
          gols_jogadores: og.artilheiros || []
        };
        jogosOficiaisList.push(gameData);

        await setDoc(doc(db, 'resultados_oficiais', resId), {
          rodada_id: selectedRoundId,
          rodada_nome: roundName,
          ...gameData,
          artilheiros: og.artilheiros || [],
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
        // Na rodada de teste, quando atualiza placares, o mercado da rodada de teste reabre automaticamente para novos testes
        const testClose = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);
        await updateDoc(doc(db, 'rodadas', selectedRoundId), {
          status: 'aberta',
          fechamento: testClose.toISOString()
        });
        nextRoundMsg = ` Placares atualizados e o mercado da Rodada de Teste foi REABERTO AUTOMATICAMENTE para novos palpites e simulações!`;
      } else {
        const currentRoundNum = getRoundNumber(roundName || selectedRoundId);
        const nextRound = rounds.find(r => !r.is_test && r.id !== 'rodada-teste' && getRoundNumber(r.nome || r.id) === currentRoundNum + 1);

        if (nextRound) {
          const nextClosing = getNextTuesday13h(new Date());
          await updateDoc(doc(db, 'rodadas', nextRound.id), {
            status: 'aberta',
            abertura: nowISO,
            fechamento: nextClosing.toISOString()
          });
          nextRoundMsg = ` A ${roundName} foi encerrada e o mercado da ${nextRound.nome} foi ABERTO AUTOMATICAMENTE! O fechamento da nova rodada será na terça-feira às 13:00 (${formatDateTimeDisplay(nextClosing.toISOString())}).`;
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
        `Apuração Automática concluída com sucesso! ${participantsUpdatedCount} participante(s) receberam pontos calculados.${nextRoundMsg}`
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
    const nextClosing = getNextTuesday13h(now);
    try {
      await updateDoc(doc(db, 'rodadas', selectedRoundId), {
        status: 'aberta',
        abertura: now.toISOString(),
        fechamento: nextClosing.toISOString()
      });
      setSuccessMsg(`Mercado da rodada aberto com sucesso! Fechamento na terça-feira às 13:00 (${formatDateTimeDisplay(nextClosing.toISOString())}).`);
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
      {/* Title */}
      <div className="border-b border-neutral-100 pb-3">
        <h3 className="text-xl font-black font-display text-neutral-800 uppercase flex items-center gap-2">
          <span className="w-2.5 h-5 bg-[#009739] block rounded-xs"></span>
          Lançamento e Atualização Automática de Resultados
        </h3>
        <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider mt-0.5">
          Informe o resultado real nas caixinhas e o sistema atualizará automaticamente todos os participantes!
        </p>
      </div>

      {/* Select Round Selector and Market Status */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="select-round-assess" className="text-xs font-black text-neutral-600 uppercase tracking-wider shrink-0">
            Rodada:
          </label>
          <select
            id="select-round-assess"
            value={selectedRoundId}
            onChange={(e) => setSelectedRoundId(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739] cursor-pointer min-w-[220px]"
          >
            <option value="">-- Selecione a Rodada --</option>
            {rounds.map(r => {
              const isTest = r.is_test || r.id === 'rodada-teste';
              return (
                <option key={r.id} value={r.id}>
                  {isTest ? '🧪 [TESTE] ' : ''}{r.nome} ({r.status === 'aberta' ? 'Mercado Aberto' : 'Mercado Fechado'})
                </option>
              );
            })}
          </select>
        </div>

        {targetSelectedRound && (
          <div className="flex flex-wrap items-center gap-2.5">
            {targetSelectedRound.status === 'aberta' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                MERCADO ABERTO • Fechamento: {formatDateTimeDisplay(targetSelectedRound.fechamento)} (Terça 13h)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                <Lock className="w-3.5 h-3.5" />
                MERCADO FECHADO
              </span>
            )}

            {targetSelectedRound.status === 'encerrada' ? (
              <button
                type="button"
                onClick={handleOpenMarketNow}
                className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Abre o mercado agora com fechamento na próxima terça-feira às 13:00"
              >
                <Unlock className="w-3.5 h-3.5" /> Abrir Mercado Desta Rodada
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCloseMarketNow}
                className="px-3 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Fecha o mercado antecipadamente"
              >
                <Lock className="w-3.5 h-3.5" /> Fechar Mercado Agora
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs: Apuração Automática vs Tabela de Participação */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-1">
        <button
          onClick={() => setActiveAdminTab('apuracao')}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
            activeAdminTab === 'apuracao'
              ? 'bg-[#009739] text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <Zap className="w-4 h-4" /> 1. Lançar Placares & Apuração Automática
        </button>
        <button
          onClick={() => setActiveAdminTab('participacao')}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
            activeAdminTab === 'participacao'
              ? 'bg-[#009739] text-white shadow-xs'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          <Users className="w-4 h-4" /> 2. Tabela de Participação (Quem Palpitou vs Quem Não Palpitou)
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2.5 font-bold animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2.5 font-bold animate-fadeIn">
          <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
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
        <div className="p-8 text-center text-sm text-neutral-400 bg-white border border-neutral-200 rounded-2xl">
          Selecione uma rodada para visualizar a tabela de participação.
        </div>
      ) : null}

      {activeAdminTab === 'apuracao' && (
        <>

      {/* Official Matches Input Card */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div>
            <h4 className="text-sm font-black text-neutral-800 uppercase tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#009739]" />
              Resultados Reais dos Jogos
            </h4>
            <p className="text-[11px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">
              Selecione os times e informe os placares finais dos jogos ocorridos.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddOfficialMatch}
            className="text-xs font-bold text-[#009739] hover:text-[#007a2e] flex items-center gap-1 cursor-pointer transition-colors bg-green-50 px-3 py-1.5 rounded-lg border border-green-200"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar Outro Jogo
          </button>
        </div>

        {/* Matches Rows */}
        <div className="space-y-4">
          {officialMatches.map((match, idx) => (
            <div key={idx} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-neutral-600 font-mono">
                  Jogo Real {idx + 1}
                </span>
                {officialMatches.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOfficialMatch(idx)}
                    className="p-1 text-neutral-400 hover:text-rose-500 transition-colors"
                    title="Remover jogo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Match Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                {/* Home Team */}
                <div className="sm:col-span-4">
                  <label className="block text-[9px] font-black uppercase text-neutral-400 mb-1">Time Mandante</label>
                  <select
                    value={match.timeMandante}
                    onChange={(e) => handleMatchInputChange(idx, 'timeMandante', e.target.value)}
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739]"
                  >
                    <option value="">-- Time Mandante --</option>
                    {TEAMS_LIST.map((team) => (
                      <option key={team} value={team} disabled={team === match.timeVisitante}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Home Goals */}
                <div className="sm:col-span-2">
                  <label className="block text-[9px] font-black uppercase text-neutral-400 mb-1 text-center">Placar</label>
                  <select
                    value={match.golsMandante}
                    onChange={(e) => handleMatchInputChange(idx, 'golsMandante', e.target.value)}
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-black text-center text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739] font-mono"
                  >
                    <option value="">-</option>
                    {SCORE_OPTIONS.map((score) => (
                      <option key={score} value={score}>{score}</option>
                    ))}
                  </select>
                </div>

                {/* X */}
                <div className="hidden sm:flex sm:col-span-1 justify-center items-center font-black text-neutral-300 text-sm pt-4">
                  x
                </div>

                {/* Away Goals */}
                <div className="sm:col-span-2">
                  <label className="block text-[9px] font-black uppercase text-neutral-400 mb-1 text-center">Placar</label>
                  <select
                    value={match.golsVisitante}
                    onChange={(e) => handleMatchInputChange(idx, 'golsVisitante', e.target.value)}
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-black text-center text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739] font-mono"
                  >
                    <option value="">-</option>
                    {SCORE_OPTIONS.map((score) => (
                      <option key={score} value={score}>{score}</option>
                    ))}
                  </select>
                </div>

                {/* Away Team */}
                <div className="sm:col-span-3">
                  <label className="block text-[9px] font-black uppercase text-neutral-400 mb-1">Time Visitante</label>
                  <select
                    value={match.timeVisitante}
                    onChange={(e) => handleMatchInputChange(idx, 'timeVisitante', e.target.value)}
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739]"
                  >
                    <option value="">-- Time Visitante --</option>
                    {TEAMS_LIST.map((team) => (
                      <option key={team} value={team} disabled={team === match.timeMandante}>
                        {team}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Scorers / Captain Bonus Setup */}
              <div className="pt-2 border-t border-neutral-200/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                    Marcadores de Gols (Bônus de Capitão: +1 pt por gol marcado):
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {match.artilheiros.map((art, aIdx) => (
                    <span 
                      key={aIdx} 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 text-green-800 rounded-full text-xs font-bold"
                    >
                      ⚽ {art.jogador} ({art.gols} gol{art.gols > 1 ? 's' : ''})
                      <button 
                        type="button" 
                        onClick={() => handleRemoveScorer(idx, aIdx)}
                        className="text-green-600 hover:text-rose-600 font-bold ml-1"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {match.artilheiros.length === 0 && (
                    <span className="text-[11px] text-neutral-400 italic">Nenhum marcador adicionado ainda.</span>
                  )}
                </div>

                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    placeholder="Nome do jogador que fez gol..."
                    value={scorerInput.matchIndex === idx ? scorerInput.jogador : ''}
                    onChange={(e) => setScorerInput({ matchIndex: idx, jogador: e.target.value, gols: scorerInput.gols })}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs text-neutral-800 focus:outline-hidden w-full font-medium"
                  />
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={scorerInput.matchIndex === idx ? scorerInput.gols : 1}
                    onChange={(e) => setScorerInput({ matchIndex: idx, jogador: scorerInput.jogador, gols: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-16 px-2 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs text-center font-bold font-mono"
                    title="Gols marcados"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddScorer(idx)}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                  >
                    + Gol
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Automatic Evaluation Preview */}
        {validOfficialGames.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-neutral-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h5 className="font-black text-sm text-neutral-800 uppercase tracking-tight flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Prévia de Apuração Automática ({evaluationPreview.length} Participantes)
              </h5>
              <span className="text-[10px] font-mono font-bold bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded">
                Calculado em Tempo Real
              </span>
            </div>

            {evaluationPreview.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-neutral-200 font-bold">
                Nenhum palpite enviado nesta rodada coincide com os times dos jogos oficiais preenchidos acima.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left font-sans border-collapse text-xs">
                  <thead>
                    <tr className="bg-neutral-50/70 border-b border-neutral-200 text-[10px] font-black uppercase text-neutral-500">
                      <th className="px-4 py-2.5">Participante</th>
                      <th className="px-4 py-2.5">Palpite no Jogo</th>
                      <th className="px-4 py-2.5">Resultado Oficial</th>
                      <th className="px-4 py-2.5">Classificação / Motivo</th>
                      <th className="px-4 py-2.5 text-right">Pontos a Creditar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {evaluationPreview.map((item) => (
                      <React.Fragment key={item.participante}>
                        {item.detalhes.map((det, dIdx) => (
                          <tr key={`${item.participante}-${dIdx}`} className="hover:bg-neutral-50/50">
                            {dIdx === 0 && (
                              <td 
                                rowSpan={item.detalhes.length} 
                                className="px-4 py-2.5 font-bold text-neutral-800 align-top border-r border-neutral-100 bg-neutral-50/20"
                              >
                                {item.participante}
                                <div className="text-[10px] font-mono text-emerald-600 font-bold mt-0.5">
                                  Total Rodada: +{item.totalPontos} pts
                                </div>
                              </td>
                            )}
                            <td className="px-4 py-2.5 font-semibold text-neutral-700 font-mono text-[11px]">
                              {det.palpiteTexto}
                            </td>
                            <td className="px-4 py-2.5 font-bold text-neutral-800 font-mono text-[11px]">
                              {det.resultadoReal}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                                det.pontos >= 5 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : det.pontos > 0 
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                  : 'bg-neutral-100 text-neutral-500'
                              }`}>
                                {det.motivo}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-black text-sm text-[#009739]">
                              +{det.pontos}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Execute Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleExecuteAutomaticScoring}
                disabled={processingAuto || evaluationPreview.length === 0}
                className="w-full sm:w-auto px-6 py-3.5 bg-[#009739] hover:bg-[#007a2e] active:bg-[#005a20] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:bg-neutral-250 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4 fill-white" />
                {processingAuto 
                  ? 'Atualizando Todos os Placares no Banco...' 
                  : 'Lançar e Atualizar Todos os Placares Automaticamente'
                }
              </button>
              <p className="text-[10px] font-mono text-neutral-400 mt-1.5">
                ★ Todos os participantes que acertaram o placar ou o resultado receberão os pontos instantaneamente no ranking geral.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Participants & Guesses Status Explorer */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-black text-neutral-800 uppercase tracking-tight flex items-center gap-2">
              <Users className="w-4 h-4 text-neutral-500" />
              Palpites Registrados na Rodada ({Object.keys(validGuessesByParticipant).length} Participantes)
            </h4>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
              Visualização consolidada de todos os palpites válidos enviados
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400 font-mono">Buscando palpites...</div>
        ) : Object.keys(validGuessesByParticipant).length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-400">
            Nenhum palpite enviado ainda para esta rodada.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {Object.entries(validGuessesByParticipant).map(([participantName, pGuesses]) => (
              <div key={participantName} className="p-4 hover:bg-neutral-50/20 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-neutral-800 text-sm">{participantName}</span>
                  <span className="text-[10px] font-mono text-neutral-400 font-bold">
                    {pGuesses.length} jogo(s) palpitado(s)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pGuesses.map((g, idx) => (
                    <div key={g.id || idx} className="p-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs">
                      <div className="font-black text-neutral-800 font-mono text-xs">{g.palpite}</div>
                      {g.capitao && (
                        <div className="text-[10px] text-neutral-500 mt-0.5">
                          Capitão: <span className="font-bold text-neutral-700">{g.capitao}</span>
                        </div>
                      )}
                      {g.avaliado ? (
                        <div className="mt-1 text-[9px] font-black text-emerald-600 font-mono flex items-center gap-1">
                          <Check className="w-3 h-3" /> Avaliado (+{g.pontos_concedidos || 0} pts)
                        </div>
                      ) : (
                        <div className="mt-1 text-[9px] font-bold text-neutral-400 font-mono">
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
