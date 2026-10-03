export const dynamic = "force-dynamic";

// 800 s, o mesmo teto das rotas de video. Agora o teto vale por TRABALHO e nao
// pela campanha inteira: cada dia com imagem, Vera e correcao leva perto de
// 2,5 minutos, entao uma passada roda dois ou tres dias e devolve o resto para
// a proxima. Sete dias com imagem, que era o caso que estourava, passam a
// caber porque nenhum deles divide o teto com os outros.
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { assinaturaDaFilaValida, cutucar } from "@/lib/fila/trabalhos";
import { passadaDaFila } from "@/lib/fila/passada";
import { avancarAberturas } from "@/lib/media/higgsfield-nos-cortes";
import { avancarMontagens } from "@/lib/media/montagem-nos-cortes";
import { avancarMontagemDoCompleto } from "@/lib/media/montagem-do-completo";
import { retomarRevisoesParadas } from "@/lib/media/revisao-do-corte";
import { avancarGemeos } from "@/lib/media/gemeo-passo";
import { avancarRegua } from "@/lib/agenda/regua";
import { avancarContratos } from "@/lib/contratos/regua";
import { vigiarEtapas } from "@/lib/media/vigia-das-etapas";
import { observarAvisos } from "@/lib/notificacoes/observador";

/**
 * A fila, uma passada.
 *
 * Roda a cada minuto pelo cron e tambem por cutucao, logo depois de alguem
 * pedir uma campanha: o cron e a rede de seguranca, nao o relogio do produto.
 * O que ela faz esta em `lib/fila/passada.ts`, que e a mesma copia que a prova
 * de ponta a ponta chama.
 */

/**
 * Quem pode chamar: o cron da Vercel (com o `CRON_SECRET` no cabecalho, mesmo
 * padrao do cron de publicacao) ou o proprio servidor, com a assinatura da
 * fila. A rota mexe em trabalho de cliente e gasta API paga, entao ela nao
 * fica aberta.
 */
function autorizado(req: NextRequest): boolean {
  const segredoDoCron = process.env.CRON_SECRET;
  if (segredoDoCron && req.headers.get("authorization") === `Bearer ${segredoDoCron}`) {
    return true;
  }
  return assinaturaDaFilaValida(req.nextUrl.searchParams.get("sig"));
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A RÉGUA DE ALERTAS DA DEMONSTRAÇÃO (01/10) vem PRIMEIRO: é rápida (uma
  // consulta e, de vez em quando, um e-mail e um WhatsApp) e é a única coisa
  // desta rota com hora marcada. Depois das etapas de vídeo, que somam vários
  // minutos, o "começa em 5 minutos" sairia atrasado. Falha aqui não derruba a
  // fila. Ver lib/agenda/regua.ts.
  const regua = await avancarRegua().catch((e) => {
    console.error("[fila] régua da demonstração falhou:", e);
    return null;
  });

  // A RÉGUA DOS CONTRATOS (02/10): situação pelas datas e avisos de 60, 30 e 7
  // dias e de vencido. Uma consulta pequena; falha não derruba a fila. Ver
  // lib/contratos/regua.ts.
  await avancarContratos().catch((e) => console.error("[fila] régua dos contratos falhou:", e));

  // O VIGIA DAS ETAPAS (01/10): logo depois da régua, porque é a outra coisa
  // desta rota que o cliente sente no relógio (o vídeo parado). É rápido: uma
  // consulta, e só quando há vídeo parado um despacho e, no corte, uma
  // pergunta ao worker com teto de 8 s (em paralelo). Vem DEPOIS da régua para
  // nunca atrasar o "começa em 5 minutos". Substitui o relançamento do roteiro
  // parado que morava aqui (30/09), agora com teto de retomadas. Ver
  // lib/media/vigia-das-etapas.ts.
  const vigia = await vigiarEtapas().catch((e) => {
    console.error("[fila] vigia das etapas falhou:", e);
    return null;
  });

  // OS AVISOS DO SINO E OS E-MAILS (02/10): rápido (três consultas e, de vez
  // em quando, um aviso), e logo depois do vigia para a falha que ele acabou
  // de declarar já sair no sino. Ver lib/notificacoes/observador.ts.
  await observarAvisos().catch((e) => console.error("[fila] observador dos avisos falhou:", e));

  // A abertura por IA dos cortes (Higgsfield) anda aqui, antes da fila de
  // campanhas: o passo precisa de "olhar de novo daqui a um minuto", que é
  // exatamente o ritmo deste cron, e nunca da espera do SDK. Orçamento próprio
  // de 4 min (uma emenda leva perto de 40 s); a fila usa o que sobrar.
  const inicio = Date.now();
  const hf = await avancarAberturas({ orcamentoMs: 240_000 }).catch((e) => {
    console.error("[fila] abertura por IA falhou:", e);
    return null;
  });
  // O EDITOR COMPLETO (30/09): mesmo ritmo e mesmo desenho da abertura. O
  // diretor e as imagens de um corte levam perto de 2 min; o render é do
  // worker e volta por callback. Desligado sem MONTAGEM_NA_EDICAO=1 (null).
  const montagens = await avancarMontagens({ orcamentoMs: 240_000 }).catch((e) => {
    console.error("[fila] montagem falhou:", e);
    return null;
  });
  // A EDIÇÃO DO VÍDEO COMPLETO (30/09): mesmo desenho, um passo por passada
  // (fala, diretor por ondas de blocos, imagens, envio ao worker). Desligada
  // sem MONTAGEM_DO_COMPLETO=1 (null).
  const completos = await avancarMontagemDoCompleto({ orcamentoMs: 240_000 }).catch((e) => {
    console.error("[fila] edição do completo falhou:", e);
    return null;
  });
  // O ROTEIRO QUE PAROU NO MEIO (30/09) agora é do vigia, lá em cima: o
  // mesmo critério (seis minutos sem renovar o prazo), com teto de retomadas.

  // O GÊMEO DIGITAL (01/10): mesmo ritmo da abertura por IA. O cadastro
  // (foto, voz, autorização, clonagem) e os vídeos (fala, OmniHuman, junção,
  // entrada na esteira) andam um estado por passada; o gerador leva uns 8 min
  // por pedaço e só é consultado aqui, nunca esperado.
  const gemeos = await avancarGemeos({ orcamentoMs: 180_000 }).catch((e) => {
    console.error("[fila] gêmeo digital falhou:", e);
    return null;
  });

  // A revisão da Vera que morreu no meio volta a andar (ver retomarRevisoesParadas).
  const revisoes = await retomarRevisoesParadas().catch((e) => {
    console.error("[fila] retomar revisões falhou:", e);
    return null;
  });
  const r = await passadaDaFila({ orcamentoMs: Math.max(120_000, 780_000 - (Date.now() - inicio)) });

  // Rodou alguma coisa? Cutuca de novo, para a fila nao andar no ritmo do cron
  // quando ha trabalho acumulado. A passada seguinte que nao achar nada nao
  // cutuca ninguem, entao isto termina sozinho.
  if (r.rodados > 0) cutucar();

  return NextResponse.json({ ok: true, ...r, ...(vigia && (vigia.olhados || vigia.retomados.length) ? { vigia } : {}), aberturasIa: hf, montagens, completos, revisoes, gemeos, ...(regua && (regua.pulados || Object.keys(regua.enviados).length) ? { regua } : {}) });
}

// O cron da Vercel chama com GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
