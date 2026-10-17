import { 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Palpite, Rodada, Participante } from '../types';

export interface DeleteRoundCascadeResult {
  success: boolean;
  roundId: string;
  roundName: string;
  deletedPalpitesCount: number;
  deletedOfficialMatchesCount: number;
  deletedScoreLogsCount: number;
  deductedPointsByParticipant: Record<string, number>;
  error?: string;
}

/**
 * Permanently deletes a round along with all its associated guesses (palpites),
 * official results, score change logs (pontuacoes), and reverses all points awarded
 * to participants for this round from the overall leaderboard.
 */
export async function deleteRoundCascade(
  roundId: string, 
  roundName?: string
): Promise<DeleteRoundCascadeResult> {
  if (!roundId) {
    throw new Error('ID da rodada não informado.');
  }

  // 1. Determine all possible identifiers for this round
  const identifiers = Array.from(
    new Set(
      [
        roundId,
        roundName,
        roundId === 'round-1' ? 'round-1-quarta' : null,
        roundId === 'round-1-quarta' ? 'round-1' : null,
        roundId === 'rodada-teste' ? 'Rodada de Teste' : null,
        roundId.startsWith('rodada-') ? 'Rodada de teste' : null
      ].filter(Boolean)
    )
  ) as string[];

  // 2. Fetch all palpites matching any of these round identifiers
  const pSnapAll = await getDocs(collection(db, 'palpites'));
  const matchedPalpites: { id: string; data: Palpite }[] = [];

  pSnapAll.forEach((d) => {
    const data = d.data() as Palpite;
    const gRodada = String(data.rodada || '').trim();
    const gRodadaId = String((data as any).rodada_id || '').trim();

    const matches = identifiers.some(
      (id) => 
        id && (
          gRodada.toLowerCase() === id.toLowerCase() ||
          gRodadaId.toLowerCase() === id.toLowerCase() ||
          (roundName && gRodada.toLowerCase() === roundName.toLowerCase())
        )
    );

    if (matches) {
      matchedPalpites.push({ id: d.id, data });
    }
  });

  // 3. Compute points awarded to each participant from these palpites
  const pointsToDeduct: Record<string, number> = {};

  for (const { data: p } of matchedPalpites) {
    const pts = Number(p.pontos_concedidos || 0);
    const pName = (p.participante || '').trim();
    if (pts > 0 && pName) {
      pointsToDeduct[pName] = (pointsToDeduct[pName] || 0) + pts;
    }
  }

  // 4. Also check score logs in 'pontuacoes' that mention this round
  const pontuacoesSnap = await getDocs(collection(db, 'pontuacoes'));
  const scoreLogsToDelete: string[] = [];

  pontuacoesSnap.forEach((d) => {
    const data = d.data();
    const motivo = String(data.motivo || '').toLowerCase();
    const matchesMotivo = identifiers.some((id) => id && motivo.includes(id.toLowerCase()));

    if (matchesMotivo) {
      scoreLogsToDelete.push(d.id);
      const logParticipant = String(data.participante || '').trim();
      const logPoints = Number(data.pontos || 0);

      // If palpites did not have pontos_concedidos recorded directly, fallback to logs
      if (logPoints > 0 && logParticipant && (!pointsToDeduct[logParticipant] || pointsToDeduct[logParticipant] === 0)) {
        pointsToDeduct[logParticipant] = (pointsToDeduct[logParticipant] || 0) + logPoints;
      }
    }
  });

  // 5. Deduct points from participants in the 'participantes' collection
  const partSnap = await getDocs(collection(db, 'participantes'));
  const participantsList: { id: string; data: Participante }[] = [];
  partSnap.forEach((d) => {
    participantsList.push({ id: d.id, data: { id: d.id, ...d.data() } as Participante });
  });

  for (const [pName, deductAmount] of Object.entries(pointsToDeduct)) {
    if (deductAmount <= 0) continue;

    const targetP = participantsList.find(
      (p) => p.data.nome.trim().toLowerCase() === pName.trim().toLowerCase()
    );

    if (targetP) {
      const currentPoints = Number(targetP.data.pontos || 0);
      const newPoints = Math.max(0, currentPoints - deductAmount);
      await updateDoc(doc(db, 'participantes', targetP.id), {
        pontos: newPoints
      });
    }
  }

  // 6. Delete all matched palpites
  const palpiteDeletePromises = matchedPalpites.map(({ id }) => 
    deleteDoc(doc(db, 'palpites', id))
  );
  await Promise.all(palpiteDeletePromises);

  // 7. Delete all matched score logs
  const scoreLogDeletePromises = scoreLogsToDelete.map((id) => 
    deleteDoc(doc(db, 'pontuacoes', id))
  );
  await Promise.all(scoreLogDeletePromises);

  // 8. Delete official results for this round
  const ofSnapAll = await getDocs(collection(db, 'resultados_oficiais'));
  const ofDeletes: Promise<void>[] = [];
  let ofCount = 0;

  ofSnapAll.forEach((d) => {
    const data = d.data();
    const rId = String(data.rodada_id || '').trim();
    const rNome = String(data.rodada_nome || '').trim();

    const matches = identifiers.some(
      (id) => 
        id && (
          rId.toLowerCase() === id.toLowerCase() ||
          rNome.toLowerCase() === id.toLowerCase() ||
          d.id.startsWith(id)
        )
    );

    if (matches) {
      ofDeletes.push(deleteDoc(doc(db, 'resultados_oficiais', d.id)));
      ofCount++;
    }
  });
  await Promise.all(ofDeletes);

  // 9. Delete the round document itself
  await deleteDoc(doc(db, 'rodadas', roundId));

  return {
    success: true,
    roundId,
    roundName: roundName || roundId,
    deletedPalpitesCount: matchedPalpites.length,
    deletedOfficialMatchesCount: ofCount,
    deletedScoreLogsCount: scoreLogsToDelete.length,
    deductedPointsByParticipant: pointsToDeduct
  };
}
