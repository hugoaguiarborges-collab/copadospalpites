import { Rodada } from '../types';

/**
 * Retorna a data da próxima terça-feira às 13:00 (13h00).
 * O mercado fecha nas terças-feiras às 13h para os jogos de terça.
 * Se hoje for terça-feira antes das 13h, fecha HOJE às 13h.
 */
export function getNextTuesday13h(fromDate: Date = new Date()): Date {
  const target = new Date(fromDate);
  target.setSeconds(0, 0);
  target.setMinutes(0);
  target.setHours(13);

  const currentDay = fromDate.getDay();
  // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  let daysToAdd = (2 - currentDay + 7) % 7;

  // Se hoje for terça-feira:
  if (daysToAdd === 0) {
    // Se já passou das 13:00, o fechamento vai para a próxima terça (+7 dias)
    if (fromDate.getTime() >= target.getTime()) {
      daysToAdd = 7;
    }
  }

  target.setDate(target.getDate() + daysToAdd);
  return target;
}

/**
 * Retorna a data da próxima quarta-feira às 13:00 (13h00).
 * O mercado fecha nas quartas-feiras às 13h para os jogos de quarta.
 * Se hoje for quarta-feira antes das 13h, fecha HOJE às 13h.
 */
export function getNextWednesday13h(fromDate: Date = new Date()): Date {
  const target = new Date(fromDate);
  target.setSeconds(0, 0);
  target.setMinutes(0);
  target.setHours(13);

  const currentDay = fromDate.getDay();
  // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  let daysToAdd = (3 - currentDay + 7) % 7;

  // Se hoje for quarta-feira:
  if (daysToAdd === 0) {
    // Se já passou das 13:00, o fechamento vai para a próxima quarta (+7 dias)
    if (fromDate.getTime() >= target.getTime()) {
      daysToAdd = 7;
    }
  }

  target.setDate(target.getDate() + daysToAdd);
  return target;
}

/**
 * Identifica se a rodada corresponde aos jogos de terça ou quarta-feira.
 */
export function isTuesdayMatchday(round: Rodada | null | undefined): boolean {
  if (!round) return true;
  const str = `${round.id || ''} ${round.nome || ''} ${round.data_jogos || ''}`.toLowerCase();
  if (str.includes('quarta') || str.includes('21/10') || str.includes('04/11') || str.includes('25/11') || str.includes('09/12') || str.includes('20/01') || str.includes('27/01') || str.includes('qua')) {
    return false;
  }
  return true;
}

/**
 * Ordena as rodadas estritamente pela cronologia oficial de fechamento.
 */
export function sortRoundsChronologically(rounds: Rodada[]): Rodada[] {
  return [...rounds].sort((a, b) => {
    const timeA = a.fechamento ? new Date(a.fechamento).getTime() : 0;
    const timeB = b.fechamento ? new Date(b.fechamento).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return getRoundNumber(a.nome || a.id) - getRoundNumber(b.nome || b.id);
  });
}

/**
 * Localiza a próxima rodada na sequência oficial do calendário.
 */
export function getNextRoundInCalendar(currentRound: Rodada | null | undefined, allRounds: Rodada[]): Rodada | undefined {
  if (!currentRound) return undefined;
  const sorted = sortRoundsChronologically(allRounds).filter(r => !r.is_test && r.id !== 'rodada-teste');
  const currentIndex = sorted.findIndex(r => r.id === currentRound.id);
  if (currentIndex !== -1 && currentIndex + 1 < sorted.length) {
    return sorted[currentIndex + 1];
  }
  return undefined;
}

/**
 * Regra oficial do ciclo de mercado do bolão:
 * O mercado fecha às 13h das terças e abre assim que os palpites forem atualizados pelo ADM.
 * Fechando novamente no dia seguinte (quarta-feira) às 13h e abrindo novamente quando as pontuações forem atualizadas.
 */
