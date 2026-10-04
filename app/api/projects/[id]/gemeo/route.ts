export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { contaDoPlano } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { cutucar } from "@/lib/fila/trabalhos";
import { cadastroParaTela, videoParaTela } from "@/lib/media/gemeo";
import {
  ErroDoCadastro,
  adicionarFoto,
  lerCadastro,
  listarVideos,
  geradorDoCadastro,
  registrarAutorizacao,
  registrarTreino,
  registrarVoz,
  removerFoto,
  revogarGemeo,
} from "@/lib/media/gemeo-servidor";
import { nomeDoDono, projetoVisivel } from "@/lib/equipe/conta";
import { conferirGemeoAgora, pedirLinkNovo } from "@/lib/media/gemeo-passo";
import { soODono } from "@/lib/equipe/permissoes";

/**
 * O CADASTRO DO GÊMEO DIGITAL (01/10/2026).
 *
 *   GET     o cadastro, os vídeos do gêmeo e o saldo, para a tela; com
 *           ?conferir=1 (03/10), pergunta antes ao gerador se o gêmeo
 *           terminou de treinar ou se a confirmação já valeu;
 *   POST    registra o que o navegador acabou de enviar ao storage (foto,
 *           voz, autorização) ou tira uma foto; "link-novo" (03/10) pede
 *           ao gerador outro link de confirmação, quando o anterior venceu;
 *   DELETE  revoga o gêmeo e apaga tudo (ver `revogarGemeo`).
 *
 * O arquivo nunca passa por aqui: vai do navegador direto ao store privado
 * (rota `upload`), como a gravação. Esta rota só grava a URL, e confere que
 * ela é deste projeto. Nada aqui chama fornecedor pago (o link novo de
 * confirmação não custa nada): o trabalho é do passo do cron, cutucado logo
 * depois de cada registro.
 */

async function dono(req: NextRequest, id: string) {
  const { userId } = await auth();
  if (!userId) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const project = await prisma.project.findFirst({ where: { id, ...projetoVisivel(userId) }, select: { id: true, name: true, userId: true } });
  if (!project) return { erro: NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 }) };
  return { userId, project };
}

/**
 * O CADASTRO É SÓ DO DONO (01/10, acabamento do acesso de equipe). Fotos, voz
 * e a autorização gravada são o rosto e a voz de uma pessoa, e revogar apaga a
 * voz clonada: nada disso o vendedor convidado decide. Ele pede vídeo ao gêmeo
 * já cadastrado (rota /videos), que é produzir conteúdo.
 */
const SO_O_DONO_DO_GEMEO = "cadastrar ou revogar o gêmeo digital deste projeto";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await dono(req, id);
  if ("erro" in d) return d.erro;
  // ?conferir=1 (03/10): a tela pergunta ao gerador agora, sem esperar o cron,
  // quando a pessoa volta da confirmação e enquanto o gêmeo treina ou espera.
  // Só consulta; quem é da equipe também pode (é leitura do estado).
  const conferir = req.nextUrl.searchParams.get("conferir") === "1";
  const [cadastro, videos, usuario] = await Promise.all([
    conferir ? conferirGemeoAgora(id).catch(() => lerCadastro(id)) : lerCadastro(id),
    listarVideos(id),
    prisma.user.findUnique({ where: { id: d.userId }, select: { creditsBalance: true, role: true, name: true } }),
  ]);
  // Saldo e acesso interno são da CONTA que paga (01/10, acesso de equipe).
  const conta = await prisma.user.findUnique({ where: { id: await contaDoPlano(d.userId) }, select: { creditsBalance: true, role: true } });
  return NextResponse.json({
    cadastro: cadastroParaTela(cadastro),
    videos: videos.map(videoParaTela),
    saldo: conta?.creditsBalance ?? 0,
    acessoInterno: conta?.role === "admin",
    nome: usuario?.name ?? "",
    projeto: d.project.name,
    // Quem gera os vídeos deste projeto (03/10): a tela mostra o preço dele.
    gerador: geradorDoCadastro(cadastro),
    // Para a tela esconder o cadastro e a revogação de quem é membro.
    equipe: d.project.userId === d.userId ? null : { dono: (await nomeDoDono(d.project.userId)) ?? "quem administra a conta" },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await dono(req, id);
  if ("erro" in d) return d.erro;
  const recusa = await soODono(d.userId, d.project, SO_O_DONO_DO_GEMEO);
  if (recusa) return recusa;
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    let cadastro;
    switch (corpo.acao) {
      case "foto":
        cadastro = await adicionarFoto(id, String(corpo.url ?? ""), typeof corpo.nome === "string" ? corpo.nome.slice(0, 120) : null);
        break;
      case "remover-foto":
        cadastro = await removerFoto(id, String(corpo.url ?? ""));
        break;
      case "voz":
        cadastro = await registrarVoz(id, {
          url: String(corpo.url ?? ""),
          origem: corpo.origem === "arquivo" ? "arquivo" : "gravada",
          contentType: typeof corpo.contentType === "string" ? corpo.contentType : null,
        });
        break;
      case "autorizacao":
        cadastro = await registrarAutorizacao(id, {
          url: String(corpo.url ?? ""),
          nome: String(corpo.nome ?? ""),
          userId: d.userId,
          segundos: typeof corpo.segundos === "number" ? Math.round(corpo.segundos) : null,
          contentType: typeof corpo.contentType === "string" ? corpo.contentType : null,
          userAgent: req.headers.get("user-agent"),
        });
        break;
      case "treino":
        cadastro = await registrarTreino(id, {
          url: String(corpo.url ?? ""),
          nome: String(corpo.nome ?? ""),
          userId: d.userId,
          segundos: typeof corpo.segundos === "number" ? Math.round(corpo.segundos) : null,
          contentType: typeof corpo.contentType === "string" ? corpo.contentType : null,
          userAgent: req.headers.get("user-agent"),
        });
        break;
      case "link-novo": {
        // "Pedir um link novo" (03/10): o link de confirmação do gerador venceu.
        const renovou = await pedirLinkNovo(id);
        if (!renovou) return NextResponse.json({ error: "Não consegui pedir um link novo agora. Tente de novo em alguns minutos." }, { status: 502 });
        return NextResponse.json({ cadastro: cadastroParaTela(await lerCadastro(id)) });
      }
      default:
        return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
    }
    // O passo do cron faz o trabalho (recorte, conversão, conferência,
    // clonagem); cutucar é só para não esperar o próximo minuto.
    cutucar();
    return NextResponse.json({ cadastro: cadastroParaTela(cadastro) });
  } catch (e) {
    if (e instanceof ErroDoCadastro) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(`[gemeo][${id}] cadastro:`, e);
    return NextResponse.json({ error: "Não consegui guardar agora. Tente de novo." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await dono(req, id);
  if ("erro" in d) return d.erro;
  const recusa = await soODono(d.userId, d.project, SO_O_DONO_DO_GEMEO);
  if (recusa) return recusa;
  const r = await revogarGemeo(id, "Revogado pelo cliente na tela do gêmeo.");
  return NextResponse.json({ ok: true, ...r });
}
