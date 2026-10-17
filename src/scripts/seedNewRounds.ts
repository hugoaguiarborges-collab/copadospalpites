import { db } from '../firebase';
import { collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { REAL_UCL_FIXTURES } from '../constants/uclFixtures';

interface NewRoundDef {
  id: string;
  nome: string;
  data_jogos: string;
  abertura: string;
  fechamento: string;
  status: 'aberta' | 'encerrada';
  fixtureKey: string;
}

const NEW_ROUNDS: NewRoundDef[] = [
  {
    id: 'rodada-1-terca',
    nome: 'Rodada 1 (Terça-feira)',
    data_jogos: '20/10/2026',
    abertura: '2026-10-15T00:00:00.000Z',
    fechamento: '2026-10-20T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'aberta',
    fixtureKey: '20/10'
  },
  {
    id: 'rodada-1-quarta',
    nome: 'Rodada 1 (Quarta-feira)',
    data_jogos: '21/10/2026',
    abertura: '2026-10-20T18:00:00.000Z',
    fechamento: '2026-10-21T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '21/10'
  },
  {
    id: 'rodada-2-terca',
    nome: 'Rodada 2 (Terça-feira)',
    data_jogos: '03/11/2026',
    abertura: '2026-10-21T18:00:00.000Z',
    fechamento: '2026-11-03T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '03/11'
  },
  {
    id: 'rodada-2-quarta',
    nome: 'Rodada 2 (Quarta-feira)',
    data_jogos: '04/11/2026',
    abertura: '2026-11-03T18:00:00.000Z',
    fechamento: '2026-11-04T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '04/11'
  },
  {
    id: 'rodada-3-terca',
    nome: 'Rodada 3 (Terça-feira)',
    data_jogos: '24/11/2026',
    abertura: '2026-11-04T18:00:00.000Z',
    fechamento: '2026-11-24T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '24/11'
  },
  {
    id: 'rodada-3-quarta',
    nome: 'Rodada 3 (Quarta-feira)',
    data_jogos: '25/11/2026',
    abertura: '2026-11-24T18:00:00.000Z',
    fechamento: '2026-11-25T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '25/11'
  },
  {
    id: 'rodada-4-terca',
    nome: 'Rodada 4 (Terça-feira)',
    data_jogos: '08/12/2026',
    abertura: '2026-11-25T18:00:00.000Z',
    fechamento: '2026-12-08T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '08/12'
  },
  {
    id: 'rodada-4-quarta',
    nome: 'Rodada 4 (Quarta-feira)',
    data_jogos: '09/12/2026',
    abertura: '2026-12-08T18:00:00.000Z',
    fechamento: '2026-12-09T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '09/12'
  },
  {
    id: 'rodada-5-terca',
    nome: 'Rodada 5 (Terça-feira)',
    data_jogos: '19/01/2027',
    abertura: '2026-12-09T18:00:00.000Z',
    fechamento: '2027-01-19T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '19/01'
  },
  {
    id: 'rodada-5-quarta',
    nome: 'Rodada 5 (Quarta-feira)',
    data_jogos: '20/01/2027',
    abertura: '2027-01-19T18:00:00.000Z',
    fechamento: '2027-01-20T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '20/01'
  },
  {
    id: 'rodada-6-quarta',
    nome: 'Rodada 6 (Quarta-feira)',
    data_jogos: '27/01/2027',
    abertura: '2027-01-20T18:00:00.000Z',
    fechamento: '2027-01-27T16:00:00.000Z', // 13:00 Horário de Brasília
    status: 'encerrada',
    fixtureKey: '27/01'
  }
];

export async function seedNewRounds() {
  console.log('--- INICIANDO MIGRAÇÃO DE RODADAS ---');
  
  // 1. Verificar participantes e garantir que pontos do ranking NÃO SEJAM ALTERADOS
  const pSnap = await getDocs(collection(db, 'participantes'));
  console.log(`Participantes encontrados: ${pSnap.size}`);
  pSnap.forEach(d => {
    console.log(`  - ${d.data().nome}: ${d.data().pontos} pts (MANTIDO INTACTO)`);
  });

  // 2. Apagar rodadas antigas
  const rSnap = await getDocs(collection(db, 'rodadas'));
  console.log(`Apagando ${rSnap.size} rodada(s) antigas...`);
  for (const d of rSnap.docs) {
    console.log(`  Deletando rodada antiga: ${d.id} (${d.data().nome})`);
    await deleteDoc(doc(db, 'rodadas', d.id));
  }
  console.log('Todas as rodadas antigas foram apagadas com sucesso.');

  // 3. Inserir as 11 novas rodadas com suas datas e jogos oficiais
  console.log('Inserindo as 11 novas rodadas oficiais...');
  for (const def of NEW_ROUNDS) {
    const fixtures = REAL_UCL_FIXTURES[def.fixtureKey] || [];
    const roundData = {
      nome: def.nome,
      data_jogos: def.data_jogos,
      abertura: def.abertura,
      fechamento: def.fechamento,
      status: def.status,
      jogos_disponiveis: fixtures,
      jogos_oficiais: [],
      apurada: false
    };

    await setDoc(doc(db, 'rodadas', def.id), roundData);
    console.log(`  ✓ Criada rodada: ${def.id} -> "${def.nome}" | Data: ${def.data_jogos} | Fechamento: ${def.fechamento} (13h BRT) | Status: ${def.status} | Jogos: ${fixtures.length}`);
  }

  // 4. Validação final
  const finalRoundsSnap = await getDocs(collection(db, 'rodadas'));
  console.log(`\nValidação final: ${finalRoundsSnap.size} rodadas salvas no Firestore.`);

  const finalParticipantsSnap = await getDocs(collection(db, 'participantes'));
  console.log(`Validação do Ranking: ${finalParticipantsSnap.size} participantes com pontos 100% preservados:`);
  finalParticipantsSnap.forEach(d => {
    console.log(`  - ${d.data().nome}: ${d.data().pontos} pts`);
  });

  console.log('--- MIGRAÇÃO CONCLUÍDA COM SUCESSO ---');
}

seedNewRounds().catch(err => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
