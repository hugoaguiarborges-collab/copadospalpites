const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDocs, collection, writeBatch } = require('firebase/firestore');
const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const participantsGuesses = [
  {
    nome: 'Hugo',
    time: '2026-10-14T09:18:22.000Z',
    guesses: [
      { tipo: 'vitoria', vencedor: 'FC Barcelona', wGoals: 2, lGoals: 1, capitao: 'Raphinha' },
      { tipo: 'vitoria', vencedor: 'Manchester City', wGoals: 3, lGoals: 0, capitao: 'Erling Haaland' },
      { tipo: 'vitoria', vencedor: 'Liverpool FC', wGoals: 2, lGoals: 0, capitao: 'Mohamed Salah' },
      { tipo: 'vitoria', vencedor: 'Inter de Milão', wGoals: 2, lGoals: 1, capitao: 'Lautaro Martínez' },
      { tipo: 'vitoria', vencedor: 'Bayer Leverkusen', wGoals: 2, lGoals: 0, capitao: 'Florian Wirtz' }
    ]
  },
  {
    nome: 'Marcelo',
    time: '2026-10-14T09:42:15.000Z',
    guesses: [
      { tipo: 'vitoria', vencedor: 'Bayern de Munique', wGoals: 2, lGoals: 1, capitao: 'Harry Kane' },
      { tipo: 'vitoria', vencedor: 'Manchester City', wGoals: 4, lGoals: 1, capitao: 'Erling Haaland' },
      { tipo: 'vitoria', vencedor: 'Atlético de Madrid', wGoals: 2, lGoals: 1, capitao: 'Antoine Griezmann' },
      { tipo: 'vitoria', vencedor: 'Atalanta BC', wGoals: 2, lGoals: 0, capitao: 'Ademola Lookman' },
      { tipo: 'vitoria', vencedor: 'Liverpool FC', wGoals: 3, lGoals: 1, capitao: 'Mohamed Salah' }
    ]
  },
  {
    nome: 'Everton',
    time: '2026-10-14T10:05:40.000Z',
    guesses: [
      { tipo: 'vitoria', vencedor: 'Manchester City', wGoals: 3, lGoals: 0, capitao: 'Erling Haaland' },
      { tipo: 'vitoria', vencedor: 'FC Barcelona', wGoals: 3, lGoals: 2, capitao: 'Robert Lewandowski' },
      { tipo: 'vitoria', vencedor: 'Inter de Milão', wGoals: 1, lGoals: 0, capitao: 'Marcus Thuram' },
      { tipo: 'vitoria', vencedor: 'Bayer Leverkusen', wGoals: 3, lGoals: 1, capitao: 'Florian Wirtz' },
      { tipo: 'empate', clube1: 'RB Leipzig', clube2: 'Liverpool FC', eGoals: 1, capitao: 'Mohamed Salah' }
    ]
  },
  {
    nome: 'Rafael',
    time: '2026-10-14T10:33:10.000Z',
    guesses: [
      { tipo: 'vitoria', vencedor: 'Liverpool FC', wGoals: 2, lGoals: 1, capitao: 'Mohamed Salah' },
      { tipo: 'vitoria', vencedor: 'Manchester City', wGoals: 2, lGoals: 0, capitao: 'Phil Foden' },
      { tipo: 'vitoria', vencedor: 'FC Barcelona', wGoals: 2, lGoals: 1, capitao: 'Lamine Yamal' },
      { tipo: 'vitoria', vencedor: 'Atlético de Madrid', wGoals: 1, lGoals: 0, capitao: 'Julián Álvarez' },
      { tipo: 'vitoria', vencedor: 'SL Benfica', wGoals: 2, lGoals: 1, capitao: 'Ángel Di María' }
    ]
  },
  {
    nome: 'Jardel',
    time: '2026-10-14T11:12:05.000Z',
    guesses: [
      { tipo: 'vitoria', vencedor: 'Inter de Milão', wGoals: 2, lGoals: 0, capitao: 'Lautaro Martínez' },
      { tipo: 'vitoria', vencedor: 'Bayern de Munique', wGoals: 3, lGoals: 2, capitao: 'Harry Kane' },
      { tipo: 'vitoria', vencedor: 'Manchester City', wGoals: 3, lGoals: 1, capitao: 'Erling Haaland' },
      { tipo: 'vitoria', vencedor: 'Bayer Leverkusen', wGoals: 2, lGoals: 1, capitao: 'Victor Boniface' },
      { tipo: 'vitoria', vencedor: 'Atalanta BC', wGoals: 1, lGoals: 0, capitao: 'Mateo Retegui' }
    ]
  },
  {
    nome: 'Franz',
    time: '2026-10-14T11:55:18.000Z',
    guesses: [
      { tipo: 'vitoria', vencedor: 'Atlético de Madrid', wGoals: 2, lGoals: 0, capitao: 'Antoine Griezmann' },
      { tipo: 'vitoria', vencedor: 'FC Barcelona', wGoals: 2, lGoals: 1, capitao: 'Raphinha' },
      { tipo: 'vitoria', vencedor: 'Manchester City', wGoals: 4, lGoals: 0, capitao: 'Erling Haaland' },
      { tipo: 'vitoria', vencedor: 'Liverpool FC', wGoals: 2, lGoals: 1, capitao: 'Luis Díaz' },
      { tipo: 'empate', clube1: 'Bayer Leverkusen', clube2: 'Stade Brestois', eGoals: 1, capitao: 'Florian Wirtz' }
    ]
  },
  {
    nome: 'Lele',
    time: '2026-10-14T12:20:45.000Z',
    guesses: [
      { tipo: 'vitoria', vencedor: 'Bayer Leverkusen', wGoals: 3, lGoals: 0, capitao: 'Florian Wirtz' },
      { tipo: 'vitoria', vencedor: 'Manchester City', wGoals: 3, lGoals: 1, capitao: 'Kevin De Bruyne' },
      { tipo: 'vitoria', vencedor: 'Inter de Milão', wGoals: 2, lGoals: 0, capitao: 'Hakan Çalhanoğlu' },
      { tipo: 'vitoria', vencedor: 'FC Barcelona', wGoals: 1, lGoals: 0, capitao: 'Robert Lewandowski' },
      { tipo: 'vitoria', vencedor: 'Liverpool FC', wGoals: 2, lGoals: 0, capitao: 'Darwin Núñez' }
    ]
  }
];

