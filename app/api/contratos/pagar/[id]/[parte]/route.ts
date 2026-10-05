export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { baseDoApp, ehParteDoPagamento, linkValido } from "@/lib/contratos/links-de-pagamento";
import { RecusaDoLink, contratoDoLink, resumoDaCondicao, sessaoDasParcelas } from "@/lib/contratos/parcelado";

type Ctx = { params: Promise<{ id: string; parte: string }> };

/**
 * O LINK DO CARTÃO DAS PARCELAS (05/10/2026). Na condição "1ª parcela no Pix,
 * demais no cartão de crédito recorrente", o Pix é feito por fora e registrado
 * com o comprovante no gestor; este link é só o do cartão. Ele não vence: cada
 * clique abre uma sessão nova do Stripe no valor certo e redireciona para ela.
 * Público (o prospect ainda não tem senha), protegido pela assinatura `t`.
 * Ver lib/contratos/links-de-pagamento.ts e lib/contratos/parcelado.ts.
 *
 * Quando não há o que fazer (cartão já cadastrado, contrato não assinado ou
 * cancelado), responde uma página curta dizendo o que fazer.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id, parte } = await params;
  const t = req.nextUrl.searchParams.get("t");
  if (!ehParteDoPagamento(parte) || !linkValido(id, parte, t)) return pagina("Link inválido", "Este link de pagamento não é válido. Confira se ele foi copiado inteiro do e-mail do contrato.", 404);
  const c = await contratoDoLink(id);
  if (!c) return pagina("Link inválido", "Não encontramos este contrato.", 404);
  const n = String(c.numero).padStart(4, "0");
  const condicao = resumoDaCondicao(c);

  // A volta do Stripe depois de cadastrar o cartão.
  if (req.nextUrl.searchParams.get("ok") === "1") {
    return pagina("Cartão cadastrado", `As parcelas do contrato nº ${n} estão programadas no seu cartão. Com a 1ª parcela (o Pix) confirmada pela nossa equipe, a sua conta é ativada e chega o e-mail de boas-vindas.`);
  }

  try {
    return NextResponse.redirect(await sessaoDasParcelas(c, baseDoApp()), 303);
  } catch (e) {
    if (e instanceof RecusaDoLink) return pagina(`Contrato nº ${n}`, `${e.message}${condicao ? ` Condição do contrato: ${condicao}.` : ""}`);
    console.error(`[contratos] link do cartão do contrato ${id} falhou:`, e);
    return pagina("Não deu certo agora", "Não conseguimos abrir o cadastro do cartão neste momento. Tente de novo em alguns minutos ou responda ao e-mail do contrato.", 502);
  }
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Uma página curta, sem layout do app (quem chega aqui pode não ter conta ativa). */
function pagina(titulo: string, texto: string, status = 200) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)} | Demandou</title>
<style>:root{--bg:#faf8f5;--card:#fff;--txt:#1d1b19;--sub:#6b6560;--borda:#e7e2dc;--marca:#f26b1d}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--card:#1d1b19;--txt:#f4f1ed;--sub:#a9a29b;--borda:#2e2a27}}
body{margin:0;background:var(--bg);color:var(--txt);font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
main{max-width:30rem;margin:0 auto;padding:3rem 1rem}
.marca{font-weight:600;letter-spacing:-.04em;font-size:1.25rem;text-align:center;margin-bottom:2rem}.marca span{color:var(--marca)}
.cartao{background:var(--card);border:1px solid var(--borda);border-radius:1rem;padding:1.5rem}
h1{font-size:1.4rem;margin:0 0 .75rem}p{color:var(--sub);line-height:1.6;margin:0}</style></head>
<body><main><div class="marca">demandou<span>.</span></div><div class="cartao"><h1>${escapar(titulo)}</h1><p>${escapar(texto)}</p></div></main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
