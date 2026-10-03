import { FaixaDoPlano } from "@/components/billing/faixa-do-plano";
import { planoDoUsuario } from "@/lib/plano-do-usuario";

/**
 * A FAIXA DO PLANO, em toda tela de dentro.
 *
 * O PRIMEIRO RETRATO vem do servidor: as três informações descem prontas com a
 * página, sem piscada de "carregando" no topo de todas as telas. Desde 28/09
 * a atualização é no navegador (ver o comentário da função abaixo).
 *
 * Fica ACIMA do conteúdo e rola com ele, em vez de grudada no topo: faixa
 * fixa come altura em tela de celular, e a tela que mais importa aqui é o
 * calendário, que precisa de altura.
 *
 * O TOM MUDA COM O ESTADO, e isso é deliberado. Quem está em teste vê quantos
 * dias faltam, porque é a informação que decide se ele assina; quem já assina
 * vê o saldo, porque é a que decide se ele gera. Mostrar as duas coisas com o
 * mesmo peso seria não dizer nenhuma.
 *
 * AGORA SE ATUALIZA SOZINHA (28/09). O layout não se redesenha ao trocar de
 * tela, então a faixa ficava com o retrato do primeiro carregamento: o Bruno
 * virou cliente e continuou vendo "Acesso interno" e o saldo parado. O servidor
 * manda o primeiro retrato, e FaixaDoPlano o renova no navegador.
 */
export async function BannerDoPlano({ userId }: { userId: string }) {
  return <FaixaDoPlano inicial={await planoDoUsuario(userId)} />;
}
