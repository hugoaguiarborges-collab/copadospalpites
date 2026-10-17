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
  AlertCircle,
  Trash2
} from 'lucide-react';
import { UclStarball, UclTrophy, UclBadge } from './UclAssets';

interface TabelaParticipacaoProps {
  round: Rodada;
  participantes: Participante[];
  palpites: Palpite[];
  isMarketClosed?: boolean;
  onDeleteGuesses?: (participantName: string) => void;
}

export default function TabelaParticipacao({
  round,
  participantes,
  palpites,
  isMarketClosed = true,
  onDeleteGuesses
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
    <div className="bg-[#080f33]/90 border border-cyan-500/25 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header com destaque de Mercado Fechado - UEFA Match Status */}
      <div className="bg-[#050b28]/95 border-b border-cyan-500/20 p-5 sm:p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-950/80 text-rose-300 border border-rose-500/40 font-mono">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                MERCADO FECHADO
              </span>
              <span className="text-xs font-bold text-cyan-300 font-mono flex items-center gap-1">
                <UclStarball className="w-3.5 h-3.5 text-cyan-400" />
                {round.nome}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black font-display tracking-tight uppercase text-white">
              Tabela de Participação: Quem Palpitou e Quem Não Palpitou
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-1 font-mono">
              Fechamento oficial: <span className="text-cyan-300 font-bold">Terça-feira às 13:00</span> ({formatDateTimeDisplay(round.fechamento)})
            </p>
          </div>

          {/* Mini resumo numérico - UEFA Style */}
          <div className="flex items-center gap-2">
            <div className="bg-[#04081c] border border-cyan-500/30 px-3 py-2 rounded-xl text-center min-w-[70px] shadow-inner">
              <span className="text-[10px] text-slate-400 uppercase font-bold block font-mono">Total</span>
              <span className="text-base font-black font-mono text-white">{totalParticipantes}</span>
            </div>
            <div className="bg-[#051937] border border-emerald-500/40 px-3 py-2 rounded-xl text-center min-w-[70px] shadow-inner">
              <span className="text-[10px] text-emerald-400 uppercase font-bold block font-mono">Palpitaram</span>
              <span className="text-base font-black font-mono text-emerald-300">{totalPalpitaram}</span>
            </div>
            <div className="bg-[#1f0a1c] border border-rose-500/40 px-3 py-2 rounded-xl text-center min-w-[70px] shadow-inner">
              <span className="text-[10px] text-rose-400 uppercase font-bold block font-mono">Não Palpitou</span>
              <span className="text-base font-black font-mono text-rose-300">{totalNaoPalpitaram}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="p-4 bg-[#050a24]/90 border-b border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Abas de filtro */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap">
          <button
            onClick={() => setStatusFilter('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer font-mono ${
              statusFilter === 'todos'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black shadow-md border border-cyan-300/40'
                : 'bg-[#060c2c] text-slate-300 border border-cyan-900/40 hover:text-white'
            }`}
          >
            Todos ({totalParticipantes})
          </button>
          <button
            onClick={() => setStatusFilter('palpitou')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 font-mono ${
              statusFilter === 'palpitou'
                ? 'bg-emerald-600 text-white font-black shadow-md border border-emerald-300/40'
                : 'bg-[#060c2c] text-emerald-300 border border-emerald-900/40 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Palpitaram ({totalPalpitaram})
          </button>
          <button
            onClick={() => setStatusFilter('nao_palpitou')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 font-mono ${
              statusFilter === 'nao_palpitou'
                ? 'bg-rose-600 text-white font-black shadow-md border border-rose-300/40'
                : 'bg-[#060c2c] text-rose-300 border border-rose-900/40 hover:text-white'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Não Palpitaram ({totalNaoPalpitaram})
          </button>
        </div>

        {/* Input de busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar por participante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#030617] border border-cyan-800/60 rounded-xl text-xs font-bold text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-1 focus:ring-cyan-400"
          />
        </div>
      </div>

      {/* Tabela Principal */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#040822]/80 border-b border-cyan-950 text-slate-400 font-bold uppercase tracking-wider text-[10px] font-mono">
              <th className="py-3 px-4 w-12 text-center">#</th>
              <th className="py-3 px-4">Participante</th>
              <th className="py-3 px-4 text-center">Status do Palpite</th>
              <th className="py-3 px-4 text-center">Pontos na Rodada</th>
              <th className="py-3 px-4 text-center hidden sm:table-cell">Envios</th>
              <th className="py-3 px-4 hidden md:table-cell">Último Envio</th>
              <th className="py-3 px-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cyan-950/70">
            {filteredList.map((item, index) => {
              const isExpanded = expandedParticipant === item.nome;

              return (
                <React.Fragment key={item.id}>
                  <tr 
                    className={`hover:bg-cyan-950/40 transition-colors ${
                      !item.palpitou ? 'bg-rose-950/15' : ''
                    }`}
                  >
                    {/* Número */}
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-400">
                      {index + 1}
                    </td>

                    {/* Nome do Participante */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs uppercase shadow-xs ${
                          item.palpitou 
                            ? 'bg-[#0a1847] text-cyan-300 border border-cyan-500/40' 
                            : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                        }`}>
                          {item.nome.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-white block text-xs sm:text-sm font-display">
                            {item.nome}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.pontos} pts no campeonato
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Status: Palpitou vs Não Palpitou */}
                    <td className="py-3.5 px-4 text-center">
                      {item.palpitou ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Sim, palpitou
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-950/80 text-rose-300 border border-rose-500/40 font-mono">
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          Não palpitou
                        </span>
                      )}
                    </td>

                    {/* Pontos Ganho na Rodada */}
                    <td className="py-3.5 px-4 text-center font-mono">
                      {item.foiAvaliado ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                          item.pontosGanhosRodada > 0 
                            ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40' 
                            : 'bg-[#04081c] text-slate-400 border border-cyan-950'
                        }`}>
                          +{item.pontosGanhosRodada} pts
                        </span>
                      ) : item.palpitou ? (
                        <span className="text-slate-400 text-[11px] font-semibold italic">Aguardando apuração</span>
                      ) : (
                        <span className="text-rose-400 text-xs font-bold">-</span>
                      )}
                    </td>

                    {/* Envios */}
                    <td className="py-3.5 px-4 text-center hidden sm:table-cell font-mono">
                      {item.palpitou ? (
                        <span className="text-xs font-bold text-slate-300 bg-[#050b28] border border-cyan-900/50 px-2 py-0.5 rounded">
                          {item.totalEnvios === 1 ? '1 envio' : `${item.totalEnvios} envios`}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-xs">-</span>
                      )}
                    </td>

                    {/* Horário */}
                    <td className="py-3.5 px-4 hidden md:table-cell">
                      {item.ultimoEnvio ? (
                        <span className="font-mono text-xs text-slate-300 font-semibold">
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
                      <div className="flex items-center justify-end gap-1.5">
                        {item.palpitou ? (
                          <>
                            {isMarketClosed ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.nome)}
                                className="px-2.5 py-1 bg-[#050b28] hover:bg-cyan-950 text-cyan-300 border border-cyan-500/30 rounded-lg font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors font-mono"
                              >
                                {isExpanded ? 'Ocultar' : 'Ver Palpites'}
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-950/80 text-amber-300 border border-amber-500/40 font-mono flex items-center gap-1">
                                <Lock className="w-3 h-3 text-amber-400" />
                                Sigilo Ativo
                              </span>
                            )}

                            {onDeleteGuesses && (
                              <button
                                type="button"
                                onClick={() => onDeleteGuesses(item.nome)}
                                className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-500/40 text-rose-300 hover:text-white transition-colors cursor-pointer"
                                title={`Apagar palpites de ${item.nome}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] text-rose-400 font-bold uppercase tracking-wider font-mono">
                            Pendente
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Detalhes expansíveis com os palpites revelados do participante */}
                  {isExpanded && item.palpitou && (
                    <tr className="bg-[#04081c]/90">
                      <td colSpan={7} className="p-4 border-t border-cyan-950">
                        <div className="bg-[#050b28] border border-cyan-500/30 rounded-xl p-4 shadow-xl">
                          <div className="flex items-center justify-between pb-2 mb-3 border-b border-cyan-950">
                            <div>
                              <span className="font-bold text-xs text-white">
                                Palpites Oficiais de <strong className="text-cyan-300">{item.nome}</strong> nesta rodada:
                              </span>
                              {item.foiAvaliado && (
                                <span className="ml-2 bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono font-black text-xs px-2 py-0.5 rounded">
                                  Total ganho: +{item.pontosGanhosRodada} pts
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              Enviado em: {item.ultimoEnvio ? formatDateTimeDisplay(item.ultimoEnvio) : ''}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {item.palpitesAtivos.map((g, gIdx) => (
                              <div key={g.id || gIdx} className="p-3 bg-[#030617] rounded-xl border border-cyan-800/40 text-xs flex flex-col justify-between shadow-inner">
                                <div>
                                  <div className="font-black text-white text-sm font-mono">
                                    {g.palpite}
                                  </div>
                                  {g.resultado_oficial && (
                                    <div className="text-[11px] text-slate-300 font-semibold mt-1">
                                      Resultado real: <span className="font-bold text-cyan-300">{g.resultado_oficial}</span>
                                    </div>
                                  )}
                                  {g.capitao && (
                                    <div className="text-[11px] text-slate-300 font-medium mt-1">
                                      Capitão: <strong className="text-white">{g.capitao}</strong>
                                    </div>
                                  )}
                                </div>

                                {g.avaliado && (
                                  <div className="mt-2 pt-2 border-t border-cyan-950">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-mono text-cyan-300 font-black">
                                        +{g.pontos_concedidos || 0} pts
                                      </span>
                                      {g.motivo_detalhado && (
                                        <span className="text-[10px] text-slate-400 font-medium font-mono">
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
                <td colSpan={7} className="py-8 text-center text-slate-400 text-xs font-mono">
                  Nenhum participante encontrado com os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer explicativo */}
      <div className="p-3 bg-[#04081c] border-t border-cyan-950 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="font-medium font-mono">
          ★ Os palpites só são revelados publicamente após o encerramento do mercado (terça-feira às 13:00).
        </span>
        <span className="font-bold text-cyan-300 font-display flex items-center gap-1">
          <UclStarball className="w-3.5 h-3.5 text-cyan-400" />
          UEFA Champions League
        </span>
      </div>
    </div>
  );
}
