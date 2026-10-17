// Utility for guess backups - Artificial auto-restoration disabled as requested by user.

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

export const OFFICIAL_RESTORE_GUESSES: ParticipantGuessRecord[] = [];

export async function restoreOfficialGuesses(_targetRoundId: string = 'round-1'): Promise<number> {
  // Disabled: do not inject artificial guesses for participants.
  return 0;
}
