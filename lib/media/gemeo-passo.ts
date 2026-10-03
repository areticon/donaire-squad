import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { lerMidia, midiaPrivada } from "@/lib/media/storage";
import { apagarMidias } from "@/lib/media/faxina";
import { gravarCustoDeVideo } from "@/lib/media/usage";
import { assinarCorpo, CABECALHO_ASSINATURA } from "@/lib/media/worker-token";
import { despacharPasso } from "@/lib/media/piloto-do-servidor";
import { transcribeBlob } from "@/lib/media/transcribe";
import { cutucar } from "@/lib/fila/trabalhos";
import {
  DOLAR_POR_SEGUNDO_DO_GERADOR,
  FOLGA_DO_VIDEO_SOBRE_A_FALA,
  MODELO_DO_GERADOR,
  SEGUNDOS_MAXIMOS_DO_PEDACO,
  SEGUNDOS_MINIMOS_DA_VOZ,
  conferirFalaDaAutorizacao,
  creditosDoGemeo,
  duracaoFalada,
  partirAoMeio,
  type AvaliacaoDaFoto,
  type PedacoDoGemeo,
  type VideoDoGemeo,
} from "@/lib/media/gemeo";
import {
  ErroDoFornecedor,
  apagarVoz,
  clonarVoz,
  dubleLigado,
  duracaoDoMp3,
  estadoNoFal,
  falar,
  pedirOmniHuman,
  resultadoNoFal,
  subirNoFal,
} from "@/lib/media/gemeo-fornecedores";
import {
  TIPO_REVOGACAO,
  agora,
  cobradoDoVideo,
  estornarVideo,
  lerCadastro,
  lerVideo,
  mudarCadastro,
  mudarMemoria,
  mudarVideo,
  type CadastroGuardado,
} from "@/lib/media/gemeo-servidor";

/**
 * O PASSO DO GÊMEO DIGITAL NO CRON DA FILA (01/10/2026).
 *
 * Mesmo desenho da abertura por IA (`higgsfield-nos-cortes.ts`): cada passada
 * do cron de um minuto avança um estado e grava; ninguém espera fornecedor
 * dentro da função. O OmniHuman leva uns 8 minutos por pedaço, e a função só
 * envia, guarda o request_id e volta no minuto seguinte para perguntar.
 *
 * Duas frentes:
 *
 * 1. O CADASTRO: escolher e recortar a foto (worker), converter e medir a voz
 *    (worker), conferir a autorização (transcrição) e só ENTÃO clonar a voz
 *    (ElevenLabs). Nada é clonado antes da autorização valer. A chave sem
 *    permissão de vozes vira espera ("sem-permissao") e é tentada de novo a
 *    cada 30 min: quando o Bruno liberar, o cadastro termina sozinho.
 * 2. O VÍDEO: falar cada pedaço com a voz clonada, mandar ao gerador, esperar,
 *    juntar no worker (por callback) e criar o VideoJob, que segue a esteira
 *    como qualquer gravação enviada.
 *
 * Toda chamada a fornecedor pago mora aqui (ou em quem este passo chama), e
 * não nas rotas da tela: a tela só grava pedidos. É o que deixa testar a tela
 * sem gastar, e o dublê (GEMEO_DUBLE=1) responde por todos os fornecedores.
 */

const PASSO_MORTO_MS = 10 * 60_000;
const PRAZO_PARA_ENVIAR_MS = 45 * 60_000;
const PRAZO_DO_GERADOR_MS = 60 * 60_000;
const PRAZO_DA_JUNCAO_MS = 20 * 60_000;
const ESPERA_SEM_PERMISSAO_MS = 30 * 60_000;
const ESPERA_DE_FALHA_MS = 10 * 60_000;
/** ElevenLabs no plano Creator, por caractere, para o registro de custo. */
const DOLAR_POR_CARACTERE = 0.00022;

const idade = (iso?: string | null) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ─────────────────────────────── worker ───────────────────────────────

