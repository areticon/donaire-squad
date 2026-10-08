import { fornecedoresSemSaldo } from "@/lib/fornecedores/aviso-de-saldo";
import { FaixaDeSaldoNaTela } from "@/components/admin/faixa-de-saldo-na-tela";
import { FORNECEDORES } from "@/lib/fornecedores/saldo";

/**
 * A FAIXA DE "SEM SALDO" NO TOPO DO PAINEL (06/10/2026).
 *
 * Pedido do Bruno em 06/10: "estava sem crédito na API da OpenAI. Quando for
 * assim, me avise." O e-mail e o sino avisam uma vez a cada 6 h; esta faixa
 * fica no topo do painel ENQUANTO houver fornecedor zerado, com o link de
 * recarga de cada um, e some sozinha quando a primeira chamada passa de novo.
 *
 * Componente de SERVIDOR, separado de propósito: o painel é mexido por mais
 * de uma frente, e a faixa entra com uma linha só. Sem incidente aberto, não
 * desenha nada. Falha de leitura também não desenha nada: a faixa nunca pode
 * derrubar o painel.
 *
 * DESCARTÁVEL (07/10): o desenho mora no invólucro de cliente
 * (faixa-de-saldo-na-tela.tsx), que recolhe por incidente e deixa o
 * "Recarregar". Aqui só a leitura, que continua no servidor.
 */
export async function FaixaDeSaldo() {
  const abertos = await fornecedoresSemSaldo();
  if (!abertos.length) return null;

  const quando = (d: Date) =>
    d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <FaixaDeSaldoNaTela
      itens={abertos.map((inc) => {
        const f = FORNECEDORES[inc.fornecedor];
        return {
          id: inc.id,
          nome: f.nome,
          recarga: f.recarga,
          desde: quando(inc.desde),
          ocorrencias: inc.ocorrencias,
          oQuePara: f.oQuePara,
          onde: inc.onde.slice(-3),
        };
      })}
    />
  );
}
