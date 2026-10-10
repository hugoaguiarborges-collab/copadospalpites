import { Rodada } from '../types';

/**
 * Retorna a data da próxima terça-feira às 13:00 (13h00).
 * O fechamento de mercado da Copa dos Palpites é sempre na terça-feira às 13h.
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
    // Se já passou das 13:00 ou falta menos de 2 horas para as 13:00, o fechamento vai para a próxima terça
    if (fromDate.getTime() >= target.getTime() || (target.getTime() - fromDate.getTime()) < 2 * 3600 * 1000) {
      daysToAdd = 7;
    }
  }

  target.setDate(target.getDate() + daysToAdd);
  return target;
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
 * Verifica se o mercado de uma rodada está aberto.
 * Regra: Somente quando o mercado fecha (terça-feira às 13h) é que a rodada é considerada encerrada.
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
