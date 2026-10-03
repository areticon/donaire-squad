/**
 * A FRASE DA COTA DE GRAVAÇÕES, num arquivo sem banco (30/09).
 *
 * Existe porque a mesma frase sai de dois lados: o servidor recusa o token do
 * upload com ela (lib/limites-do-plano.ts) e a tela de envio mostra a mesma
 * coisa antes de o cliente escolher o arquivo (components/planos/
 * pedido-de-upgrade.tsx). Componente de cliente não importa módulo que toca o
 * banco, e duas cópias da frase divergem, como já divergiram as cópias da
 * tabela de planos até 02/09.
 *
 * A frase é a que o Bruno aprovou em 30/09: "Você já usou 4 de 4 gravações
 * deste mês; a próxima libera em DD/MM ou faça upgrade". A data vai em DD/MM
 * porque é o jeito curto de o cliente anotar na agenda.
 */

/**
 * "14/10", sempre no fuso de São Paulo.
 *
 * O fuso é fixo pelo mesmo motivo de `dia()` em pedido-de-upgrade.tsx: a Vercel
 * roda em UTC, e sem fixar o servidor diria um dia e o navegador outro.
 */
export function diaEMes(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function fraseDaCotaDeGravacoes(args: {
  usado: number;
  limite: number;
  renovaEm: string | null;
  sugestao: { nome: string; gravacoesPorMes: number } | null;
}): string {
  // Quem passou do teto (troca de plano para baixo, ou dois envios no mesmo
  // segundo antes da trava) lê "4 de 4", e não "5 de 4": o número a mais não
  // muda nada para ele, e parece erro nosso.
  const usado = Math.min(args.usado, args.limite);
  const libera = args.renovaEm ? `a próxima libera em ${diaEMes(args.renovaEm)} ou ` : "";
  const sobe = args.sugestao
    ? `faça upgrade para o ${args.sugestao.nome}, com ${args.sugestao.gravacoesPorMes} por mês`
    : "fale com a gente para um plano maior";
  return `Você já usou ${usado} de ${args.limite} gravações deste mês; ${libera}${sobe}.`;
}