export function getClosingForNextRound(
  roundEvaluated: Rodada | null | undefined,
  now: Date = new Date(),
  allRounds?: Rodada[]
): { fechamento: Date; targetDateLabel: string; targetDayName: string; isNextDayWednesday: boolean } {
  // Se allRounds foi fornecido, pega a data oficial da próxima rodada do calendário
  if (roundEvaluated && allRounds && allRounds.length > 0) {
    const nextR = getNextRoundInCalendar(roundEvaluated, allRounds);
    if (nextR && nextR.fechamento) {
      const nextDate = new Date(nextR.fechamento);
      const isTue = isTuesdayMatchday(nextR);
      return {
        fechamento: nextDate,
        targetDateLabel: nextR.data_jogos || (isTue ? 'terça-feira' : 'quarta-feira'),
        targetDayName: isTue ? 'terça-feira às 13:00' : 'quarta-feira às 13:00',
        isNextDayWednesday: !isTue
      };
    }
  }

  const wasTuesday = isTuesdayMatchday(roundEvaluated);

  if (wasTuesday) {
    return {
      fechamento: getNextWednesday13h(now),
      targetDateLabel: 'quarta-feira',
      targetDayName: 'quarta-feira às 13:00',
      isNextDayWednesday: true
    };
  }

  return {
    fechamento: getNextTuesday13h(now),
    targetDateLabel: 'terça-feira',
    targetDayName: 'terça-feira às 13:00',
    isNextDayWednesday: false
  };
}

/**
 * Retorna a data e descrição de fechamento para a PRÓPRIA rodada que está sendo aberta.
 */
export function getClosingForRound(
  round: Rodada | null | undefined,
  now: Date = new Date()
): { fechamento: Date; targetDayName: string } {
  if (round?.fechamento) {
    const d = new Date(round.fechamento);
    // Se a data de fechamento cadastrada for futura, preserva a data exata oficial da rodada!
    if (d.getTime() > now.getTime()) {
      const isTue = isTuesdayMatchday(round);
      return {
        fechamento: d,
        targetDayName: isTue ? 'terça-feira às 13:00' : 'quarta-feira às 13:00'
      };
    }
  }

  const isTue = isTuesdayMatchday(round);
  if (isTue) {
    return {
      fechamento: getNextTuesday13h(now),
      targetDayName: 'terça-feira às 13:00'
    };
  } else {
    return {
      fechamento: getNextWednesday13h(now),
      targetDayName: 'quarta-feira às 13:00'
    };
  }
}

/**
 * Regra oficial de reabertura automática na quarta-feira:
 * "Se não houver atualização do administrador, à meia-noite da quarta-feira ele já é reaberto
 * e de 13 horas da quarta-feira é fechado novamente."
 */
export function shouldAutoOpenWednesdayMidnight(rounds: Rodada[], now: Date = new Date()): boolean {
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  // Quarta-feira (3), das 00:00 até 12:59:
  if (currentDay === 3 && currentHour < 13) {
    const hasOpenActiveRound = rounds.some(r => r.status === 'aberta' && now < new Date(r.fechamento));
    return !hasOpenActiveRound;
  }

  return false;
}

export function shouldAutoOpenThursdayMidnight(rounds: Rodada[], now: Date = new Date()): boolean {
  return false;
}

/**
 * Formata uma data ISO para exibição legível no padrão brasileiro: DD/MM/AAAA às HH:MM
 */
export function formatDateTimeDisplay(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${ano} às ${hora}:${min}`;
  } catch {
    return isoString;
  }
}

/**
 * Retorna uma descrição amigável do fechamento (ex: "Hoje (quarta-feira) às 13:00", etc.)
 */
export function getFriendlyClosingLabel(fechamentoISO: string, now: Date = new Date()): string {
  if (!fechamentoISO) return '';
  try {
    const close = new Date(fechamentoISO);
    const dayDiff = Math.round((new Date(close.getFullYear(), close.getMonth(), close.getDate()).getTime() - 
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (1000 * 60 * 60 * 24));
    
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const closeDayName = dayNames[close.getDay()];

    if (dayDiff === 0) {
      return `Hoje (${closeDayName}) às 13:00`;
    } else if (dayDiff === 1) {
      return `Amanhã (${closeDayName}) às 13:00`;
    } else {
      return `${closeDayName} às 13:00 (${formatDateTimeDisplay(fechamentoISO)})`;
    }
  } catch {
    return formatDateTimeDisplay(fechamentoISO);
  }
}

/**
 * Verifica se o mercado de uma rodada está aberto.
 * Regra: status deve ser 'aberta' e o momento atual deve ser estritamente antes do prazo de fechamento.
 */
export function isMarketOpen(round: Rodada | null | undefined): boolean {
  if (!round) return false;
  if (round.status !== 'aberta') return false;
  const now = new Date();
  const closingDate = new Date(round.fechamento);
  return now < closingDate;
}

/**
 * Extrai o número da rodada a partir do nome ou ID (ex: "Rodada 14" -> 14, "round-7" -> 7).
 */
export function getRoundNumber(nameOrId: string): number {
  if (!nameOrId) return 0;
  const match = nameOrId.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}
