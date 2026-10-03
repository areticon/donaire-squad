export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { midiaProduzida, ehPublica } from "@/lib/media/storage";
import { projetoVisivel } from "@/lib/equipe/conta";
import { soODono } from "@/lib/equipe/permissoes";

/**
 * O logo do projeto, que precisa ser VISIVEL.
 *
 * Nasceu em 17/09 de um defeito que parecia igual ao da foto de perfil e tinha
 * mecanismo diferente. O logo subia pelo navegador para o store PRIVADO
 * (`private.blob.vercel-storage.com`), e a tag `<img>` nao manda credencial
 * nenhuma: a URL respondia 403 para qualquer visitante, inclusive o dono.
 * Medido: o unico logo existente dava 403 aberto sem login.
 *
 * **Ele nunca ia aparecer, desde o primeiro upload.** Nao era regressao, era um
 * caminho que nunca funcionou e que ninguem tinha exercido ate o Bruno criar um
 * projeto de verdade.
 *
 * O logo vai para o store PUBLICO pelo mesmo criterio da foto de perfil e da
 * midia produzida: e arquivo que o navegador de quem ve precisa carregar, e ele
 * ainda vai entrar na capa do video e nas pecas publicadas. O manual e os
 * documentos continuam no store privado, porque sao material interno do
 * cliente, lido pela IA e nunca exibido.
 *
 * Upload pela funcao, e nao pelo navegador: 5 MB cabem no corpo com folga, e um
 * fluxo de duas pernas aqui seria complexidade sem ganho.
 */

const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TIPOS = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projeto = await prisma.project.findFirst({
    where: { id, ...projetoVisivel(userId) },
    select: { id: true, logoUrl: true, userId: true },
  });
  if (!projeto) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // O logo vale para a equipe inteira: só o dono troca (01/10, acabamento).
  const recusa = await soODono(userId, projeto, "trocar o logo da marca");
  if (recusa) return recusa;

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("logo");

  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo de imagem." }, { status: 400 });
  }
  if (!TIPOS.includes(arquivo.type)) {
    return NextResponse.json({ error: "O logo precisa ser PNG, SVG, JPG ou WEBP." }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: "O logo pode ter no máximo 5 MB." }, { status: 400 });
  }

  const destino = midiaProduzida();
  const blob = await put(`marca/${id}/logo/${arquivo.name}`, arquivo, {
    access: destino.access,
    token: destino.token,
    addRandomSuffix: true,
    contentType: arquivo.type,
  });

  await prisma.project.update({ where: { id }, data: { logoUrl: blob.url } });
  await apagarSeForNossa(projeto.logoUrl);

  return NextResponse.json({ ok: true, url: blob.url });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const projeto = await prisma.project.findFirst({
    where: { id, ...projetoVisivel(userId) },
    select: { id: true, logoUrl: true, userId: true },
  });
  if (!projeto) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // O logo vale para a equipe inteira: só o dono troca (01/10, acabamento).
  const recusa = await soODono(userId, projeto, "trocar o logo da marca");
  if (recusa) return recusa;

  await prisma.project.update({ where: { id }, data: { logoUrl: null } });
  await apagarSeForNossa(projeto.logoUrl);

  return NextResponse.json({ ok: true });
}

async function apagarSeForNossa(url: string | null | undefined) {
  if (!url || !url.includes("blob.vercel-storage.com")) return;
  try {
    const token = ehPublica(url) ? midiaProduzida().token : process.env.BLOB_READ_WRITE_TOKEN;
    await del(url, { token });
  } catch (e) {
    // Sobrar um arquivo orfao e melhor que derrubar a troca do logo, que ja foi
    // gravada e e a que a pessoa ve.
    console.error("[projects/logo] não consegui apagar o logo anterior", e);
  }
}
