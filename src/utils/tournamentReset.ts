// Tournament Reset Utility - Destructive automated reset disabled to protect official 11 rounds and scores.

export async function resetTournamentToNewChampionship(): Promise<void> {
  console.warn('resetTournamentToNewChampionship chamado mas desativado por segurança para proteger as 11 rodadas oficiais e a classificação geral.');
}

export async function checkAndEnsureNewTournament(): Promise<boolean> {
  return false;
}