async function restore() {
  const roundIds = ['round-1', 'round-1-quarta'];
  let totalSaved = 0;

  for (const rId of roundIds) {
    const batch = writeBatch(db);
    for (const p of participantsGuesses) {
      for (let i = 0; i < p.guesses.length; i++) {
        const g = p.guesses[i];
        const guessDocId = `guess_${rId}_${p.nome.toLowerCase()}_${i + 1}`;
        const ref = doc(db, 'palpites', guessDocId);
        
        if (g.tipo === 'vitoria') {
          batch.set(ref, {
            participante: p.nome,
            rodada: rId,
            tipo_palpite: 'vitoria',
            vencedor: g.vencedor,
            time_mandante: g.vencedor,
            time_visitante: '',
            gols_mandante: g.wGoals,
            gols_visitante: g.lGoals,
            gols_vencedor: g.wGoals,
            gols_perdedor: g.lGoals,
            palpite: g.vencedor + ' ' + g.wGoals + 'x' + g.lGoals,
            capitao: g.capitao,
            data_hora_envio: p.time,
            envio_numero: 1,
            avaliado: false
          });
        } else {
          batch.set(ref, {
            participante: p.nome,
            rodada: rId,
            tipo_palpite: 'empate',
            vencedor: '',
            time_mandante: g.clube1,
            time_visitante: g.clube2,
            gols_mandante: g.eGoals,
            gols_visitante: g.eGoals,
            palpite: g.clube1 + ' ' + g.eGoals + ' x ' + g.eGoals + ' ' + g.clube2,
            capitao: g.capitao,
            data_hora_envio: p.time,
            envio_numero: 1,
            avaliado: false
          });
        }
        totalSaved++;
      }
    }
    await batch.commit();
  }

  console.log('Successfully restored ' + totalSaved + ' guesses across round-1 and round-1-quarta!');
  
  const snap = await getDocs(collection(db, 'palpites'));
  console.log('Total in collection palpites now: ' + snap.size);
  process.exit(0);
}

restore().catch(e => { console.error('Error restoring:', e); process.exit(1); });
