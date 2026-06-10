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
  increment 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Rodada, Palpite, Participante } from '../types';
import { Check, ShieldAlert, Award, ChevronDown, CheckCircle2 } from 'lucide-react';

export default function AdminResults() {
  const [rounds, setRounds] = useState<Rodada[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [guesses, setGuesses] = useState<Palpite[]>([]);
  const [loading, setLoading] = useState(false);
  const [participants, setParticipants] = useState<Participante[]>([]);

  // Evaluator questionnaire state
  const [activeEvalId, setActiveEvalId] = useState<string | null>(null);
  const [acertouResultado, setAcertouResultado] = useState<boolean | null>(null);
  const [acertouPlacar, setAcertouPlacar] = useState<boolean | null>(null);
  const [acertouCapitao, setAcertouCapitao] = useState<boolean | null>(null);
  const [golsCapitao, setGolsCapitao] = useState<number>(0);

  // Special 4th Option: Houve palpite 0x0
  const [houveZeroZero, setHouveZeroZero] = useState<boolean | null>(null);
  const [zeroZeroComCapitao, setZeroZeroComCapitao] = useState<boolean | null>(null);
  const [zeroZeroAcertouPlacar, setZeroZeroAcertouPlacar] = useState<boolean | null>(null);

  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Load rounds
        const rSnap = await getDocs(collection(db, 'rodadas'));
        const rList: Rodada[] = [];
        const nowISO = new Date().toISOString();
        
        for (const docObj of rSnap.docs) {
          const rId = docObj.id;
          const rData = docObj.data() as Rodada;
          
          if (rData.status === 'aberta' && rData.fechamento <= nowISO && rId !== 'round-teste') {
            try {
              await updateDoc(doc(db, 'rodadas', rId), { status: 'encerrada' });
              rList.push({ id: rId, ...rData, status: 'encerrada' });
            } catch (err) {
              console.error(`Error auto-closing round ${rId} in admin:`, err);
              rList.push({ id: rId, ...rData });
            }
          } else {
            rList.push({ id: rId, ...rData });
          }
        }
        
        // Find closed rounds, but ALWAYS allow the test round (round-teste) to be evaluated/viewed immediately!
        const closed = rList.filter(r => r.status === 'encerrada' || r.id === 'round-teste');
        setRounds(closed);
        if (closed.length > 0) {
          // Sort closed by closing descending
          closed.sort((a,b) => new Date(b.fechamento).getTime() - new Date(a.fechamento).getTime());
          setSelectedRoundId(closed[0].id);
        }

        // Load participants
        const pSnap = await getDocs(collection(db, 'participantes'));
        const pList: Participante[] = [];
        pSnap.forEach((doc) => {
          pList.push({ id: doc.id, ...doc.data() } as Participante);
        });
        setParticipants(pList);
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
  }, []);

  const loadGuessesForSelectedRound = async () => {
    if (!selectedRoundId) return;

    // Security Check: If the selected round is open and not 'round-teste', do not display any guesses to anyone, including admins
    const targetRoundObj = rounds.find(r => r.id === selectedRoundId);
    if (targetRoundObj && targetRoundObj.status === 'aberta' && targetRoundObj.id !== 'round-teste') {
      setGuesses([]);
      return;
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, 'palpites'),
        where('rodada', '==', selectedRoundId),
        orderBy('data_hora_envio', 'asc')
      );
      const snap = await getDocs(q);
      const list: Palpite[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Palpite);
      });

      // Extra check
      if (targetRoundObj && targetRoundObj.status === 'aberta' && targetRoundObj.id !== 'round-teste') {
        setGuesses([]);
      } else {
        setGuesses(list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGuessesForSelectedRound();
    setActiveEvalId(null);
  }, [selectedRoundId]);

  const handleStartEvaluate = (p: Palpite) => {
    setActiveEvalId(p.id);
    setAcertouResultado(null);
    setAcertouPlacar(null);
    setAcertouCapitao(null);
    setGolsCapitao(0);
    setHouveZeroZero(null);
    setZeroZeroComCapitao(null);
    setZeroZeroAcertouPlacar(null);
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleSaveEvaluation = async (p: Palpite) => {
    setErrorMsg('');
    setSuccessMsg('');

    if (acertouResultado === null || acertouPlacar === null || acertouCapitao === null || houveZeroZero === null) {
      setErrorMsg('Por favor, responda todas as perguntas de avaliação.');
      return;
    }

    if (houveZeroZero === true) {
      if (zeroZeroComCapitao === null) {
        setErrorMsg('Por favor, responda se o palpite de 0x0 foi com capitão.');
        return;
      }
      if (zeroZeroAcertouPlacar === null) {
        setErrorMsg('Por favor, responda se o participante acertou o placar de 0x0.');
        return;
      }
    }

    setSubmitting(true);
    try {
      // Calculate scores
      let ptsSum = 0;
      if (houveZeroZero === true && zeroZeroAcertouPlacar === true) {
        if (zeroZeroComCapitao === false) {
          ptsSum = 6;
        } else {
          ptsSum = 5;
        }
      } else {
        if (acertouResultado) ptsSum += 3;
        if (acertouPlacar) ptsSum += 2;
        if (acertouCapitao) {
          ptsSum += golsCapitao; // 1 pt per goal (no extra selection point)
        }
      }

      // Step 1: find participant document
      const matchingP = participants.find(part => part.nome.toLowerCase() === p.participante.toLowerCase());
      if (!matchingP) {
        setErrorMsg('Participante não encontrado na base de dados para atribuição de pontos.');
        setSubmitting(false);
        return;
      }

      // Step 2: update participant's total points
      await updateDoc(doc(db, 'participantes', matchingP.id), {
        pontos: increment(ptsSum)
      });

      // Step 3: log score adjustment in logs collection
      const nowISO = new Date().toISOString();
      const roundDoc = rounds.find(r => r.id === selectedRoundId);
      const roundName = roundDoc ? roundDoc.nome : 'Rodada';

      await addDoc(collection(db, 'pontuacoes'), {
        participante: p.participante,
        pontos: ptsSum,
        motivo: `Avaliação: ${roundName} • Palpite: [${p.palpite}] • Capitão: [${p.capitao || 'Nenhum'}]`,
        data_hora: nowISO
      });

      // Step 4: mark this guess document as evaluated in database!
      // This is a premium touch to lock the graded status of guesses
      await updateDoc(doc(db, 'palpites', p.id), {
        avaliado: true,
        pontos_concedidos: ptsSum
      });

      setSuccessMsg(`Avaliação salva de ${p.participante}. Concedidos +${ptsSum} pontos.`);
      setActiveEvalId(null);
      
      // Reload guesses structure
      loadGuessesForSelectedRound();
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao gravar avaliação no processador.');
    } finally {
      setSubmitting(false);
    }
  };

  // Group guesses of the round by participant, and identify physical batches to find which one is active/valid!
  const groupedGuesses: Record<string, Palpite[]> = guesses.reduce((acc, curr) => {
    if (!acc[curr.participante]) {
      acc[curr.participante] = [];
    }
    acc[curr.participante].push(curr);
    return acc;
  }, {} as Record<string, Palpite[]>);

  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-100 pb-3">
        <h3 className="text-lg font-semibold font-display text-neutral-800">Avaliar e Atualizar Resultados</h3>
        <p className="text-xs text-neutral-400">Classifique os palpites das rodadas encerradas para atualizar automaticamente o ranking.</p>
      </div>

      <div className="flex items-center gap-3 max-w-sm">
        <label htmlFor="select-round-assess" className="text-xs font-semibold text-neutral-600 shrink-0">Selecionar Rodada:</label>
        <select
          id="select-round-assess"
          value={selectedRoundId}
          onChange={(e) => setSelectedRoundId(e.target.value)}
          className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-neutral-800 focus:outline-hidden"
        >
          <option value="">-- Selecione --</option>
          {rounds.map(r => {
            const isClosed = r.status === 'encerrada' || r.fechamento <= new Date().toISOString();
            return (
              <option key={r.id} value={r.id}>
                {r.nome} {isClosed ? '(fechada)' : '(aberta - teste)'}
              </option>
            );
          })}
        </select>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-neutral-400 font-mono">Buscando palpites desta rodada...</div>
      ) : Object.keys(groupedGuesses).length === 0 ? (
        <div className="p-8 text-center text-sm text-neutral-400 bg-white border border-dashed border-neutral-150 rounded-xl">
          Nenhum palpite enviado nesta rodada ou rodada ainda aberta.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedGuesses).map(([participantName, userGuesses]) => {
            // Find valid set (which is the latest batch submission)
            const sorted = [...userGuesses].sort((a,b) => new Date(a.data_hora_envio).getTime() - new Date(b.data_hora_envio).getTime());
            const uploadTimestamps = Array.from(new Set(sorted.map(g => g.data_hora_envio)));
            const latestTimestamp = uploadTimestamps[uploadTimestamps.length - 1];
            
            // Only evaluate guesses belonging to the active set!
            const activeGuesses = sorted.filter(g => g.data_hora_envio === latestTimestamp);

            return (
              <div key={participantName} className="bg-white border border-neutral-150 rounded-xl overflow-hidden shadow-xs">
                {/* Header card */}
                <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-neutral-100 font-bold font-display text-neutral-600 text-xs flex items-center justify-center">
                      {participantName[0]}
                    </span>
                    <span className="font-semibold text-neutral-800 text-sm">{participantName}</span>
                  </div>
                  <span className="text-[9px] font-semibold text-neutral-400 font-mono bg-neutral-100 px-1.5 py-0.5 rounded-sm">
                    {uploadTimestamps.length > 1 ? 'Possui 2 Envios (Validando o 2º)' : 'Envio Único'}
                  </span>
                </div>

                {/* Guesses items list */}
                <div className="divide-y divide-neutral-100">
                  {activeGuesses.map((guess, idx) => {
                    const isEvaluated = (guess as any).avaliado === true;
                    const awardedPts = (guess as any).pontos_concedidos || 0;
                    const isEvaluatingThis = activeEvalId === guess.id;

                    return (
                      <div key={guess.id} className="p-4 text-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-neutral-400 font-mono font-medium block">Previsão {idx + 1}</span>
                            <p className="text-base font-semibold text-neutral-800">
                              {guess.palpite} <span className="text-neutral-400 font-normal">| Capitão:</span> <span className="text-neutral-600/90 font-mono font-medium">{guess.capitao || 'Sem capitão'}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {isEvaluated ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold font-mono text-[10px] border border-emerald-150">
                                <Check className="w-3.5 h-3.5" /> Avaliado (+{awardedPts} pts)
                              </span>
                            ) : (
                              <span className="inline-flex bg-neutral-100 text-neutral-500 font-medium font-mono text-[10px] px-2 py-1 rounded-full">
                                Pendente
                              </span>
                            )}

                            {!isEvaluatingThis && (
                              <button
                                onClick={() => handleStartEvaluate(guess)}
                                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white font-medium rounded-md transition-all cursor-pointer"
                              >
                                {isEvaluated ? 'Reavaliar' : 'Avaliar Palpite'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Evaluator Survey Panel */}
                        {isEvaluatingThis && (
                          <div className="bg-neutral-50 p-5 rounded-lg border border-neutral-200 space-y-4 animate-fadeIn">
                            <h5 className="font-semibold text-neutral-700 pb-2 border-b border-neutral-200 flex items-center gap-1.5">
                              <Award className="w-4 h-4 text-neutral-500" /> Formulário de Avaliação • {guess.palpite}
                            </h5>

                            {/* Q1: Resultado */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1 border-b border-neutral-100">
                              <span className="font-medium text-neutral-750">1. Acertou o resultado (vencedor ou empate)? <span className="text-emerald-600 font-mono font-semibold">(+3 Pts)</span></span>
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setAcertouResultado(true)}
                                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                    acertouResultado === true 
                                      ? 'bg-emerald-600 text-white' 
                                      : 'bg-white border border-neutral-200 text-neutral-700'
                                  }`}
                                >
                                  Sim
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAcertouResultado(false)}
                                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                    acertouResultado === false 
                                      ? 'bg-rose-600 text-white' 
                                      : 'bg-white border border-neutral-200 text-neutral-700'
                                  }`}
                                >
                                  Não
                                </button>
                              </div>
                            </div>

                            {/* Q2: Placar Exato */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1 border-b border-neutral-100">
                              <span className="font-medium text-neutral-750">2. Acertou o placar exato? <span className="text-emerald-600 font-mono font-semibold">(+2 Pts)</span></span>
                              <div className="flex gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setAcertouPlacar(true)}
                                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                    acertouPlacar === true 
                                      ? 'bg-emerald-600 text-white' 
                                      : 'bg-white border border-neutral-200 text-neutral-700'
                                  }`}
                                >
                                  Sim
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAcertouPlacar(false)}
                                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                    acertouPlacar === false 
                                      ? 'bg-rose-600 text-white' 
                                      : 'bg-white border border-neutral-200 text-neutral-700'
                                  }`}
                                >
                                  Não
                                </button>
                              </div>
                            </div>

                            {/* Q3: Capitão */}
                            <div className="py-2 border-b border-neutral-100 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="font-medium text-neutral-750">3. O capitão ({guess.capitao || 'Nenhum'}) fez gol(s)? <span className="text-emerald-600 font-mono font-semibold">(+1 Pt por gol)</span></span>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setAcertouCapitao(true)}
                                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                      acertouCapitao === true 
                                        ? 'bg-emerald-600 text-white' 
                                        : 'bg-white border border-neutral-200 text-neutral-700'
                                    }`}
                                  >
                                    Sim
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAcertouCapitao(false)}
                                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                      acertouCapitao === false 
                                        ? 'bg-rose-600 text-white' 
                                        : 'bg-white border border-neutral-200 text-neutral-700'
                                    }`}
                                  >
                                    Não
                                  </button>
                                </div>
                              </div>

                              {acertouCapitao && (
                                <div className="flex items-center gap-3 bg-white p-3 rounded-md border border-neutral-200 mt-2">
                                  <label htmlFor="cap-gols-num animate-slideDown" className="font-semibold text-neutral-600 font-sans">
                                    Quantos gols o capitão marcou?
                                  </label>
                                  <input
                                    id="cap-gols-num"
                                    type="number"
                                    min="0"
                                    value={golsCapitao}
                                    onChange={(e) => setGolsCapitao(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                    className="w-16 px-2 py-1 border border-neutral-300 rounded text-center text-neutral-800 focus:outline-hidden font-mono"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Q4: Houve palpite 0x0 */}
                            <div className="py-2 border-b border-neutral-100 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="font-medium text-neutral-750">
                                  4. Houve palpite 0x0?
                                </span>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHouveZeroZero(true);
                                    }}
                                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                      houveZeroZero === true 
                                        ? 'bg-emerald-600 text-white' 
                                        : 'bg-white border border-neutral-200 text-neutral-700'
                                    }`}
                                  >
                                    Sim
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setHouveZeroZero(false);
                                      setZeroZeroComCapitao(null);
                                      setZeroZeroAcertouPlacar(null);
                                    }}
                                    className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                      houveZeroZero === false 
                                        ? 'bg-rose-600 text-white' 
                                        : 'bg-white border border-neutral-200 text-neutral-700'
                                    }`}
                                  >
                                    Não
                                  </button>
                                </div>
                              </div>

                              {houveZeroZero === true && (
                                <div className="space-y-3 pl-4 border-l-2 border-neutral-200 mt-2 bg-neutral-100/50 p-2.5 rounded-lg">
                                  {/* Sub-question: com capitão? */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1">
                                    <span className="font-medium text-neutral-600">Com capitão?</span>
                                    <div className="flex gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setZeroZeroComCapitao(true);
                                          setZeroZeroAcertouPlacar(null);
                                        }}
                                        className={`px-3 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                                          zeroZeroComCapitao === true 
                                            ? 'bg-emerald-600 text-white' 
                                            : 'bg-white border border-neutral-200 text-neutral-700'
                                        }`}
                                      >
                                        Sim
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setZeroZeroComCapitao(false);
                                          setZeroZeroAcertouPlacar(null);
                                        }}
                                        className={`px-3 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                                          zeroZeroComCapitao === false 
                                            ? 'bg-rose-600 text-white' 
                                            : 'bg-white border border-neutral-200 text-neutral-700'
                                        }`}
                                      >
                                        Não
                                      </button>
                                    </div>
                                  </div>

                                  {/* Sub-question: acertou o placar? Only if com capitão is answered (true/false) */}
                                  {zeroZeroComCapitao !== null && (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1 animate-fadeIn">
                                      <span className="font-medium text-neutral-600">
                                        Acertou o placar (0-0)?{' '}
                                        <span className="text-emerald-600 font-mono font-semibold">
                                          {zeroZeroComCapitao ? '(+5 Pts se sim)' : '(+6 Pts se sim)'}
                                        </span>
                                      </span>
                                      <div className="flex gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => setZeroZeroAcertouPlacar(true)}
                                          className={`px-3 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                                            zeroZeroAcertouPlacar === true 
                                              ? 'bg-emerald-600 text-white' 
                                              : 'bg-white border border-neutral-200 text-neutral-700'
                                          }`}
                                        >
                                          Sim
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setZeroZeroAcertouPlacar(false)}
                                          className={`px-3 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                                            zeroZeroAcertouPlacar === false 
                                              ? 'bg-rose-600 text-white' 
                                              : 'bg-white border border-neutral-200 text-neutral-700'
                                          }`}
                                        >
                                          Não
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Submit eval questionnaire */}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveEvaluation(guess)}
                                disabled={submitting}
                                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-md transition-colors cursor-pointer"
                              >
                                {submitting ? 'Gravando...' : 'Finalizar Lançamento'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveEvalId(null)}
                                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-350 text-neutral-700 font-semibold rounded-md transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