async function chamarWorker<T>(rota: string, corpo: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const base = process.env.VIDEO_WORKER_URL;
  if (!base) throw new Error("VIDEO_WORKER_URL não configurado");
  const texto = JSON.stringify(corpo);
  const r = await fetch(`${base.replace(/\/$/, "")}/${rota}`, {
    method: "POST",
    headers: { "content-type": "application/json", [CABECALHO_ASSINATURA]: assinarCorpo(texto) },
    body: texto,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(`worker /${rota} respondeu ${r.status}: ${String(dados.error ?? "").slice(0, 200)}`);
  return dados as T;
}

function baseDoApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
}

// ─────────────────────────────── 1. o cadastro ───────────────────────────────

async function cuidarDaFoto(projectId: string, c: CadastroGuardado): Promise<void> {
  const f = c.foto;
  if (!f || !c.fotos.length) return;
  const vez = f.estado === "preparando" || (f.estado === "falhou" && (f.tentativas ?? 0) < 3 && idade(f.desde) > 2 * 60_000);
  if (!vez) return;
  const origem = f.origem;
  let resultado: { foto: { url: string } | null; escolhida: number | null; avaliacoes: AvaliacaoDaFoto[] } | null = null;
  let erro: string | null = null;
  try {
    resultado = await chamarWorker("rosto-do-gemeo", { fotos: c.fotos.map((x) => x.url), chave: `gemeo/${projectId}/foto-do-gerador.jpg` }, 150_000);
  } catch (e) {
    erro = mensagem(e);
  }
  let substituida = null as string | null;
  await mudarCadastro(projectId, (atual) => {
    // As fotos mudaram enquanto o worker olhava: este resultado já não vale, e
    // o recorte que ele subiu vira lixo (achado na prova de 01/10: um recorte
    // órfão sobrou depois da revogação).
    if (!atual?.foto || atual.foto.origem !== origem) {
      substituida = resultado?.foto?.url ?? null;
      return undefined;
    }
    if (erro || !resultado) {
      return { ...atual, foto: { ...atual.foto, estado: "falhou", desde: agora(), motivo: "Não consegui preparar a foto agora. Tento de novo em instantes.", tentativas: (atual.foto.tentativas ?? 0) + 1 } };
    }
    if (atual.foto.url && atual.foto.url !== resultado.foto?.url) substituida = atual.foto.url;
    if (!resultado.foto) {
      const motivos = resultado.avaliacoes.map((a) => a.motivo).filter(Boolean);
      return {
        ...atual,
        foto: { estado: "recusada", desde: agora(), origem, url: null, escolhida: null, avaliacoes: resultado.avaliacoes, motivo: `Nenhuma foto serviu. ${[...new Set(motivos)].join(" ")}`.trim() },
      };
    }
    return { ...atual, foto: { estado: "pronta", desde: agora(), origem, url: resultado.foto.url, escolhida: resultado.escolhida, avaliacoes: resultado.avaliacoes, motivo: null } };
  });
  if (erro) console.error(`[gemeo][${projectId}] foto:`, erro);
  if (substituida) await apagarMidias([substituida], `gemeo-foto-antiga/${projectId}`);
}

async function conferirAutorizacao(projectId: string, c: CadastroGuardado): Promise<void> {
  const a = c.autorizacao;
  if (!a || a.estado !== "conferindo") return;
  if ((a.tentativas ?? 0) > 0 && idade(a.desde) < 2 * 60_000) return;
  let transcricao: string | null = null;
  let erro: string | null = null;
  try {
    transcricao = dubleLigado()
      ? a.texto
      : (
          await transcribeBlob(a.videoUrl, {
            language: "pt",
            contentType: a.contentType ?? undefined,
            keyterms: a.nome.split(" ").filter((p) => p.length >= 3),
            usage: { projectId, operation: "gemeo_autorizacao" },
          })
        ).text;
  } catch (e) {
    erro = mensagem(e);
  }
  await mudarCadastro(projectId, (atual) => {
    const x = atual?.autorizacao;
    if (!x || x.videoUrl !== a.videoUrl || x.estado !== "conferindo") return undefined;
    if (erro || transcricao === null) {
      const tentativas = (x.tentativas ?? 0) + 1;
      return {
        ...atual!,
        autorizacao:
          tentativas >= 3
            ? { ...x, estado: "recusada", desde: agora(), tentativas, motivo: "Não consegui ouvir a gravação. Grave de novo, num lugar com menos barulho." }
            : { ...x, desde: agora(), tentativas },
      };
    }
    const r = conferirFalaDaAutorizacao(transcricao, x.nome);
    return {
      ...atual!,
      autorizacao: {
        ...x,
        estado: r.ok ? "valida" : "recusada",
        desde: agora(),
        transcricao: transcricao.slice(0, 2000),
        motivo: r.ok ? null : `Não ouvi ${r.faltou.join(" e ")} na gravação. Grave de novo lendo a frase inteira, em voz alta.`,
      },
    };
  });
  if (erro) console.error(`[gemeo][${projectId}] autorização:`, erro);
}

async function cuidarDaVoz(projectId: string, c: CadastroGuardado): Promise<void> {
  let v = c.voz;
  if (!v) return;

  if (v.estado === "convertendo") {
    if ((v.tentativas ?? 0) > 0 && idade(v.desde) < 2 * 60_000) return;
    let feito: { voz: { url: string }; duracaoSec: number } | null = null;
    let erro: string | null = null;
    try {
      feito = await chamarWorker("voz-do-gemeo", { audioUrl: v.amostraUrl, chave: `gemeo/${projectId}/voz.mp3` }, 150_000);
    } catch (e) {
      erro = mensagem(e);
    }
    const amostra = v.amostraUrl;
    const autorizada = c.autorizacao?.estado === "valida";
    const novo = await mudarCadastro(projectId, (atual) => {
      const x = atual?.voz;
      if (!x || x.amostraUrl !== amostra || x.estado !== "convertendo") return undefined;
      if (erro || !feito) {
        const tentativas = (x.tentativas ?? 0) + 1;
        return { ...atual!, voz: tentativas >= 3 ? { ...x, estado: "falhou", desde: agora(), tentativas, motivo: "Não consegui ler a gravação da voz. Grave ou envie de novo." } : { ...x, desde: agora(), tentativas } };
      }
      if (feito.duracaoSec < SEGUNDOS_MINIMOS_DA_VOZ) {
        return { ...atual!, voz: { ...x, estado: "curta", desde: agora(), mp3Url: feito.voz.url, segundos: feito.duracaoSec, motivo: `A gravação tem ${duracaoFalada(feito.duracaoSec)}. Para a voz ficar parecida com a sua, precisamos de pelo menos ${SEGUNDOS_MINIMOS_DA_VOZ} s: envie um trecho maior de você falando, ou leia o texto inteiro sem pressa.` } };
      }
      return { ...atual!, voz: { ...x, estado: autorizada ? "clonando" : "esperando", desde: agora(), mp3Url: feito.voz.url, segundos: feito.duracaoSec, tentativas: 0, motivo: null } };
    });
    if (erro) console.error(`[gemeo][${projectId}] voz:`, erro);
    v = novo?.voz ?? null;
    if (!v) return;
  }

  // Nada é clonado antes da autorização valer.
  const autorizada = (await lerCadastro(projectId))?.autorizacao?.estado === "valida";
  if (v.estado === "esperando" && autorizada) {
    const x = await mudarCadastro(projectId, (atual) =>
      atual?.voz?.estado === "esperando" ? { ...atual, voz: { ...atual.voz, estado: "clonando", desde: agora() } } : undefined
    );
    v = x?.voz ?? v;
  }
  const vez =
    autorizada &&
    v.mp3Url &&
    (v.estado === "clonando" ||
      (v.estado === "sem-permissao" && idade(v.ultimaTentativa) > ESPERA_SEM_PERMISSAO_MS) ||
      (v.estado === "falhou" && v.mp3Url && (v.tentativas ?? 0) < 3 && idade(v.ultimaTentativa) > ESPERA_DE_FALHA_MS));
  if (!vez) return;

  const amostraUrl = v.amostraUrl;
  const cadastro = await lerCadastro(projectId);
  const projeto = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  let voiceId: string | null = null;
  let erro: ErroDoFornecedor | Error | null = null;
  try {
    const amostra = await lerMidia(v.mp3Url!);
    if (!amostra) throw new Error("Não achei a amostra de voz no storage");
    voiceId = (await clonarVoz({ nome: cadastro?.autorizacao?.nome ?? "Cliente", amostra, projeto: projeto?.name ?? projectId })).voiceId;
  } catch (e) {
    erro = e instanceof Error ? e : new Error(String(e));
  }
  let orfa: string | null = null;
  await mudarCadastro(projectId, (atual) => {
    const x = atual?.voz;
    if (!x || x.amostraUrl !== amostraUrl) {
      // A amostra foi trocada enquanto a ElevenLabs clonava: a voz nova é órfã.
      if (voiceId) orfa = voiceId;
      return atual && orfa ? { ...atual, vozesParaApagar: [...(atual.vozesParaApagar ?? []), orfa] } : undefined;
    }
    if (voiceId) return { ...atual!, voz: { ...x, estado: "pronta", desde: agora(), voiceId, clonadaEm: agora(), motivo: null, ultimaTentativa: agora() } };
    const semPermissao = erro instanceof ErroDoFornecedor && erro.tipo === "sem-permissao";
    return {
      ...atual!,
      voz: {
        ...x,
        estado: semPermissao ? "sem-permissao" : "falhou",
        desde: x.estado === (semPermissao ? "sem-permissao" : "falhou") ? x.desde : agora(),
        ultimaTentativa: agora(),
        tentativas: semPermissao ? x.tentativas ?? 0 : (x.tentativas ?? 0) + 1,
        motivo: semPermissao
          ? "O fornecedor de voz ainda não liberou a clonagem para a nossa conta. Tentamos de novo sozinhos a cada 30 minutos; você não precisa fazer nada."
          : "Não consegui clonar a voz agora. Tentamos de novo em alguns minutos.",
      },
    };
  });
  if (erro) console.warn(`[gemeo][${projectId}] clonagem:`, erro.message);
}

async function apagarVozesPendentes(projectId: string, c: CadastroGuardado): Promise<void> {
  const lista = c.vozesParaApagar ?? [];
  if (!lista.length) return;
  const apagadas: string[] = [];
  for (const id of lista) {
    try {
      await apagarVoz(id);
      apagadas.push(id);
    } catch (e) {
      console.warn(`[gemeo][${projectId}] voz antiga ${id} ainda não apagada:`, mensagem(e));
    }
  }
  if (apagadas.length) {
    await mudarCadastro(projectId, (atual) =>
      atual ? { ...atual, vozesParaApagar: (atual.vozesParaApagar ?? []).filter((v) => !apagadas.includes(v)) } : undefined
    );
  }
}

/** A voz de um gêmeo revogado que a ElevenLabs não apagou na hora. */
async function terminarRevogacoes(): Promise<number> {
  const linhas = await prisma.$queryRaw<Array<{ projectId: string; key: string }>>`
    SELECT "projectId", key FROM project_memories
    WHERE type = ${TIPO_REVOGACAO}
      AND jsonb_array_length(COALESCE(value -> 'vozesParaApagar', '[]'::jsonb)) > 0
      AND "updatedAt" < now() - interval '30 minutes'
    LIMIT 10`;
  let feitas = 0;
  for (const l of linhas) {
    const r = await prisma.projectMemory.findUnique({
      where: { projectId_type_key: { projectId: l.projectId, type: TIPO_REVOGACAO, key: l.key } },
      select: { value: true },
    });
    const pendentes = ((r?.value as { vozesParaApagar?: string[] } | null)?.vozesParaApagar ?? []).slice();
    const restam: string[] = [];
    for (const id of pendentes) {
      try {
        await apagarVoz(id);
        feitas++;
      } catch {
        restam.push(id);
      }
    }
    // Grava sempre (mesmo sem mudança), para o `updatedAt` empurrar a próxima tentativa 30 min.
    await mudarMemoria<Record<string, unknown>>(l.projectId, TIPO_REVOGACAO, l.key, (atual) =>
      atual ? { ...atual, vozesParaApagar: restam, ultimaTentativa: agora() } : undefined
    );
  }
  return feitas;
}

async function cuidarDosCadastros(prazo: number): Promise<number> {
  const linhas = await prisma.$queryRaw<Array<{ projectId: string }>>`
    SELECT "projectId" FROM project_memories
    WHERE type = 'gemeo' AND key = 'cadastro' AND (
      value -> 'foto' ->> 'estado' IN ('preparando', 'falhou')
      OR value -> 'voz' ->> 'estado' IN ('convertendo', 'esperando', 'clonando', 'sem-permissao', 'falhou')
      OR value -> 'autorizacao' ->> 'estado' = 'conferindo'
      OR jsonb_array_length(COALESCE(value -> 'vozesParaApagar', '[]'::jsonb)) > 0
    )
    ORDER BY "updatedAt" ASC
    LIMIT 20`;
  let olhados = 0;
  for (const { projectId } of linhas) {
    if (Date.now() > prazo) break;
    olhados++;
    try {
      // Ordem que importa: a autorização antes da voz, para a clonagem já
      // poder acontecer na mesma passada em que a autorização valeu.
      let c = await lerCadastro(projectId);
      if (c) await cuidarDaFoto(projectId, c);
      c = await lerCadastro(projectId);
      if (c) await conferirAutorizacao(projectId, c);
      c = await lerCadastro(projectId);
      if (c) await cuidarDaVoz(projectId, c);
      c = await lerCadastro(projectId);
      if (c) await apagarVozesPendentes(projectId, c);
    } catch (e) {
      console.error(`[gemeo][${projectId}] cadastro:`, e);
    }
  }
  return olhados;
}

// ─────────────────────────────── 2. o vídeo ───────────────────────────────

/** Encerra o vídeo como falho e devolve o que ainda não voltou. */
async function falhar(projectId: string, v: VideoDoGemeo, motivo: string): Promise<void> {
  const marcado = await mudarVideo(projectId, v.id, (atual) =>
    atual && !["na-esteira", "falhou", "cancelada"].includes(atual.estado) ? { ...atual, estado: "falhou", desde: agora(), motivo } : undefined
  );
  if (marcado?.estado !== "falhou") return;
  const { cobrado, devolvido } = await cobradoDoVideo(v.id);
  const voltou = await estornarVideo(v, cobrado - devolvido, "falha", `Vídeo do gêmeo não entregue: ${motivo}`);
  if (voltou) await mudarVideo(projectId, v.id, (a) => (a ? { ...a, creditosDevolvidos: (a.creditosDevolvidos ?? 0) + voltou } : undefined));
}

type Trava = { estado: VideoDoGemeo["estado"]; desde: string };

/** Grava só se o vídeo ainda está no estado e no `desde` que esta passada tomou. */
function gravarComTrava(projectId: string, id: string, trava: Trava, mudar: (v: VideoDoGemeo) => VideoDoGemeo) {
  return mudarVideo(projectId, id, (atual) => (atual && atual.estado === trava.estado && atual.desde === trava.desde ? mudar(atual) : undefined));
}

/**
 * FALAR E ENVIAR. Toma o vídeo (estado "falando" com um `desde` novo, que é a
 * trava), fala cada pedaço que ainda não tem voz, acerta a reserva de
 * créditos pela fala real, sobe foto e falas ao fal e pede cada pedaço ao
 * OmniHuman. Tudo é gravado pedaço a pedaço: a função que morrer no meio é
 * retomada de onde parou, sem falar de novo nem pedir duas vezes.
 */
async function falarEEnviar(projectId: string, lido: VideoDoGemeo, prazo: number): Promise<void> {
  const trava: Trava = { estado: "falando", desde: agora() };
  const tomado = await mudarVideo(projectId, lido.id, (atual) =>
    atual && atual.estado === lido.estado && atual.desde === lido.desde ? { ...atual, ...trava, proximaTentativa: null } : undefined
  );
  if (!tomado || tomado.estado !== "falando" || tomado.desde !== trava.desde) return;
  let v = tomado;
  const salvar = async (mudar: (x: VideoDoGemeo) => VideoDoGemeo) => {
    const novo = await gravarComTrava(projectId, v.id, trava, mudar);
    if (!novo || novo.desde !== trava.desde || novo.estado !== "falando") throw new Error("perdi a vez");
    v = novo;
  };
  /** Pausa até a próxima passada (orçamento, fornecedor sem saldo, rede). */
  const pausar = async (motivo: string | null, esperaMs: number) => {
    await gravarComTrava(projectId, v.id, trava, (x) => ({
      ...x,
      estado: "na-fila",
      desde: agora(),
      proximaTentativa: new Date(Date.now() + esperaMs).toISOString(),
      motivo,
    }));
  };
  const ctx = { projectId, operation: "gemeo_video" };

  try {
    // 1. A VOZ de cada pedaço.
    for (let i = 0; i < v.pedacos.length; i++) {
      if (Date.now() > prazo) return pausar(null, 0);
      const p = v.pedacos[i];
      if (p.audioUrl) continue;
      const fala = await falar({ voiceId: v.voiceId, texto: p.texto, anterior: v.pedacos[i - 1]?.texto, seguinte: v.pedacos[i + 1]?.texto });
      gravarCustoDeVideo(`elevenlabs/${fala.modelo}`, fala.caracteres * DOLAR_POR_CARACTERE, ctx);
      const segundos = duracaoDoMp3(fala.mp3);
      if (segundos > SEGUNDOS_MAXIMOS_DO_PEDACO) {
        // A voz saiu mais lenta que a régua: parte o pedaço e fala de novo.
        const [a, b] = partirAoMeio(p.texto);
        if (!b) throw new Error("um trecho do roteiro não cabe em 30 s nem dividido");
        await salvar((x) => ({ ...x, pedacos: [...x.pedacos.slice(0, i), { texto: a, tentativas: 0 }, { texto: b, tentativas: 0 }, ...x.pedacos.slice(i + 1)] }));
        i--;
        continue;
      }
      const { url } = await put(`gemeo/${projectId}/${v.id}/fala-${i}.mp3`, fala.mp3, { ...midiaPrivada(), contentType: "audio/mpeg", addRandomSuffix: true });
      await salvar((x) => ({ ...x, pedacos: x.pedacos.map((q, j) => (j === i ? { ...q, audioUrl: url, segundos, caracteres: fala.caracteres } : q)) }));
    }

    // 2. O ACERTO DA RESERVA: cobra o tempo real da fala, devolve o resto.
    if (v.creditosCobrados == null) {
      const segundosDaFala = Math.round(v.pedacos.reduce((s, p) => s + (p.segundos ?? 0), 0) * 10) / 10;
      const devido = Math.min(v.creditosReservados, creditosDoGemeo(segundosDaFala));
      const voltou = await estornarVideo(
        v,
        v.creditosReservados - devido,
        "acerto",
        `A fala saiu com ${duracaoFalada(segundosDaFala)}; a diferença da reserva voltou.`
      );
      await salvar((x) => ({ ...x, segundosDaFala, creditosCobrados: devido, creditosDevolvidos: (x.creditosDevolvidos ?? 0) + voltou }));
    }

    // 3. A FOTO no armazenamento do fal (uma vez por vídeo).
    if (!v.falFotoUrl) {
      const foto = await lerMidia(v.fotoUrl);
      if (!foto) throw new Error("a foto do gêmeo sumiu do storage");
      const url = await subirNoFal(foto, "image/jpeg", "foto.jpg");
      await salvar((x) => ({ ...x, falFotoUrl: url }));
    }

    // 4. CADA PEDAÇO ao OmniHuman.
    for (let i = 0; i < v.pedacos.length; i++) {
      if (Date.now() > prazo) return pausar(null, 0);
      const p = v.pedacos[i];
      if (p.requestId) continue;
      let falAudioUrl = p.falAudioUrl;
      if (!falAudioUrl) {
        const audio = await lerMidia(p.audioUrl!);
        if (!audio) throw new Error(`a fala do pedaço ${i + 1} sumiu do storage`);
        falAudioUrl = await subirNoFal(audio, "audio/mpeg", `fala-${i}.mp3`);
        const guardada = falAudioUrl;
        await salvar((x) => ({ ...x, pedacos: x.pedacos.map((q, j) => (j === i ? { ...q, falAudioUrl: guardada } : q)) }));
      }
      const pedido = await pedirOmniHuman({ imagemUrl: v.falFotoUrl!, audioUrl: falAudioUrl });
      await salvar((x) => ({
        ...x,
        pedacos: x.pedacos.map((q, j) => (j === i ? { ...q, ...pedido, status: "IN_QUEUE", enviadoEm: agora(), erro: null } : q)),
      }));
    }

    await gravarComTrava(projectId, v.id, trava, (x) => ({ ...x, estado: "gerando", desde: agora(), motivo: null }));
  } catch (e) {
    if (e instanceof Error && e.message === "perdi a vez") return;
    const erro = mensagem(e);
    console.error(`[gemeo][${projectId}][${v.id}] falar e enviar:`, erro);
    const esperavel = e instanceof ErroDoFornecedor && e.tipo !== "recusado";
    if (esperavel && idade(v.criadoEm) < PRAZO_PARA_ENVIAR_MS) {
      const motivo =
        e instanceof ErroDoFornecedor && e.tipo === "sem-saldo"
          ? "O gerador está sem capacidade agora. Tentamos de novo sozinhos em alguns minutos."
          : "Um fornecedor não respondeu. Tentamos de novo sozinhos em alguns minutos.";
      return pausar(motivo, 3 * 60_000);
    }
    await falhar(projectId, v, esperavel ? "O gerador ficou fora do ar por mais de 45 minutos." : `Não consegui preparar o vídeo (${erro.slice(0, 160)}).`);
  }
}

/** ACOMPANHAR: pergunta ao fal por cada pedaço; com todos prontos, pede a junção. */
async function acompanhar(projectId: string, lido: VideoDoGemeo): Promise<void> {
  const pedacos: PedacoDoGemeo[] = [];
  let mudou = false;
  let recusado: string | null = null;
  for (const [i, p] of lido.pedacos.entries()) {
    if (!p.requestId || p.videoUrl) {
      pedacos.push(p);
      continue;
    }
    try {
      const status = await estadoNoFal(p.statusUrl!);
      if (status !== "COMPLETED") {
        if (status !== p.status) mudou = true;
        pedacos.push({ ...p, status });
        continue;
      }
      try {
        const r = await resultadoNoFal(p.responseUrl!);
        const duracao = r.duracao ?? (p.segundos ?? 0) * FOLGA_DO_VIDEO_SOBRE_A_FALA;
        gravarCustoDeVideo(dubleLigado() ? `duble/${MODELO_DO_GERADOR}` : MODELO_DO_GERADOR, duracao * DOLAR_POR_SEGUNDO_DO_GERADOR, { projectId, operation: "gemeo_video" });
        pedacos.push({ ...p, status, videoUrl: r.videoUrl, duracaoDoVideo: duracao });
        mudou = true;
      } catch (e) {
        if (!(e instanceof ErroDoFornecedor) || e.tipo !== "recusado") throw e;
        // A geração falhou do lado deles (o fal não cobra a que falha): pede de
        // novo uma vez com a mesma foto e a mesma fala.
        const tentativas = (p.tentativas ?? 0) + 1;
        if (tentativas >= 2) {
          recusado = `O gerador recusou o pedaço ${i + 1} duas vezes (${e.message.slice(0, 120)}).`;
          pedacos.push({ ...p, tentativas, erro: e.message });
        } else {
          const novo = await pedirOmniHuman({ imagemUrl: lido.falFotoUrl!, audioUrl: p.falAudioUrl! });
          pedacos.push({ ...p, ...novo, status: "IN_QUEUE", enviadoEm: agora(), tentativas, erro: e.message });
        }
        mudou = true;
      }
    } catch (e) {
      // Rede ou fal fora: não encerra; o próximo minuto pergunta de novo.
      console.warn(`[gemeo][${projectId}][${lido.id}] estado do pedaço ${i + 1}:`, mensagem(e));
      pedacos.push(p);
    }
  }
  if (recusado) return falhar(projectId, lido, recusado);
  const trava: Trava = { estado: "gerando", desde: lido.desde };
  const prontos = pedacos.every((p) => p.videoUrl);
  if (!prontos) {
    if (idade(lido.desde) > PRAZO_DO_GERADOR_MS) return falhar(projectId, lido, "O gerador não entregou em 1 hora.");
    if (mudou) await gravarComTrava(projectId, lido.id, trava, (x) => ({ ...x, pedacos }));
    return;
  }
  const atualizado = await gravarComTrava(projectId, lido.id, trava, (x) => ({ ...x, pedacos }));
  if (atualizado) await pedirJuncao(projectId, atualizado);
}

/**
 * JUNTAR: o worker baixa os pedaços, apara a sobra de cada um e emenda; avisa
 * por callback (`/api/projects/[id]/gemeo/juntar-callback`). O `desde` vai no
 * `retorno`: aviso atrasado de uma tentativa antiga não mexe na nova.
 */
async function pedirJuncao(projectId: string, lido: VideoDoGemeo): Promise<void> {
  const tentativas = (lido.tentativasDeJuncao ?? 0) + 1;
  if (tentativas > 3) return falhar(projectId, lido, "Não consegui juntar os pedaços do vídeo.");
  const desde = agora();
  const tomado = await mudarVideo(projectId, lido.id, (atual) =>
    atual && atual.estado === lido.estado && atual.desde === lido.desde ? { ...atual, estado: "juntando", desde, tentativasDeJuncao: tentativas } : undefined
  );
  if (!tomado || tomado.desde !== desde) return;
  try {
    await chamarWorker(
      "juntar-gemeo",
      {
        chave: `gemeo/${projectId}/${lido.id}/gemeo.mp4`,
        pedacos: tomado.pedacos.map((p) => ({ url: p.videoUrl, segundos: p.segundos })),
        callbackUrl: `${baseDoApp()}/api/projects/${projectId}/gemeo/juntar-callback`,
        retorno: { projectId, id: lido.id, desde },
      },
      60_000
    );
  } catch (e) {
    console.error(`[gemeo][${projectId}][${lido.id}] pedir junção:`, mensagem(e));
    // Volta no tempo para a próxima passada tentar de novo (até 3 vezes).
    await mudarVideo(projectId, lido.id, (a) =>
      a && a.estado === "juntando" && a.desde === desde ? { ...a, desde: new Date(Date.now() - PRAZO_DA_JUNCAO_MS - 1000).toISOString() } : undefined
    );
  }
}

/** O callback do worker. Devolve o que fez, para a rota responder. */
export async function concluirJuncao(corpo: {
  ok?: boolean;
  erro?: string;
  video?: { url: string; bytes?: number };
  duracaoSec?: number;
  retorno?: { projectId?: string; id?: string; desde?: string } | null;
}): Promise<"juntado" | "repetir" | "ignorado"> {
  const { projectId, id, desde } = corpo.retorno ?? {};
  if (!projectId || !id || !desde) return "ignorado";
  let resultado = "ignorado" as "juntado" | "repetir" | "ignorado";
  await mudarVideo(projectId, id, (v) => {
    if (!v || v.estado !== "juntando" || v.desde !== desde) return undefined;
    if (corpo.ok && corpo.video?.url) {
      resultado = "juntado";
      return { ...v, estado: "juntado", desde: agora(), finalUrl: corpo.video.url, finalBytes: corpo.video.bytes ?? null, finalSegundos: corpo.duracaoSec ?? null, motivo: null };
    }
    resultado = "repetir";
    // Deixa "juntando" com um `desde` vencido: a próxima passada pede de novo.
    return { ...v, desde: new Date(Date.now() - PRAZO_DA_JUNCAO_MS - 1000).toISOString(), motivo: `Junção falhou: ${(corpo.erro ?? "sem detalhe").slice(0, 200)}` };
  });
  if (resultado === "juntado") cutucar();
  return resultado;
}

/**
 * ENTRAR NA ESTEIRA: o MP4 final vira um VideoJob, do mesmo jeito que o envio
 * de uma gravação cria (status "uploaded", arquivo no store privado), e o
 * piloto pede a transcrição. Dali em diante é o caminho de qualquer vídeo:
 * transcrição, roteiro para aprovar, cortes, edição e a aprovação do cliente.
 *
 * NÃO passa por `registrarGravacao`: o vídeo do gêmeo já foi pago em créditos
 * por segundo, e contá-lo também na cota de gravações do mês cobraria duas
 * vezes pela mesma coisa. A edição em si é cobrada pela esteira, no preço de
 * qualquer gravação.
 */
async function entrarNaEsteira(projectId: string, v: VideoDoGemeo): Promise<void> {
  if (!v.finalUrl) return falhar(projectId, v, "O vídeo final sumiu.");
  const chave = { projectId_blobUrl: { projectId, blobUrl: v.finalUrl } };
  const video =
    (await prisma.videoJob.findUnique({ where: chave, select: { id: true, status: true } })) ??
    (await prisma.videoJob
      .create({
        data: {
          projectId,
          userId: v.userId,
          status: "uploaded",
          blobUrl: v.finalUrl,
          originalName: `Gêmeo digital - ${v.titulo}`.slice(0, 180) + ".mp4",
          sizeBytes: v.finalBytes ? BigInt(v.finalBytes) : null,
        },
        select: { id: true, status: true },
      })
      .catch(async () => prisma.videoJob.findUnique({ where: chave, select: { id: true, status: true } })));
  if (!video) return;
  const marcado = await mudarVideo(projectId, v.id, (a) =>
    a && a.estado === "juntado" ? { ...a, estado: "na-esteira", desde: agora(), videoJobId: video.id } : undefined
  );
  if (marcado?.videoJobId !== video.id) return;
  if (v.roteiroId) {
    await prisma.roteiro.updateMany({ where: { id: v.roteiroId, projectId, status: { in: ["pronto", "ideia"] } }, data: { status: "gravado" } }).catch(() => {});
  }
  if (video.status === "uploaded") await despacharPasso(video.id, "transcrever");
}

async function cuidarDosVideos(prazo: number): Promise<{ olhados: number; enviados: number; juntados: number; naEsteira: number }> {
  const r = { olhados: 0, enviados: 0, juntados: 0, naEsteira: 0 };
  const linhas = await prisma.$queryRaw<Array<{ projectId: string; key: string }>>`
    SELECT "projectId", key FROM project_memories
    WHERE type = 'gemeo-video'
      AND value ->> 'estado' IN ('na-fila', 'falando', 'gerando', 'juntando', 'juntado')
    ORDER BY "createdAt" ASC
    LIMIT 30`;
  for (const { projectId, key } of linhas) {
    if (Date.now() > prazo) break;
    const v = await lerVideo(projectId, key);
    if (!v) continue;
    r.olhados++;
    try {
      if (v.estado === "na-fila") {
        if (v.proximaTentativa && new Date(v.proximaTentativa).getTime() > Date.now()) continue;
        await falarEEnviar(projectId, v, prazo);
        r.enviados++;
      } else if (v.estado === "falando" && idade(v.desde) > PASSO_MORTO_MS) {
        await falarEEnviar(projectId, v, prazo);
        r.enviados++;
      } else if (v.estado === "gerando") {
        await acompanhar(projectId, v);
      } else if (v.estado === "juntando" && idade(v.desde) > PRAZO_DA_JUNCAO_MS) {
        await pedirJuncao(projectId, v);
        r.juntados++;
      } else if (v.estado === "juntado") {
        await entrarNaEsteira(projectId, v);
        r.naEsteira++;
      }
    } catch (e) {
      console.error(`[gemeo][${projectId}][${key}] ${v.estado}:`, e);
    }
  }
  return r;
}

/**
 * Uma passada do gêmeo, chamada pelo cron da fila com orçamento próprio.
 * Seguro de rodar em paralelo: toda troca de estado é condicional ao estado
 * e ao `desde` lidos, dentro de uma trava por documento.
 */
export async function avancarGemeos(opcoes: { orcamentoMs?: number } = {}): Promise<Record<string, number>> {
  const prazo = Date.now() + (opcoes.orcamentoMs ?? 180_000);
  const cadastros = await cuidarDosCadastros(prazo);
  const videos = await cuidarDosVideos(prazo);
  const revogacoes = Date.now() < prazo ? await terminarRevogacoes().catch(() => 0) : 0;
  return { cadastros, ...videos, vozesRevogadasApagadas: revogacoes };
}
