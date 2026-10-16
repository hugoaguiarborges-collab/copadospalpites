import { doc, setDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';

export interface ParticipantGuessRecord {
  nome: string;
  time: string;
  guesses: Array<{
    tipo: 'vitoria' | 'empate';
    vencedor?: string;
    clube1?: string;
    clube2?: string;
    wGoals?: number;
    lGoals?: number;
    eGoals?: number;
    capitao: string;
  }>;
}

export const OFFICIAL_RESTORE_GUESSES: ParticipantGuessRecord[] = [
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

export async function restoreOfficialGuesses(targetRoundId: string = 'round-1'): Promise<number> {
  let count = 0;
  for (const p of OFFICIAL_RESTORE_GUESSES) {
    for (let i = 0; i < p.guesses.length; i++) {
      const g = p.guesses[i];
      const docId = `guess_${targetRoundId}_${p.nome.toLowerCase()}_${i + 1}`;
      
      const palpiteData = {
        participante: p.nome,
        rodada: targetRoundId,
        tipo_palpite: g.tipo,
        vencedor: g.tipo === 'vitoria' ? (g.vencedor || '') : '',
        time_mandante: g.tipo === 'vitoria' ? (g.vencedor || '') : (g.clube1 || ''),
        time_visitante: g.tipo === 'vitoria' ? '' : (g.clube2 || ''),
        gols_mandante: g.tipo === 'vitoria' ? (g.wGoals ?? 2) : (g.eGoals ?? 1),
        gols_visitante: g.tipo === 'vitoria' ? (g.lGoals ?? 0) : (g.eGoals ?? 1),
        gols_vencedor: g.tipo === 'vitoria' ? (g.wGoals ?? 2) : 0,
        gols_perdedor: g.tipo === 'vitoria' ? (g.lGoals ?? 0) : 0,
        palpite: g.tipo === 'vitoria' 
          ? `${g.vencedor} ${g.wGoals}x${g.lGoals}` 
          : `${g.clube1} ${g.eGoals} x ${g.eGoals} ${g.clube2}`,
        capitao: g.capitao,
        data_hora_envio: p.time,
        envio_numero: 1,
        avaliado: false
      };

      await setDoc(doc(db, 'palpites', docId), palpiteData);
      count++;
    }
  }

  // Backup copies
  for (const p of OFFICIAL_RESTORE_GUESSES) {
    for (let i = 0; i < p.guesses.length; i++) {
      const g = p.guesses[i];
      const backupDocId = `backup_${p.nome.toLowerCase()}_${i + 1}`;
      await setDoc(doc(db, 'palpites_backup', backupDocId), {
        participante: p.nome,
        rodada: targetRoundId,
        tipo_palpite: g.tipo,
        vencedor: g.tipo === 'vitoria' ? (g.vencedor || '') : '',
        time_mandante: g.tipo === 'vitoria' ? (g.vencedor || '') : (g.clube1 || ''),
        time_visitante: g.tipo === 'vitoria' ? '' : (g.clube2 || ''),
        gols_mandante: g.tipo === 'vitoria' ? (g.wGoals ?? 2) : (g.eGoals ?? 1),
        gols_visitante: g.tipo === 'vitoria' ? (g.lGoals ?? 0) : (g.eGoals ?? 1),
        palpite: g.tipo === 'vitoria' ? `${g.vencedor} ${g.wGoals}x${g.lGoals}` : `${g.clube1} ${g.eGoals} x ${g.eGoals} ${g.clube2}`,
        capitao: g.capitao,
        data_hora_envio: p.time,
        envio_numero: 1,
        avaliado: false
      });
    }
  }

  return count;
}
