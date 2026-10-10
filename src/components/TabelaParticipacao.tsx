import React, { useState, useMemo } from 'react';
import { Participante, Palpite, Rodada } from '../types';
import { formatDateTimeDisplay } from '../utils/dateUtils';
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Lock, 
  Calendar,
  AlertCircle
} from 'lucide-react';

interface TabelaParticipacaoProps {
  round: Rodada;
  participantes: Participante[];
  palpites: Palpite[];
  isMarketClosed?: boolean;
}

export default function TabelaParticipacao({
  round,
  participantes,
  palpites,
  isMarketClosed = true
}: TabelaParticipacaoProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'palpitou' | 'nao_palpitou'>('todos');
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);

  // Mapear os palpites válidos de cada participante
  // Em caso de múltiplos envios, o último envio é o que vale
  const participationData = useMemo(() => {
    // Agrupar palpites por participante
    const palpiteGroups: Record<string, Palpite[]> = {};
    palpites.forEach(p => {
      const pNameLower = p.participante.trim().toLowerCase();
      if (!palpiteGroups[pNameLower]) {
        palpiteGroups[pNameLower] = [];
      }
      palpiteGroups[pNameLower].push(p);
    });

    return participantes.map(p => {
      const pNameLower = p.nome.trim().toLowerCase();
      const userGuesses = palpiteGroups[pNameLower] || [];
      const palpitou = userGuesses.length > 0;

      // Ordenar por data de envio crescente
      const sorted = [...userGuesses].sort(
        (a, b) => new Date(a.data_hora_envio).getTime() - new Date(b.data_hora_envio).getTime()
      );

      // Obter timestamps únicos de submissão
      const timestamps = Array.from(new Set(sorted.map(g => g.data_hora_envio)));
      const latestTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

      // Pegar apenas os palpites ativos (último envio)
      const activeGuesses = latestTimestamp 
        ? sorted.filter(g => g.data_hora_envio === latestTimestamp)
        : [];

      const pontosGanhosRodada = activeGuesses.reduce((acc, curr) => acc + (curr.pontos_concedidos || 0), 0);
      const foiAvaliado = activeGuesses.some(g => g.avaliado);

      return {
        id: p.id,
        nome: p.nome,
        pontos: p.pontos,
        palpitou,
        totalEnvios: timestamps.length,
        ultimoEnvio: latestTimestamp,
        palpitesAtivos: activeGuesses,
        pontosGanhosRodada,
        foiAvaliado
      };
    });
  }, [participantes, palpites]);

  // Contadores gerais
  const totalParticipantes = participationData.length;
  const totalPalpitaram = participationData.filter(p => p.palpitou).length;
  const totalNaoPalpitaram = totalParticipantes - totalPalpitaram;

  // Filtragem da lista
  const filteredList = useMemo(() => {
    return participationData.filter(item => {
      // Filtro de busca por nome
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        if (!item.nome.toLowerCase().includes(term)) {
          return false;
        }
      }

      // Filtro de status
      if (statusFilter === 'palpitou') {
        return item.palpitou;
      }
      if (statusFilter === 'nao_palpitou') {
        return !item.palpitou;
      }

      return true;
    }).sort((a, b) => {
      // Ordenação: primeiro quem não palpitou ou alfabética
      if (statusFilter === 'todos') {
        // Mostra quem palpitou primeiro, depois quem não palpitou, ou ordem alfabética
        return a.nome.localeCompare(b.nome);
      }
      return a.nome.localeCompare(b.nome);
    });
  }, [participationData, searchTerm, statusFilter]);

  const toggleExpand = (participantName: string) => {
    setExpandedParticipant(prev => prev === participantName ? null : participantName);
  };

  return (
    <div className="bg-white border-2 border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header com destaque de Mercado Fechado */}
      <div className="bg-neutral-900 text-white p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-500 text-white">
                <Lock className="w-3.5 h-3.5" />
                MERCADO FECHADO
              </span>
              <span className="text-xs font-bold text-neutral-300">
                {round.nome}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black font-display tracking-tight uppercase">
              Tabela de Participação: Quem Palpitou e Quem Não Palpitou
            </h3>
            <p className="text-xs text-neutral-400 font-medium mt-1">
              Fechamento oficial da rodada: <span className="text-amber-400 font-bold">Terça-feira às 13:00</span> ({formatDateTimeDisplay(round.fechamento)})
            </p>
          </div>

          {/* Mini resumo numérico */}
          <div className="flex items-center gap-2">
            <div className="bg-neutral-800/80 border border-neutral-700 px-3 py-2 rounded-xl text-center min-w-[70px]">
              <span className="text-[10px] text-neutral-400 uppercase font-bold block">Total</span>
              <span className="text-base font-black font-mono text-white">{totalParticipantes}</span>
            </div>
            <div className="bg-emerald-950/60 border border-emerald-800 px-3 py-2 rounded-xl text-center min-w-[70px]">
              <span className="text-[10px] text-emerald-400 uppercase font-bold block">Palpitaram</span>
              <span className="text-base font-black font-mono text-emerald-300">{totalPalpitaram}</span>
            </div>
            <div className="bg-rose-950/60 border border-rose-800 px-3 py-2 rounded-xl text-center min-w-[70px]">
              <span className="text-[10px] text-rose-400 uppercase font-bold block">Não Palpitou</span>
              <span className="text-base font-black font-mono text-rose-300">{totalNaoPalpitaram}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="p-4 bg-neutral-50/80 border-b border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Abas de filtro */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'todos'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            Todos ({totalParticipantes})
          </button>
          <button
            onClick={() => setStatusFilter('palpitou')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'palpitou'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Palpitaram ({totalPalpitaram})
          </button>
          <button
            onClick={() => setStatusFilter('nao_palpitou')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              statusFilter === 'nao_palpitou'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Não Palpitaram ({totalNaoPalpitaram})
          </button>
        </div>

        {/* Input de busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar por participante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-[#009739]"
          />
        </div>
      </div>

      {/* Tabela Principal */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-neutral-100/70 border-b border-neutral-200 text-neutral-500 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4 w-12 text-center">#</th>
              <th className="py-3 px-4">Participante</th>
              <th className="py-3 px-4 text-center">Status do Palpite</th>
              <th className="py-3 px-4 text-center">Pontos na Rodada</th>
              <th className="py-3 px-4 text-center hidden sm:table-cell">Envios</th>
              <th className="py-3 px-4 hidden md:table-cell">Último Envio</th>
              <th className="py-3 px-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-150">
            {filteredList.map((item, index) => {
              const isExpanded = expandedParticipant === item.nome;

              return (
                <React.Fragment key={item.id}>
                  <tr 
                    className={`hover:bg-neutral-50/70 transition-colors ${
                      !item.palpitou ? 'bg-rose-50/30' : ''
                    }`}
                  >
                    {/* Número */}
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-neutral-400">
                      {index + 1}
                    </td>

                    {/* Nome do Participante */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                          item.palpitou 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {item.nome.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-neutral-900 block text-xs sm:text-sm">
                            {item.nome}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {item.pontos} pts no campeonato
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status: Palpitou vs Não Palpitou */}
                    <td className="py-3.5 px-4 text-center">
                      {item.palpitou ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Sim, palpitou
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          Não, ainda não palpitou
                        </span>
                      )}
                    </td>

                    {/* Pontos Ganho na Rodada */}
                    <td className="py-3.5 px-4 text-center font-mono">
                      {item.foiAvaliado ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black ${
                          item.pontosGanhosRodada > 0 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          +{item.pontosGanhosRodada} pts
                        </span>
                      ) : item.palpitou ? (
                        <span className="text-neutral-400 text-[11px] font-semibold italic">Aguardando</span>
                      ) : (
                        <span className="text-rose-400 text-xs font-bold">-</span>
                      )}
                    </td>

                    {/* Envios */}
                    <td className="py-3.5 px-4 text-center hidden sm:table-cell">
                      {item.palpitou ? (
                        <span className="font-mono text-xs font-bold text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded">
                          {item.totalEnvios === 1 ? '1 envio' : `${item.totalEnvios} envios (atualizado)`}
                        </span>
                      ) : (
                        <span className="text-neutral-400 font-mono text-xs">-</span>
                      )}
                    </td>

                    {/* Horário */}
                    <td className="py-3.5 px-4 hidden md:table-cell">
                      {item.ultimoEnvio ? (
                        <span className="font-mono text-xs text-neutral-600 font-semibold">
                          {formatDateTimeDisplay(item.ultimoEnvio)}
                        </span>
                      ) : (
                        <span className="text-rose-400 text-xs font-semibold italic">
                          Nenhum registro
                        </span>
                      )}
                    </td>

                    {/* Ação */}
                    <td className="py-3.5 px-4 text-right">
                      {item.palpitou ? (
                        <button
                          onClick={() => toggleExpand(item.nome)}
                          className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          {isExpanded ? 'Ocultar' : 'Ver Palpites'}
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="text-[11px] text-rose-500 font-bold uppercase tracking-wider">
                          Pendente
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Detalhes expansíveis com os palpites revelados do participante */}
                  {isExpanded && item.palpitou && (
                    <tr className="bg-neutral-50/90">
                      <td colSpan={7} className="p-4 border-t border-neutral-150">
                        <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs">
                          <div className="flex items-center justify-between pb-2 mb-3 border-b border-neutral-100">
                            <div>
                              <span className="font-bold text-xs text-neutral-800">
                                Palpites Oficiais de <strong className="text-green-800">{item.nome}</strong> nesta rodada:
                              </span>
                              {item.foiAvaliado && (
                                <span className="ml-2 bg-emerald-100 text-emerald-800 font-mono font-black text-xs px-2 py-0.5 rounded">
                                  Total ganho na rodada: +{item.pontosGanhosRodada} pts
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-neutral-400">
                              Enviado em: {item.ultimoEnvio ? formatDateTimeDisplay(item.ultimoEnvio) : ''}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {item.palpitesAtivos.map((g, gIdx) => (
                              <div key={g.id || gIdx} className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs flex flex-col justify-between">
                                <div>
                                  <div className="font-black text-neutral-900 text-sm">
                                    {g.palpite}
                                  </div>
                                  {g.resultado_oficial && (
                                    <div className="text-[11px] text-neutral-500 font-semibold mt-1">
                                      Resultado real: <span className="font-bold text-neutral-800">{g.resultado_oficial}</span>
                                    </div>
                                  )}
                                  {g.capitao && (
                                    <div className="text-[11px] text-neutral-500 font-medium mt-1">
                                      Capitão: <strong className="text-neutral-700">{g.capitao}</strong>
                                    </div>
                                  )}
                                </div>

                                {g.avaliado && (
                                  <div className="mt-2 pt-2 border-t border-neutral-200/80">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-mono text-emerald-700 font-black">
                                        +{g.pontos_concedidos || 0} pts
                                      </span>
                                      {g.motivo_detalhado && (
                                        <span className="text-[10px] text-neutral-500 font-medium">
                                          {g.motivo_detalhado}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {filteredList.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-neutral-400 text-xs">
                  Nenhum participante encontrado com os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer explicativo */}
      <div className="p-3 bg-neutral-100/60 border-t border-neutral-200 text-[11px] text-neutral-500 flex items-center justify-between">
        <span className="font-semibold">
          💡 Os palpites só são revelados publicamente após o encerramento do mercado (terça-feira às 13:00).
        </span>
        <span className="font-bold text-neutral-600">
          Copa dos Palpites
        </span>
      </div>
    </div>
  );
}
