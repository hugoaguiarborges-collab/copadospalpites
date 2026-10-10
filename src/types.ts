export interface Participante {
  id: string; // usually the name lowercase
  nome: string;
  pontos: number;
  acertos_placar?: number;
}

export interface Rodada {
  id: string; // document path id
  nome: string;
  abertura: string; // ISO String
  fechamento: string; // ISO String
  status: 'aberta' | 'encerrada';
  is_test?: boolean;
  jogos_oficiais?: JogoResultadoOficial[];
  apurada?: boolean;
  data_apuracao?: string;
}

export interface Palpite {
  id: string;
  participante: string; // name
  rodada: string; // round code or round name or round ID
  palpite: string;
  capitao: string;
  data_hora_envio: string; // ISO String
  envio_numero: number; // 1 or 2
  time_mandante?: string;
  gols_mandante?: number;
  time_visitante?: string;
  gols_visitante?: number;
  avaliado?: boolean;
  pontos_concedidos?: number;
  motivo_detalhado?: string;
  acertou_resultado?: boolean;
  acertou_placar?: boolean;
  gols_capitao?: number;
  pontos_capitao?: number;
  capitao_fez_gol?: boolean;
  resultado_oficial?: string;
  jogo_oficial?: string;
}

export interface JogoResultadoOficial {
  time_mandante: string;
  gols_mandante: number;
  time_visitante: string;
  gols_visitante: number;
  gols_jogadores?: { jogador: string; gols: number }[];
}

export interface PontuacaoLog {
  id: string;
  participante: string; // name
  pontos: number;
  motivo: string;
  data_hora: string; // ISO String
}

export interface AdminCredential {
  login: string;
  senha_hash: string;
}
