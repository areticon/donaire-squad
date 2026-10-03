export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { midiaProduzida, ehPublica } from "@/lib/media/storage";

/**
 * A foto de perfil que a PESSOA escolhe.
 *
 * Nasceu em 17/09 de um defeito: a foto importada do provedor social some
 * sozinha. O LinkedIn guarda a foto numa URL assinada com prazo, e ela expira
 * (a do Bruno venceu em 10/09 e passou a responder 403). Enquanto a foto vier
 * de uma URL de terceiro, ela vai quebrar de novo, em data que ninguém escolhe.
 *
 * Por isso a foto enviada aqui vai para o NOSSO store público: ela é servida
 * direto pelo CDN, não expira e não depende de o provedor continuar de bom
 * humor. O store publico e o mesmo da midia produzida, e pelo mesmo motivo: e
 * um arquivo que o navegador de quem ve precisa carregar.
 *
 * O upload passa pela função, e não pelo navegador como o do vídeo, porque
 * foto de perfil é pequena por definição: o teto de 2 MB cabe com folga no
 * limite de corpo da Vercel, e um fluxo de duas pernas aqui seria complexidade
 * sem ganho.
 */

const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/webp"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("foto");

  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "Envie um arquivo de imagem." }, { status: 400 });
  }
  if (!TIPOS.includes(arquivo.type)) {
    return NextResponse.json(
      { error: "A foto precisa ser PNG, JPG ou WEBP." },
      { status: 400 }
    );
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: "A foto pode ter no máximo 2 MB." }, { status: 400 });
  }

  const anterior = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });

  const destino = midiaProduzida();
  const extensao = arquivo.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const blob = await put(`avatar/${userId}/foto.${extensao}`, arquivo, {
    access: destino.access,
    token: destino.token,
    // Sem sufixo aleatório a segunda foto sobrescreveria a primeira na mesma
    // URL, e o navegador seguiria mostrando a antiga por cache.
    addRandomSuffix: true,
    contentType: arquivo.type,
  });

  await prisma.user.update({ where: { id: userId }, data: { image: blob.url } });

  // A foto antiga só é apagada se for NOSSA. URL do provedor social não é nossa
  // para apagar, e tentar removê-la daria erro em toda troca de foto.
  await apagarSeForNossa(anterior?.image);

  return NextResponse.json({ ok: true, url: blob.url });
}

/** Tira a foto e devolve a pessoa para as iniciais. */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const atual = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });

  await prisma.user.update({ where: { id: userId }, data: { image: null } });
  await apagarSeForNossa(atual?.image);

  return NextResponse.json({ ok: true });
}

async function apagarSeForNossa(url: string | null | undefined) {
  if (!url || !url.includes("blob.vercel-storage.com")) return;
  try {
    const destino = ehPublica(url) ? midiaProduzida() : { token: process.env.BLOB_READ_WRITE_TOKEN };
    await del(url, { token: destino.token });
  } catch (e) {
    // Falhar aqui não pode derrubar a troca de foto: a foto nova já está
    // gravada e é ela que a pessoa vê. Sobra um arquivo órfão, não um erro.
    console.error("[account/foto] não consegui apagar a foto anterior", e);
  }
}
