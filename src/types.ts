export interface Participante {
  id: string; // usually the name lowercase
  nome: string;
  pontos: number;
}

export interface Rodada {
  id: string; // document path id
  nome: string;
  abertura: string; // ISO String (for ease of handling/comparisons in timezone independent style)
  fechamento: string; // ISO String
  status: 'aberta' | 'encerrada';
}

export interface Palpite {
  id: string;
  participante: string; // name
  rodada: string; // round code or round name or round ID
  palpite: string;
  capitao: string;
  data_hora_envio: string; // ISO String
  envio_numero: number; // 1 or 2
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
