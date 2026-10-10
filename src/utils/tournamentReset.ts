import { collection, getDocs, updateDoc, doc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getNextTuesday13h } from './dateUtils';

export const TOTAL_RODADAS = 50;
export const TOURNAMENT_VERSION = 'campeonato_50_rodadas_2026';

export const INITIAL_PARTICIPANTS_SCORES = [
  { id: 'everton', nome: 'Everton', pontos: 58, acertos_placar: 1 },
  { id: 'marcelo', nome: 'Marcelo', pontos: 52, acertos_placar: 4 },
  { id: 'rafael', nome: 'Rafael', pontos: 52, acertos_placar: 2 },
  { id: 'jardel', nome: 'Jardel', pontos: 50, acertos_placar: 2 },
  { id: 'franz', nome: 'Franz', pontos: 49, acertos_placar: 2 },
  { id: 'lele', nome: 'Lele', pontos: 49, acertos_placar: 2 },
  { id: 'hugo', nome: 'Hugo', pontos: 49, acertos_placar: 1 },
];

export async function resetTournamentToNewChampionship(): Promise<void> {
  console.log(`Iniciando configuração do Novo Campeonato com ${TOTAL_RODADAS} rodadas e pontuações iniciais oficiais...`);

  // 1. Configurar pontuação inicial oficial de todos os participantes
  try {
    for (const p of INITIAL_PARTICIPANTS_SCORES) {
      await setDoc(doc(db, 'participantes', p.id), {
        nome: p.nome,
        pontos: p.pontos,
        acertos_placar: p.acertos_placar
      }, { merge: true });
    }
  } catch (err) {
    console.warn("Erro ao configurar participantes iniciais:", err);
  }

  // 2. Limpar logs antigos de pontuação
  try {
    const scoreSnap = await getDocs(collection(db, 'pontuacoes'));
    const scoreDeletes = scoreSnap.docs.map(sDoc => 
      deleteDoc(doc(db, 'pontuacoes', sDoc.id))
    );
    await Promise.all(scoreDeletes);
  } catch (err) {
    console.warn("Erro ao limpar pontuações:", err);
  }

  // 3. Limpar palpites antigos
  try {
    const guessSnap = await getDocs(collection(db, 'palpites'));
    const guessDeletes = guessSnap.docs.map(gDoc => 
      deleteDoc(doc(db, 'palpites', gDoc.id))
    );
    await Promise.all(guessDeletes);
  } catch (err) {
    console.warn("Erro ao limpar palpites:", err);
  }

  // 4. Limpar rodadas antigas e recriar as 50 rodadas oficiais
  try {
    const roundSnap = await getDocs(collection(db, 'rodadas'));
    const roundDeletes = roundSnap.docs.map(rDoc => 
      deleteDoc(doc(db, 'rodadas', rDoc.id))
    );
    await Promise.all(roundDeletes);
  } catch (err) {
    console.warn("Erro ao limpar rodadas:", err);
  }

  // 5. Limpar resultados oficiais antigos
  try {
    const resultsSnap = await getDocs(collection(db, 'resultados_oficiais'));
    const resDeletes = resultsSnap.docs.map(rDoc => deleteDoc(doc(db, 'resultados_oficiais', rDoc.id)));
    await Promise.all(resDeletes);
  } catch (e) {
    // collection may not exist yet
  }

  // Data atual de início (hoje)
  const now = new Date();
  const startISO = now.toISOString();

  // Fechamento da Rodada 1: SEMPRE na terça-feira às 13:00!
  const round1Deadline = getNextTuesday13h(now);

  // Criar Rodada 1 (Aberta imediatamente a partir de agora)
  await setDoc(doc(db, 'rodadas', 'round-1'), {
    nome: 'Rodada 1',
    abertura: startISO,
    fechamento: round1Deadline.toISOString(),
    status: 'aberta'
  });

  // Criar Rodadas 2 a 50 (total de 50 rodadas)
  // Cada rodada subsequente tem seu fechamento planejado para a terça-feira seguinte às 13:00
  let previousClosing = new Date(round1Deadline);
  for (let i = 2; i <= TOTAL_RODADAS; i++) {
    const nextClosing = new Date(previousClosing.getTime() + 7 * 24 * 60 * 60 * 1000);
    // Garantir que a hora é 13:00:00
    nextClosing.setHours(13, 0, 0, 0);

    await setDoc(doc(db, 'rodadas', `round-${i}`), {
      nome: `Rodada ${i}`,
      abertura: previousClosing.toISOString(),
      fechamento: nextClosing.toISOString(),
      status: 'encerrada' // Mercado fechado até o administrador atualizar os placares da rodada anterior
    });

    previousClosing = nextClosing;
  }

  // Registrar marcador de sistema
  await setDoc(doc(db, 'sistema', 'config'), {
    campeonato_ativo: TOURNAMENT_VERSION,
    data_inicio: startISO,
    total_rodadas: TOTAL_RODADAS,
    regra_fechamento: 'terca_13h',
    versao: '3.0'
  });

  // Limpar caches locais do navegador
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('palpites_count_') || key.startsWith('copapalpites_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (err) {
    console.warn("Storage reset warning:", err);
  }

  console.log(`Campeonato configurado com sucesso! Total de ${TOTAL_RODADAS} rodadas geradas com fechamento às terças 13h.`);
}

export async function checkAndEnsureNewTournament(): Promise<boolean> {
  try {
    const configDoc = await getDoc(doc(db, 'sistema', 'config'));
    if (!configDoc.exists() || configDoc.data()?.campeonato_ativo !== TOURNAMENT_VERSION) {
      await resetTournamentToNewChampionship();
      return true;
    }
    return false;
  } catch (err) {
    console.error("Erro ao verificar novo campeonato:", err);
    return false;
  }
}
