import type { CodigoDaPonte } from "@/lib/publish/via-blotato";
import { TRADUCAO_DOS_CODIGOS, type CodigoDePublicacao, type TraducaoParaOCliente } from "@/lib/publish/codigos";

/**
 * A METADE INTERNA DO DICIONÁRIO DE CÓDIGOS PUB-* (01/10/2026): o que o admin lê.
 *
 * Fica separada de `lib/publish/codigos.ts` porque aquele arquivo vai para o
 * navegador do cliente, e este fala de fornecedor, de chave e de script de
 * conserto. Componente de cliente nunca importa este arquivo; o tipo de
 * via-blotato.ts que ele usa é só tipo (não leva o módulo do banco junto).
 *
 * Quem usa: o e-mail do chamado (`app/api/suporte/chamado`) e o painel de
 * admin (`components/admin/falhas-de-publicacao.tsx`).
 */

// As duas listas de códigos têm de ser a mesma: se via-blotato ganhar um
// código novo sem tradução (ou o contrário), o tsc para aqui.
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _mesmaLista: Igual<CodigoDaPonte, CodigoDePublicacao> = true;
void _mesmaLista;

export const TECNICO_DOS_CODIGOS: Record<CodigoDePublicacao, string> = {
  "PUB-INT":
    "O Blotato respondeu 0, 401 ou 403 (rede caída, chave inválida ou assinatura dele parada), ou falta BLOTATO_API_KEY no ambiente. Conferir a chave (está na fila de troca), a assinatura no painel do Blotato e o log [blotato] na Vercel. Não é problema da peça: nada do cliente muda o resultado.",
  "PUB-CFG":
    "A SocialAccount está roteada pelo Blotato sem vínculo completo: falta blotatoAccountId, ou é página do LinkedIn (organização) ou do Facebook sem pageId. Ligar com scripts/blotato-contas.mts ligar (com --pagina para página). Também cai aqui plataforma sem montagem em montarPedido.",
  "PUB-LIM":
    "HTTP 429 do Blotato (limite de taxa dele ou da rede). Resolve sozinho; se repetir por horas, conferir os limites do plano no Blotato.",
  "PUB-MID":
    "urlPublicaDaMidia falhou: abrirMidia não abriu o arquivo (Blob privado apagado ou sem token), o arquivo passa do teto de 400 MB do plano Starter do Blotato, ou a fonte não é https nem data URL. Procurar o postId no log [blotato].",
  "PUB-FMT":
    "Recusa de formato. Antes do envio: Instagram sem mídia, YouTube ou TikTok sem vídeo, ou enquete do LinkedIn numa conta só do Blotato (sem token próprio para cair na API da rede, ver oauth-post.ts). Depois do envio: HTTP 400 ou 422 do Blotato ao criar o post, com o corpo da resposta no log.",
  "PUB-REDE":
    "O envio no Blotato terminou com status failed: a rede recusou. O motivo dela está no log [blotato] e em my.blotato.com/failed, pelo número do envio gravado em metadata.ponte.envio.",
  "PUB-ESP":
    "Envio ficou em in-progress ou scheduled por mais de 3 horas (conferirEnviosPendentes no cron), ou não deu para ler o status do envio anterior. A API do Blotato não tem idempotência: conferir o número em metadata.ponte.envio no painel dele e o perfil do cliente ANTES de reenviar, senão o post sai repetido.",
};

export type TraducaoCompleta = { codigo: CodigoDePublicacao; tecnico: string } & TraducaoParaOCliente;

/** As duas metades juntas, para o admin ver o que o cliente leu e o que é de verdade. */
export function traducaoCompleta(codigo: CodigoDePublicacao): TraducaoCompleta {
  return { codigo, ...TRADUCAO_DOS_CODIGOS[codigo], tecnico: TECNICO_DOS_CODIGOS[codigo] };
}
