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
  if (str.includes('quarta') || str.includes('21/10') || str.includes('qua')) {
    return false;
  }
  return true;
}

/**
 * Regra oficial do ciclo de mercado da Champions League:
 * Em uma mesma rodada (ex: Rodada 1):
 * 1. O mercado fecha na terça-feira às 13h (jogos de terça da rodada).
 * 2. Quando o ADM atualiza os jogos de terça, o mercado reabre automaticamente para os jogos de
 *    quarta-feira da MESMA rodada, fechando na quarta-feira às 13h!
 * 3. O mercado fecha na quarta-feira às 13h (jogos de quarta da rodada).
 * 4. Quando o ADM atualiza os jogos de quarta, o mercado reabre automaticamente para a
 *    PRÓXIMA rodada (ex: Rodada 2), fechando na próxima terça-feira às 13h!
 */
export function getClosingForNextRound(
  roundEvaluated: Rodada | null | undefined,
  now: Date = new Date()
): { fechamento: Date; targetDateLabel: string; targetDayName: string; isNextDayWednesday: boolean } {
  const wasTuesday = isTuesdayMatchday(roundEvaluated);

  if (wasTuesday) {
    // A rodada avaliada foi de terça: a próxima etapa é QUARTA da MESMA rodada!
    // Fecha na quarta-feira às 13h!
    return {
      fechamento: getNextWednesday13h(now),
      targetDateLabel: '21/10',
      targetDayName: 'quarta-feira às 13:00',
      isNextDayWednesday: true
    };
  }

  // A rodada avaliada foi de quarta: a rodada semanal foi concluída!
  // A próxima é a PRÓXIMA RODADA (jogos de terça da semana que vem), fechando na terça às 13h!
  return {
    fechamento: getNextTuesday13h(now),
    targetDateLabel: '20/10',
    targetDayName: 'terça-feira às 13:00',
    isNextDayWednesday: false
  };
}

/**
 * Retorna a data e descrição de fechamento para a PRÓPRIA rodada que está sendo aberta.
 * - Se a rodada é de terça-feira: fecha na terça-feira às 13:00.
 * - Se a rodada é de quarta-feira: fecha na quarta-feira às 13:00.
 */
export function getClosingForRound(
  round: Rodada | null | undefined,
  now: Date = new Date()
): { fechamento: Date; targetDayName: string } {
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
 * Regra da quinta-feira à meia-noite:
 * "Em casos de rodadas onde o ADM não atualize nada, à meia-noite da quinta-feira
 * você pode abrir o mercado automaticamente, porque isso são casos de rodadas que não têm jogos."
 *
 * Retorna true se hoje é quinta-feira (a partir de 00:00), sexta, sábado, domingo, segunda,
 * ou terça antes das 13h, e o mercado estiver sem nenhuma rodada aberta ativa.
 */
export function shouldAutoOpenThursdayMidnight(rounds: Rodada[], now: Date = new Date()): boolean {
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  // Se for terça após 13h: fechado aguardando apuração do ADM dos jogos de terça
  if (currentDay === 2 && currentHour >= 13) return false;

  // Se for quarta-feira o dia inteiro: aguardando os jogos de quarta e a apuração do ADM
  if (currentDay === 3) return false;

  // Quinta (4), Sexta (5), Sábado (6), Domingo (0), Segunda (1), Terça até 12:59 (2):
  // Se não houver rodada aberta no momento, deve abrir automaticamente até a próxima terça 13h!
  const hasOpenActiveRound = rounds.some(r => r.status === 'aberta' && now < new Date(r.fechamento));
  return !hasOpenActiveRound;
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
 * Retorna uma descrição amigável do fechamento (ex: "Hoje (quarta-feira) às 13:00", "Amanhã às 13:00", etc.)
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
