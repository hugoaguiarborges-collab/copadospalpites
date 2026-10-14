import { collection, getDocs, updateDoc, doc, deleteDoc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { getNextTuesday13h, getNextWednesday13h } from './dateUtils';
import { REAL_UCL_FIXTURES } from '../constants/uclFixtures';

export const TOTAL_RODADAS = 50;
export const TOURNAMENT_VERSION = 'campeonato_50_rodadas_2026_v10';

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
  console.log(`Configurando Novo Campeonato com partidas reais da Champions League via lote atômico...`);

  const now = new Date();
  const startISO = now.toISOString();

  // Fechamento de quarta-feira às 13:00 (HOJE para a Rodada 1 de quarta-feira)
  const wednesdayTodayDeadline = getNextWednesday13h(now);
  // Fechamento da próxima terça-feira às 13:00
  const nextTuesdayDeadline = getNextTuesday13h(now);

  const batch = writeBatch(db);

  // 1. Configurar participantes no lote com pontuações oficiais
  for (const p of INITIAL_PARTICIPANTS_SCORES) {
    batch.set(doc(db, 'participantes', p.id), {
      nome: p.nome,
      pontos: p.pontos,
      acertos_placar: p.acertos_placar
    }, { merge: true });
  }

  // 2. Rodada 1 (Terça-feira) - Ontem, já apurada
  batch.set(doc(db, 'rodadas', 'round-1-terca'), {
    nome: 'Rodada 1 (Terça-feira)',
    data_jogos: '20/10',
    jogos_disponiveis: REAL_UCL_FIXTURES['20/10'],
    abertura: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    fechamento: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    status: 'encerrada',
    apurada: true
  });

  // 3. Rodada 1 (Quarta-feira) - HOJE! Aberta, fecha hoje quarta-feira às 13:00!
  batch.set(doc(db, 'rodadas', 'round-1-quarta'), {
    nome: 'Rodada 1 (Quarta-feira)',
    data_jogos: '21/10',
    jogos_disponiveis: REAL_UCL_FIXTURES['21/10'],
    abertura: startISO,
    fechamento: wednesdayTodayDeadline.toISOString(),
    status: 'aberta',
    apurada: false
  });

  // Também manter round-1 sincronizado como Rodada 1 (Quarta-feira) para máxima compatibilidade
  batch.set(doc(db, 'rodadas', 'round-1'), {
    nome: 'Rodada 1 (Quarta-feira)',
    data_jogos: '21/10',
    jogos_disponiveis: REAL_UCL_FIXTURES['21/10'],
    abertura: startISO,
    fechamento: wednesdayTodayDeadline.toISOString(),
    status: 'aberta',
    apurada: false
  });

  // 4. Rodada 2 (Terça e Quarta da semana que vem)
  batch.set(doc(db, 'rodadas', 'round-2-terca'), {
    nome: 'Rodada 2 (Terça-feira)',
    data_jogos: '20/10',
    jogos_disponiveis: REAL_UCL_FIXTURES['20/10'],
    abertura: wednesdayTodayDeadline.toISOString(),
    fechamento: nextTuesdayDeadline.toISOString(),
    status: 'encerrada',
    apurada: false
  });

  const nextWedAfterTue = new Date(nextTuesdayDeadline.getTime() + 24 * 60 * 60 * 1000);
  nextWedAfterTue.setHours(13, 0, 0, 0);

  batch.set(doc(db, 'rodadas', 'round-2-quarta'), {
    nome: 'Rodada 2 (Quarta-feira)',
    data_jogos: '21/10',
    jogos_disponiveis: REAL_UCL_FIXTURES['21/10'],
    abertura: nextTuesdayDeadline.toISOString(),
    fechamento: nextWedAfterTue.toISOString(),
    status: 'encerrada',
    apurada: false
  });

  // 5. Rodadas subsequentes (3 a 20)
  for (let i = 3; i <= 20; i++) {
    batch.set(doc(db, 'rodadas', `round-${i}-terca`), {
      nome: `Rodada ${i} (Terça-feira)`,
      data_jogos: '20/10',
      jogos_disponiveis: REAL_UCL_FIXTURES['20/10'],
      abertura: nextTuesdayDeadline.toISOString(),
      fechamento: nextTuesdayDeadline.toISOString(),
      status: 'encerrada',
      apurada: false
    });
    batch.set(doc(db, 'rodadas', `round-${i}-quarta`), {
      nome: `Rodada ${i} (Quarta-feira)`,
      data_jogos: '21/10',
      jogos_disponiveis: REAL_UCL_FIXTURES['21/10'],
      abertura: nextWedAfterTue.toISOString(),
      fechamento: nextWedAfterTue.toISOString(),
      status: 'encerrada',
      apurada: false
    });
  }

  // 6. Configuração do sistema
  batch.set(doc(db, 'sistema', 'config'), {
    campeonato_ativo: TOURNAMENT_VERSION,
    data_inicio: startISO,
    total_rodadas: TOTAL_RODADAS,
    regra_fechamento: 'terca_e_quarta_13h',
    versao: '10.0'
  });

  // Gravar tudo em UMA ÚNICA chamada de rede atômica super rápida
  await batch.commit();

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
  } catch {}

  console.log('Campeonato configurado com sucesso! Rodada 1 de Quarta-feira ativa com fechamento hoje às 13:00!');
}

export async function checkAndEnsureNewTournament(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<boolean>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout na checagem de campeonato')), 3000)
    );

    const checkPromise = (async () => {
      const configDoc = await getDoc(doc(db, 'sistema', 'config'));
      if (!configDoc.exists() || configDoc.data()?.campeonato_ativo !== TOURNAMENT_VERSION) {
        await resetTournamentToNewChampionship();
        return true;
      }
      return false;
    })();

    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (err) {
    console.warn("Verificação rápida do campeonato concluída (segurança):", err);
    return false;
  }
}
