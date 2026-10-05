export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Trecho } from "@/lib/media/select-clips";
import { corpoAssinadoConfere, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { anexarCompletoAoQuadro } from "@/lib/media/completo-no-quadro";
import { concluirSoCompleto } from "@/lib/media/so-completo";
import { despacharPasso } from "@/lib/media/piloto-do-servidor";
import { apagarMidias, urlsDaMidia } from "@/lib/media/faxina";
import { marcarAberturasNaFila } from "@/lib/media/higgsfield-nos-cortes";
import { marcarMontagensNaFila, montagemNaEdicaoLigada } from "@/lib/media/montagem-nos-cortes";
import { marcarCompletoNaFila } from "@/lib/media/montagem-do-completo";
import { cutucar } from "@/lib/fila/trabalhos";
import { contarRetomadaExtra, lerParaRetomar, retomarEtapa } from "@/lib/media/vigia-das-etapas";
import { enviarRecorteDoTrecho } from "@/lib/media/refazer";
import type { Word } from "@/lib/media/transcribe";

/** O aviso que o worker manda no desligamento para o trabalho que não terminou. */
type AvisoDeReinicio = {
  reiniciado?: boolean;
  soCompleto?: boolean;
  soTrechos?: boolean;
  reCorte?: boolean;
  /** O aviso parcial (os cortes) já tinha saído: faltava só o completo. */
  parcialEnviado?: boolean;
  indices?: number[];
};

/**
 * O que fazer com cada tipo de trabalho interrompido pelo reinício do worker.
 * Nenhum caminho cobra crédito: /cortar, /refazer-completo e o recorte de um
 * trecho não debitam (a cobrança é na seleção e na aprovação do roteiro).
 */
async function tratarReinicio(id: string, status: string, aviso: AvisoDeReinicio): Promise<string> {
  // 1. O CORTE em andamento (o caso do incidente de 01/10): retoma pelo vigia,
  //    que conta a retomada e desiste na terceira. Ignora o prazo de propósito:
  //    o próprio worker disse que o trabalho morreu.
  //    Vale também com `parcialEnviado`: se o vídeo ainda está em "cutting", o
  //    aviso parcial não chegou ao app, e os cortes não existem aqui.
  if (status === "cutting" && !aviso.soTrechos && !aviso.soCompleto) {
    const linha = await lerParaRetomar(id);
    if (!linha) return "ignorado";
    return retomarEtapa(linha, "reiniciado");
  }
  // 2. O RECORTE de um trecho (ajuste do cliente ou refação do Vitor): o
  //    trecho já está gravado com as bordas novas e `refazendo`; manda de novo.
  if (aviso.reCorte && aviso.indices?.length) {
    const n = await contarRetomadaExtra(id, "recorte");
    after(() => reenviarRecortes(id, aviso.indices ?? [], n !== null));
    return n !== null ? "recorte-reenviado" : "recorte-desistiu";
  }
  // 3. O COMPLETO (o pedido só do completo, ou o corte cujos cortes já tinham
  //    chegado): pede o completo de novo, sem recortar nada.
  if (aviso.soCompleto || aviso.parcialEnviado) {
    const n = await contarRetomadaExtra(id, "completo");
    if (n === null) {
      // Terceira vez: a faixa do Gestor mostra "o vídeo completo não ficou
      // pronto" com o botão de refazer (ela lê "completo:" no erro).
      await prisma.videoJob.update({
        where: { id },
        data: { error: "completo: a montagem foi interrompida três vezes por reinício do servidor. Paramos de tentar sozinhos." },
      });
      return "completo-desistiu";
    }
    after(() => despacharPasso(id, "refazer-completo"));
    return "completo-relancado";
  }
  return "ignorado";
}

/**
 * Manda de novo ao worker o recorte dos trechos que estavam `refazendo`. Com
 * `reenviar` falso (terceira interrupção), só desliga o "refazendo" com uma
 * explicação, para o card não girar para sempre.
 */
async function reenviarRecortes(id: string, indices: number[], reenviar: boolean): Promise<void> {
  const v = await prisma.videoJob.findUnique({
    where: { id },
    select: {
      id: true, blobUrl: true, durationSec: true, projectId: true, clips: true, transcript: true,
      project: { select: { videoStyle: true, videoMusicUrl: true, videoTerms: true, videoEstiloEscolha: true, colorPalette: true } },
    },
  });
  if (!v) return;
  const trechos = (v.clips as unknown as Array<Trecho & { midia?: Record<string, unknown> | null }>) ?? [];
  for (const i of indices) {
    const t = trechos[i];
    if (!t?.midia?.refazendo) continue;
    try {
      if (!reenviar) throw new Error("O ajuste foi interrompido três vezes por reinício do servidor. Peça o ajuste de novo.");
      await enviarRecorteDoTrecho(
        {
          id: v.id,
          blobUrl: v.blobUrl,
          durationSec: v.durationSec ?? 0,
          projectId: v.projectId,
          palavras: (v.transcript as { words?: Word[] } | null)?.words ?? [],
          estilo: v.project?.videoStyle ?? null,
          musicaUrl: v.project?.videoMusicUrl ?? null,
          termos: v.project?.videoTerms ?? null,
          escolha: v.project?.videoEstiloEscolha ?? null,
          colorPalette: v.project?.colorPalette ?? null,
        },
        t,
        i
      );
    } catch (e) {
      const atuais = ((await prisma.videoJob.findUnique({ where: { id }, select: { clips: true } }))?.clips as unknown as Array<Trecho & { midia?: Record<string, unknown> | null }>) ?? [];
      if (atuais[i]?.midia) {
        atuais[i] = { ...atuais[i], midia: { ...atuais[i].midia, refazendo: false, erro: e instanceof Error ? e.message : "O ajuste não foi refeito." } };
        await prisma.videoJob.update({ where: { id }, data: { clips: atuais as never } });
      }
    }
  }
}

/**
 * O worker avisa que terminou de cortar.
 *
 * Sem sessão, como todo callback de fora, e autenticada pela assinatura sobre o
 * corpo inteiro. Assinar só o id do vídeo não bastaria aqui: o corpo traz as
 * URLs dos arquivos que viram post, e trocar uma URL faria o cliente publicar
 * no canal dele um vídeo que não é o dele.
 */

type MidiaProduzida = { url: string; bytes: number };

type TrechoCortado = {
  indice: number;
  duracaoSec?: number;
  legenda?: boolean;
  vertical?: MidiaProduzida;
  horizontal?: MidiaProduzida;
  capa?: MidiaProduzida;
  /** A pessoa recortada do quadro da capa (PNG), para a capa composta em código (30/09). */
  recorte?: MidiaProduzida & { rosto?: unknown; notas?: unknown };
  enquadramento?: {
    cena: string;
    vertical: string;
    motivo: string;
    pessoa?: { x: number; y: number; w: number; h: number } | null;
    tela?: { x: number; y: number; w: number; h: number } | null;
  };
  erro?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const corpoCru = await req.text();

  if (!corpoAssinadoConfere(corpoCru, req.headers.get(CABECALHO_ASSINATURA))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const video = await prisma.videoJob.findUnique({
    where: { id },
    select: { id: true, status: true, clips: true, completoUrl: true, error: true },
  });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  // O VÍDEO CANCELADO PELO CLIENTE (05/10): o worker não tem botão de parar,
  // então o corte pedido antes do cancelamento chega aqui depois. Vai para o
  // lixo: nada é gravado, nenhum card nasce. 200 para o worker não repetir.
  if (video.status === "cancelado") {
    console.log(`[cortar-callback][${id}] vídeo cancelado pelo cliente; o resultado do worker foi descartado.`);
    return NextResponse.json({ ok: true, ignorado: "cancelado" });
  }

  // O WORKER REINICIOU NO MEIO (01/10): no desligamento por deploy ele espera
  // o que está rodando terminar e, para o que não terminou a tempo, manda este
  // aviso em vez de morrer calado. O app retoma NA HORA, em vez de esperar o
  // prazo inteiro do corte (foi mais de uma hora no vídeo do Bruno).
  let previa: AvisoDeReinicio | null = null;
  try {
    previa = JSON.parse(corpoCru) as AvisoDeReinicio;
  } catch {
    previa = null;
  }
  if (previa?.reiniciado) {
    const feito = await tratarReinicio(id, video.status, previa);
    return NextResponse.json({ ok: true, reiniciado: feito });
  }

  // O COMPLETO ATRASADO: desde 01/09 o worker avisa em duas fases (os cortes
  // na hora, o completo quando terminar de codificar). Se o vídeo já saiu de
  // "cutting" pelo aviso parcial, este segundo aviso só anexa o completo e o
  // põe no quadro; nada mais é tocado, então corte aprovado não é sobrescrito.
  if (video.status !== "cutting") {
    let atrasado: {
      ok?: boolean;
      reCorte?: boolean;
      trechos?: TrechoCortado[];
      completo?: { url: string; bytes: number } | null;
      erros?: string[];
    } = {};
    try {
      atrasado = JSON.parse(corpoCru);
    } catch {
      return NextResponse.json({ ok: false, error: "Corpo não é JSON" });
    }
    // O RE-CORTE de um trecho (ajuste pedido pelo cliente): funde SÓ a mídia
    // daquele índice. Aprovação, destinos e posts ficam como estavam, porque o
    // cliente ajustou o vídeo, não a decisão dele sobre o vídeo.
    if (atrasado.reCorte && atrasado.ok && Array.isArray(atrasado.trechos)) {
      const atuais = (video.clips as unknown as Array<Trecho & { midia?: Record<string, unknown> | null }>) ?? [];
      const porIndice = new Map(atrasado.trechos.map((t) => [t.indice, t]));

      // Os arquivos do trecho ANTERIOR, guardados antes da fusao os apagar da
      // vista. Este era o segundo gerador de orfao da plataforma: o re-corte
      // sobrescreve `vertical` e `horizontal` com os arquivos novos, e os
      // antigos ficavam no storage sem nada apontando para eles. Medido em
      // 18/09: 14 GB de corte substituido. Ver lib/media/faxina.ts.
      const substituidos: string[] = [];
      for (const [i, t] of atuais.entries()) {
        const novo = porIndice.get(i);
        if (!novo) continue;
        // So conta como substituido o que o worker de fato devolveu: se ele
        // nao mandou `horizontal`, a fusao preserva o antigo em `capa` e o
        // horizontal vira null, entao apagar o horizontal antigo aqui seria
        // apagar um arquivo que a tela ainda pode pedir.
        const antigas = urlsDaMidia({
          vertical: novo.vertical ? t.midia?.vertical : null,
          horizontal: novo.horizontal ? t.midia?.horizontal : null,
          capa: novo.capa ? t.midia?.capa : null,
        });
        substituidos.push(...antigas);
      }

      const fundidos = atuais.map((t, i) => {
        const c = porIndice.get(i);
        if (!c) return t;
        return {
          ...t,
          midia: {
            ...(t.midia ?? {}),
            vertical: c.vertical ?? null,
            horizontal: c.horizontal ?? null,
            capa: c.capa ?? (t.midia?.capa as unknown) ?? null,
            recorte: c.recorte ?? (c.capa ? null : ((t.midia as { recorte?: unknown } | undefined)?.recorte ?? null)),
            enquadramento: c.enquadramento ?? (t.midia?.enquadramento as unknown) ?? null,
            legenda: c.legenda ?? false,
            erro: c.erro ?? null,
            refazendo: false,
          },
        };
      });
      await prisma.videoJob.update({ where: { id }, data: { clips: fundidos as never } });
      // Depois de gravar, nunca antes: se o update falhar, o banco continua
      // apontando para os arquivos antigos e eles precisam existir.
      if (substituidos.length > 0) await apagarMidias(substituidos, `reCorte/${id}`);
      // Refação que o Vitor fez sozinho porque a Vera reprovou: a mídia nova
      // chegou, e a Vera revisa de novo. O ajuste pedido pelo CLIENTE não
      // passa por aqui (o estado dele não é "refazendo"): quem decidiu foi ele.
      const refeitoPelaVera = atuais.some(
        (t, i) =>
          porIndice.has(i) &&
          (t as { revisaoDoCorte?: { estado?: string } }).revisaoDoCorte?.estado === "refazendo"
      );
      if (refeitoPelaVera) after(() => despacharPasso(id, "revisar-cortes"));
      // O EDITOR COMPLETO (30/09): o trecho refeito chegou cru, e a montagem
      // dele recomeça (a origem mudou). Desligado sem MONTAGEM_NA_EDICAO=1.
      if (montagemNaEdicaoLigada()) {
        const indices = [...porIndice.keys()];
        after(async () => {
          const n = await marcarMontagensNaFila(id, indices).catch((e) => {
            console.error(`[montagem][${id}] marcar no re-corte falhou:`, e);
            return 0;
          });
          if (n > 0) cutucar();
        });
      }
      return NextResponse.json({ ok: true, reCorte: true });
    }
    // O COMPLETO QUE FALHOU tem que deixar rastro.
    //
    // Em 02/09 o passe 2 morreu, o worker mandou o aviso final com
    // `completo: null` e uma lista de erros, e este ramo devolvia
    // `{ ok: true, ignorado }`: a falha sumiu do log, do banco e da tela, e
    // ninguem soube de 800 segundos de trabalho perdido. Erro tecnico vai para
    // o log, e o banco guarda o suficiente para a tela avisar.
    if (!atrasado.completo?.url && atrasado.erros?.length) {
      console.error(
        `[cortar-callback][${id}] o completo nao veio: ${atrasado.erros.join("; ")}`
      );
      await prisma.videoJob.update({
        where: { id },
        data: { error: atrasado.erros.join("; ").slice(0, 900) },
      });
      return NextResponse.json({ ok: true, completoFalhou: true });
    }

    // Anexa o completo NOVO também quando já existe um (30/09): a rodada
    // refeita deixa o antigo no ar até este chegar, e só então troca. Antes a
    // condição era "não há completo", e a rodada refeita dependia de o aviso
    // parcial ter APAGADO o antigo; quando o novo falhou, o cliente ficou sem
    // nenhum dos dois.
    if (atrasado.completo?.url && atrasado.completo.url !== video.completoUrl) {
      const anterior = video.completoUrl;
      await prisma.videoJob.update({
        where: { id },
        data: {
          completoUrl: atrasado.completo.url,
          completoBytes: atrasado.completo.bytes ? BigInt(atrasado.completo.bytes) : null,
          // O completo e a ultima peca a chegar no caso normal, entao e aqui
          // que a esteira termina de verdade.
          finishedAt: new Date(),
          // O erro de uma tentativa anterior do completo deixa de ser verdade
          // agora que ele chegou (ver "Estado que sobrevive ao fato").
          ...(video.error?.includes("completo:") ? { error: null } : {}),
        },
      });
      // Depois de gravar, nunca antes: o card do quadro aponta para a rota de
      // mídia, que lê `completoUrl` na hora, então o arquivo velho só pode
      // sumir quando nada mais o resolve.
      if (anterior) await apagarMidias([anterior], `completo/${id}`);
      await anexarCompletoAoQuadro(id).catch((e) =>
        console.error(`[cortar-callback][${id}] completo no quadro falhou:`, e)
      );
      // A capa do vídeo inteiro nasce do mesmo quadro-fonte dos cortes; gerar
      // agora, e não quando a aba acordar, é o que tira os últimos minutos.
      after(() => despacharPasso(id, "capas-do-completo"));
      // A EDIÇÃO do completo (30/09) entra na fila; o cron da fila anda com
      // ela. Só marca, e só com MONTAGEM_DO_COMPLETO=1.
      after(() =>
        marcarCompletoNaFila(id).catch((e) => console.error(`[cortar-callback][${id}] edição do completo não entrou na fila:`, e))
      );
      return NextResponse.json({ ok: true, completoAnexado: true });
    }
    return NextResponse.json({ ok: true, ignorado: `status ${video.status}` });
  }

  let corpo: {
    ok?: boolean;
    erro?: string;
    /** O aviso parcial (só os cortes), antes do completo. */
    parcial?: boolean;
    trechos?: TrechoCortado[];
    avisoDeQualidade?: string;
    completo?: MidiaProduzida | null;
    soTrechos?: boolean;
    capaFonte?: (MidiaProduzida & { instante?: number; motivo?: string }) | null;
    erros?: string[];
  };
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo não é JSON" });
  }

  if (!corpo.ok) {
    await prisma.videoJob.update({
      where: { id },
      data: {
        status: "failed",
        startedAt: null,
        error: corpo.erro ?? "O worker não conseguiu cortar o vídeo.",
      },
    });
    // 200 de propósito: repetir o aviso não conserta corte que falhou, e o erro
    // já está gravado onde o cliente vê.
    return NextResponse.json({ ok: true });
  }

  // SÓ O VÍDEO COMPLETO (02/10): o roteiro foi aprovado com zero cortes. O
  // aviso parcial (sem cortes) não muda nada: o vídeo continua "cutting" até
  // o completo chegar, para nenhuma tela oferecer "Escrever os posts" de
  // cortes que não existem. Com o completo, o vídeo fica pronto, entra no
  // quadro (o card do completo e o rascunho do YouTube) e na edição.
  if (!((video.clips as unknown as Trecho[]) ?? []).length) {
    const r = await concluirSoCompleto(id, video, corpo);
    if (r.disparar) {
      after(() => despacharPasso(id, "capas-do-completo"));
      after(() =>
        marcarCompletoNaFila(id).catch((e) => console.error(`[cortar-callback][${id}] edição do completo não entrou na fila:`, e))
      );
    }
    return NextResponse.json({ ok: true, soCompleto: r.resultado });
  }

  // As mídias entram NOS TRECHOS que já existem, em vez de virar uma lista
  // paralela. O trecho já carrega título, ideia e os textos das redes; separar
  // a mídia disso obrigaria a tela a casar duas listas por índice, que é
  // exatamente o tipo de acoplamento que quebra quando um trecho falha.
  const trechos = (video.clips as unknown as Trecho[]) ?? [];
  const porIndice = new Map((corpo.trechos ?? []).map((t) => [t.indice, t]));

  const atualizados = trechos.map((t, i) => {
    const corte = porIndice.get(i);
    if (!corte) return t;
    return {
      ...t,
      midia: {
        vertical: corte.vertical ?? null,
        horizontal: corte.horizontal ?? null,
        capa: corte.capa ?? null,
        recorte: corte.recorte ?? null,
        enquadramento: corte.enquadramento ?? null,
        // Se a legenda palavra a palavra chegou no arquivo. Vale registrar
        // porque ela pode falhar sozinha sem derrubar o corte, e sem este campo
        // a diferença entre "corte legendado" e "corte mudo" só apareceria
        // assistindo, que é tarde demais.
        legenda: corte.legenda ?? false,
        erro: corte.erro ?? null,
      },
      // Nasce marcado para publicar, porque o padrão útil é "quero tudo" e o
      // trabalho do cliente deve ser DESmarcar o que não quer, não marcar sete
      // caixinhas para conseguir o que ele já pediu ao subir o vídeo.
      publicar: corte.erro ? false : true,
      destinos: corte.erro ? [] : ["youtube_shorts", "instagram_reels"],
    };
  });

  const comMidia = atualizados.filter(
    (t) => (t as { midia?: { vertical?: unknown } }).midia?.vertical
  ).length;

  // O aviso de qualidade do worker (janela da pessoa pequena demais para corte
  // nitido) entra no DIAGNOSTICO, que e o campo que o cliente le. Anexado ao
  // que o especialista ja escreveu, e nao por cima: os dois falam de coisas
  // diferentes e o cliente merece as duas.
  const aviso = corpo.avisoDeQualidade?.trim();
  const diagnosticoAtual = (
    await prisma.videoJob.findUnique({ where: { id }, select: { diagnostico: true } })
  )?.diagnostico;
  const diagnostico = aviso
    ? [diagnosticoAtual, aviso].filter(Boolean).join("\n\n")
    : undefined;

  await prisma.videoJob.update({
    where: { id },
    data: {
      ...(diagnostico ? { diagnostico } : {}),
      status: comMidia > 0 ? "cut" : "failed",
      startedAt: null,
      attempts: comMidia > 0 ? 0 : undefined,
      clips: atualizados as never,
      // Num recorte PARCIAL (`soTrechos`, que refaz um corte so) o worker nao
      // produz completo, e escrever `null` aqui apagaria a URL de um video
      // completo que existe e ja esta no quadro. Lido no codigo em 08/09,
      // antes de acontecer com o vídeo de alguém.
      //
      // E desde 30/09 o aviso SEM completo (o parcial, que é o caso normal)
      // também não escreve nada aqui: no vídeo de teste refeito em 29/09 o
      // parcial gravou `null` por cima do completo que estava no quadro, o
      // novo falhou no worker, e o cliente ficou sem vídeo completo nenhum. O
      // antigo só sai quando o novo chega (ramo do completo atrasado, acima).
      ...(corpo.soTrechos || !corpo.completo?.url
        ? {}
        : {
            completoUrl: corpo.completo.url,
            completoBytes: corpo.completo.bytes ? BigInt(corpo.completo.bytes) : null,
          }),
      // O quadro que o squad escolheu como melhor rosto do vídeo inteiro. É a
      // base de TODAS as capas: as dos cortes e a do vídeo completo. Guardar por
      // vídeo, e não por trecho, é o que resolve o caso do Bruno, em que os
      // trechos bons caíam todos em tela compartilhada.
      ...(corpo.soTrechos ? {} : { capaFonteUrl: corpo.capaFonte?.url ?? null }),
      error:
        comMidia > 0
          ? (corpo.erros?.length ? corpo.erros.join("; ") : null)
          : "Nenhum corte foi produzido.",
    },
  });

  // O completo de uma rodada anterior, trocado por um novo no mesmo aviso: o
  // arquivo velho sai do storage agora que nada aponta para ele (faxina.ts).
  if (!corpo.soTrechos && corpo.completo?.url && video.completoUrl && video.completoUrl !== corpo.completo.url) {
    await apagarMidias([video.completoUrl], `completo/${id}`);
  }

  // Cortes no ar: capas, posts e cards do Vitor saem do servidor, agora. No
  // teste de 04/09 este intervalo (cortes prontos aos 6,9 min, próximo passo
  // aos 12,5 min) era o maior buraco da esteira, e era a aba escondida do
  // cliente segurando o relógio.
  if (comMidia > 0) after(() => despacharPasso(id, "preparar"));
  // O completo que chegou junto dos cortes (aviso único) também entra na
  // fila da edição do completo (desligada sem MONTAGEM_DO_COMPLETO=1).
  if (!corpo.soTrechos && corpo.completo?.url) {
    after(() =>
      marcarCompletoNaFila(id).catch((e) => console.error(`[cortar-callback][${id}] edição do completo não entrou na fila:`, e))
    );
  }
  // A Vera assiste cada corte em paralelo com o `preparar`, e não depois
  // dele: o que ela reprovar já volta ao worker enquanto capas e textos são
  // escritos, em vez de esperar a semana inteira ficar pronta.
  if (comMidia > 0 && !corpo.soTrechos) after(() => despacharPasso(id, "revisar-cortes"));
  // A abertura por IA da Higgsfield (item 9): aqui só MARCA os cortes, uma
  // escrita barata; quem cobra, pede, acompanha e emenda é o passo do cron da
  // fila (lib/media/higgsfield-nos-cortes.ts). Desligada sem
  // HIGGSFIELD_NA_EDICAO=1 ou sem movimento/efeito de IA na escolha do projeto.
  // O EDITOR COMPLETO (30/09, lib/media/montagem-nos-cortes.ts): com
  // MONTAGEM_NA_EDICAO=1, cada corte entra na fila da montagem (diretor,
  // colagens e Remotion), e a abertura por IA antiga NÃO é marcada: as cenas
  // geradas passam a entrar pelo diretor. Vale também para o recorte parcial
  // (`soTrechos`), com só os trechos deste aviso.
  if (comMidia > 0 && montagemNaEdicaoLigada()) {
    const indices = (corpo.trechos ?? []).filter((t) => t.vertical && !t.erro).map((t) => t.indice);
    after(async () => {
      const n = await marcarMontagensNaFila(id, indices).catch((e) => {
        console.error(`[montagem][${id}] marcar falhou:`, e);
        return 0;
      });
      if (n > 0) cutucar();
    });
  } else if (comMidia > 0 && !corpo.soTrechos) {
    after(async () => {
      const marcados = await marcarAberturasNaFila(id).catch((e) => {
        console.error(`[higgsfield][${id}] marcar falhou:`, e);
        return 0;
      });
      if (marcados > 0) cutucar();
    });
  }

  return NextResponse.json({ ok: true, trechos: comMidia });
}
