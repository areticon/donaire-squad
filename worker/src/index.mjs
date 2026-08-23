import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, stat, readFile, writeFile, copyFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get, put } from "@vercel/blob";
import {
  ffprobe,
  prepararCompleto,
  cortarVertical,
  cortarHorizontal,
  extrairCapa,
  extrairQuadros,
  extrairCandidatosDeCapa,
  extrairCapaFinal,
  montarAbertura,
  emendar,
  medirFidelidade,
} from "./ffmpeg.mjs";

/**
 * Worker de vídeo da Demandou.
 *
 * Existe porque ffmpeg com arquivo de centenas de megabytes não roda em função
 * serverless: a Vercel tem teto de tempo e de memória, e a gravação de teste
 * tem 850 MB. Aqui não há teto de tempo, o disco é real e o ffmpeg é nativo.
 *
 * O contrato é deliberadamente burro: recebe um trabalho, responde 202 na hora,
 * e avisa por callback quando termina. Nada de o app ficar esperando, que é
 * exatamente a armadilha que derrubou a seleção de trechos duas vezes.
 */

const PORTA = Number(process.env.PORT) || 8080;
const SEGREDO = process.env.WORKER_SECRET;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!SEGREDO) throw new Error("WORKER_SECRET não configurado");
if (!BLOB_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN não configurado");

/**
 * Assinatura HMAC sobre o corpo cru.
 *
 * Comparação em tempo constante, e não `===`: comparação comum vaza, pelo tempo
 * que leva, quantos bytes iniciais bateram, e isso permite descobrir a
 * assinatura byte a byte. É barato fazer certo.
 */
function assinaturaValida(corpoCru, recebida) {
  if (!recebida) return false;
  const esperada = createHmac("sha256", SEGREDO).update(corpoCru).digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function assinar(texto) {
  return createHmac("sha256", SEGREDO).update(texto).digest("hex");
}

async function baixarFonte(sourceUrl, destino) {
  const blob = await get(sourceUrl, { access: "private", token: BLOB_TOKEN });
  if (!blob || blob.statusCode !== 200) {
    throw new Error("Não consegui ler o vídeo no storage");
  }
  // Fluxo direto para o disco. Nunca `arrayBuffer()`: o contêiner tem memória
  // bem menor que os arquivos que ele processa.
  await pipeline(Readable.fromWeb(blob.stream), createWriteStream(destino));
  return blob.blob.contentType || "video/mp4";
}

async function subir(caminho, chave, contentType) {
  const conteudo = await readFile(caminho);
  const { url } = await put(chave, conteudo, {
    access: "private",
    token: BLOB_TOKEN,
    contentType,
    addRandomSuffix: true,
  });
  const { size } = await stat(caminho);
  return { url, bytes: size };
}

/**
 * Pergunta ao squad como enquadrar cada trecho, mandando alguns quadros.
 *
 * Ideia do Bruno: em vez de perguntar ao cliente que tipo de gravação ele
 * mandou, o time olha e decide. Os quadros existem só para essa decisão e
 * morrem com a pasta temporária.
 *
 * A decisão mora no app, e não aqui, por dois motivos: a conta de custo de IA
 * do projeto vive num lugar só, e prompt de agente é produto, que se edita num
 * lugar só.
 *
 * Falhar aqui NÃO derruba o trabalho. Sem enquadramento o corte sai com o
 * tratamento seguro, que é pior mas existe. Entregar corte mediano é muito
 * melhor que não entregar corte porque o agente de visão teve um dia ruim.
 */
async function pedirEnquadramento(trabalho, fonte, pasta, duracaoSec) {
  if (!trabalho.enquadramentoUrl) return { enquadramentos: new Map(), capa: null };

  try {
    const paraOlhar = [];
    for (const t of trabalho.trechos) {
      const duracao = Math.max(1, t.fim - t.inicio);
      const caminhos = await extrairQuadros(
        fonte,
        join(pasta, `q-${t.indice}`),
        t.inicio,
        duracao,
        2
      );
      const quadros = [];
      for (const c of caminhos) {
        quadros.push((await readFile(c)).toString("base64"));
      }
      paraOlhar.push({ indice: t.indice, quadros, mediaType: "image/jpeg" });
    }

    // Candidatos a capa, do vídeo inteiro. Vão na mesma chamada que o
    // enquadramento: são as mesmas imagens do mesmo vídeo olhadas pelo mesmo
    // agente, e duas chamadas custariam duas vezes o prompt sem ganhar nada.
    const candidatos = await extrairCandidatosDeCapa(
      fonte,
      join(pasta, "capa-cand"),
      duracaoSec,
      10
    );
    const candidatosB64 = [];
    for (const c of candidatos) {
      candidatosB64.push((await readFile(c.caminho)).toString("base64"));
    }

    const texto = JSON.stringify({ trechos: paraOlhar, candidatosDeCapa: candidatosB64 });
    const res = await fetch(trabalho.enquadramentoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-demandou-assinatura": assinar(texto),
      },
      body: texto,
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`enquadramento respondeu ${res.status}`);
    const corpo = await res.json();

    // O instante do candidato escolhido, para reextrair em resolução cheia.
    let capa = null;
    if (corpo.capa && candidatos[corpo.capa.indice]) {
      capa = {
        instante: candidatos[corpo.capa.indice].instante,
        recorte: corpo.capa.recorte ?? null,
        motivo: corpo.capa.motivo ?? "",
      };
    }

    return {
      enquadramentos: new Map((corpo.enquadramentos ?? []).map((e) => [e.indice, e])),
      capa,
    };
  } catch (e) {
    console.error(`[${trabalho.videoJobId}] enquadramento falhou: ${e.message}`);
    return { enquadramentos: new Map(), capa: null };
  }
}

/**
 * O trabalho de verdade.
 *
 * Ordem deliberada: os TRECHOS saem primeiro, e o vídeo completo por último. O
 * completo é o item mais caro (recodifica a gravação inteira) e o menos urgente
 * (o cliente publica no canal com calma), enquanto os trechos são o que ele
 * quer ver para decidir. Se algo estourar no meio, o que sobrou entregue é a
 * parte que importa.
 */
async function processar(trabalho) {
  const pasta = await mkdtemp(join(tmpdir(), "demandou-"));
  const resultados = { trechos: [], completo: null, capaFonte: null, erros: [] };

  try {
    const fonte = join(pasta, "fonte.mp4");
    await baixarFonte(trabalho.sourceUrl, fonte);
    const info = await ffprobe(fonte);

    const { enquadramentos, capa } = await pedirEnquadramento(
      trabalho,
      fonte,
      pasta,
      info.duracaoSec
    );

    // A capa da gravação sai antes dos cortes: é barata (um quadro) e é o que a
    // tela mostra primeiro.
    if (capa) {
      try {
        const arquivo = join(pasta, "capa-fonte.jpg");
        await extrairCapaFinal(fonte, arquivo, capa.instante, capa.recorte);
        resultados.capaFonte = await subir(
          arquivo,
          `cortes/${trabalho.videoJobId}/capa-fonte.jpg`,
          "image/jpeg"
        );
        resultados.capaFonte.instante = Math.round(capa.instante);
        resultados.capaFonte.motivo = capa.motivo;
      } catch (e) {
        resultados.erros.push(
          `capa: ${e instanceof Error ? e.message : "falhou"}`
        );
      }
    }

    for (const t of trabalho.trechos) {
      const duracao = Math.max(1, t.fim - t.inicio);
      const enq = enquadramentos.get(t.indice) ?? null;
      const saida = {
        indice: t.indice,
        titulo: t.titulo,
        duracaoSec: duracao,
        enquadramento: enq
          ? {
              cena: enq.cena,
              vertical: enq.vertical,
              motivo: enq.motivo,
              // As caixas vão junto de propósito. Sem elas, recorte errado vira
              // "está cortando o slide" sem ninguém conseguir dizer se a culpa
              // foi do agente que mediu ou do filtro que aplicou. Custam alguns
              // bytes e economizam uma investigação inteira.
              pessoa: enq.pessoa ?? null,
              tela: enq.tela ?? null,
            }
          : null,
      };
      try {
        const vertical = join(pasta, `v-${t.indice}.mp4`);
        await cortarVertical(fonte, vertical, t.inicio, duracao, enq);
        saida.vertical = await subir(
          vertical,
          `cortes/${trabalho.videoJobId}/vertical-${t.indice}.mp4`,
          "video/mp4"
        );

        const horizontal = join(pasta, `h-${t.indice}.mp4`);
        await cortarHorizontal(fonte, horizontal, t.inicio, duracao);
        saida.horizontal = await subir(
          horizontal,
          `cortes/${trabalho.videoJobId}/horizontal-${t.indice}.mp4`,
          "video/mp4"
        );

        const capa = join(pasta, `c-${t.indice}.jpg`);
        await extrairCapa(fonte, capa, t.inicio, duracao);
        saida.capa = await subir(
          capa,
          `cortes/${trabalho.videoJobId}/capa-${t.indice}.jpg`,
          "image/jpeg"
        );
      } catch (e) {
        // Um trecho que falha não derruba os outros. Entregar quatro de cinco é
        // melhor que entregar zero, e a tela mostra qual faltou.
        saida.erro = e instanceof Error ? e.message : "falhou";
        resultados.erros.push(`trecho ${t.indice}: ${saida.erro}`);
      }
      resultados.trechos.push(saida);
    }

    try {
      const completo = join(pasta, "completo.mp4");

      // As legendas de destaque chegam prontas do app, já com os tempos
      // convertidos para o vídeo DEPOIS das remoções. Convertê-las aqui
      // exigiria repetir a mesma matemática de deslocamento nos dois lados, e
      // duas contas iguais em lugares diferentes divergem com o tempo.
      let legendasArquivo = null;
      if (trabalho.legendasAss) {
        legendasArquivo = join(pasta, "destaques.ass");
        await writeFile(legendasArquivo, trabalho.legendasAss, "utf8");
      }

      // O CORPO primeiro: a gravação editada, do começo.
      const corpo = join(pasta, "corpo.mp4");
      const como = await prepararCompleto(fonte, corpo, {
        remocoes: trabalho.remocoes,
        duracaoSec: info.duracaoSec,
        legendasArquivo,
      });

      // A abertura vai NA FRENTE, com os ganchos que o squad escolheu. Os
      // tempos dela já chegam convertidos para depois da edição, senão
      // apontariam para o instante errado do arquivo original.
      //
      // Se a abertura falhar, o vídeo sai sem ela: um vídeo que começa do
      // começo é pior de reter, mas é um vídeo. Sem corpo não há entrega.
      let temAbertura = false;
      try {
        const abertura = join(pasta, "abertura.mp4");
        temAbertura = await montarAbertura(corpo, abertura, trabalho.ganchos);
        if (temAbertura) {
          await emendar([abertura, corpo], completo, pasta);
        }
      } catch (e) {
        temAbertura = false;
        resultados.erros.push(
          `abertura: ${e instanceof Error ? e.message : "falhou"}`
        );
      }
      if (!temAbertura) {
        await copyFile(corpo, completo);
      }

      resultados.completo = await subir(
        completo,
        `cortes/${trabalho.videoJobId}/completo.mp4`,
        "video/mp4"
      );
      resultados.completo.abertura = temAbertura ? trabalho.ganchos.length : 0;
      resultados.completo.recodificado = como.recodificado;
      resultados.completo.motivo = como.motivo;
      // A promessa de qualidade tem que ser verificável, não prometida. Só faz
      // sentido medir quando houve recodificação: remux é idêntico por
      // definição, e comparar um arquivo com ele mesmo custa CPU à toa.
      // A fidelidade compara o CORPO com a fonte, e não o arquivo final: o
      // final tem a abertura na frente, então os dois estariam desalinhados no
      // tempo e o SSIM mediria desencontro, não perda de qualidade.
      resultados.completo.fidelidade = como.recodificado
        ? await medirFidelidade(fonte, corpo, info.duracaoSec)
        : 1;
    } catch (e) {
      resultados.erros.push(
        `completo: ${e instanceof Error ? e.message : "falhou"}`
      );
    }

    resultados.duracaoSec = Math.round(info.duracaoSec);
    return resultados;
  } finally {
    // O disco do contêiner é compartilhado entre trabalhos. Sem esta limpeza,
    // dois vídeos grandes seguidos enchem o disco e o terceiro falha por um
    // motivo que não tem nada a ver com ele.
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Avisa o app que terminou, insistindo.
 *
 * A retentativa não é zelo excessivo: o trabalho de cortar leva minutos e custa
 * CPU e transferência de verdade. Se o aviso se perder por um soluço de rede
 * entre as duas hospedagens, TUDO isso vira lixo, o cliente vê "cortando" até o
 * prazo estourar, e a única saída é refazer do zero.
 *
 * Encontrado no teste de ponta a ponta de 23/08, quando o servidor do outro
 * lado caiu no meio: o worker cortou tudo, avisou uma vez, levou "fetch
 * failed", e desistiu em silêncio.
 *
 * A espera cresce (5s, 15s, 45s, 135s) porque a falha típica aqui é um deploy
 * do app, que leva perto de um minuto. Insistir de segundo em segundo não
 * atravessaria a janela; esperar mais atravessa.
 *
 * O callback é idempotente do outro lado (ele ignora o que não está em
 * "cutting"), então repetir não estraga nada.
 */
async function avisar(trabalho, corpo) {
  const texto = JSON.stringify(corpo);
  const esperas = [5_000, 15_000, 45_000, 135_000];

  for (let tentativa = 0; ; tentativa++) {
    try {
      const res = await fetch(trabalho.callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-demandou-assinatura": assinar(texto),
        },
        body: texto,
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return;
      // 4xx é problema do corpo ou da assinatura, e repetir não conserta.
      // 5xx e falha de rede valem retentativa.
      if (res.status < 500) {
        console.error(
          `[${trabalho.videoJobId}] callback recusado com ${res.status}, sem retentativa`
        );
        return;
      }
      throw new Error(`callback respondeu ${res.status}`);
    } catch (e) {
      if (tentativa >= esperas.length) {
        console.error(
          `[${trabalho.videoJobId}] callback falhou ${tentativa + 1} vezes, desistindo: ${e.message}`
        );
        return;
      }
      console.warn(
        `[${trabalho.videoJobId}] callback falhou (${e.message}), nova tentativa em ${esperas[tentativa] / 1000}s`
      );
      await new Promise((r) => setTimeout(r, esperas[tentativa]));
    }
  }
}

const servidor = createServer((req, res) => {
  const responder = (status, corpo) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(corpo));
  };

  // O Railway checa a saúde do contêiner por aqui.
  if (req.method === "GET" && req.url === "/saude") {
    return responder(200, { ok: true });
  }

  if (req.method !== "POST" || !req.url?.startsWith("/cortar")) {
    return responder(404, { error: "Not found" });
  }

  const pedacos = [];
  req.on("data", (d) => pedacos.push(d));
  req.on("end", async () => {
    const corpoCru = Buffer.concat(pedacos).toString("utf8");

    if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
      return responder(401, { error: "Assinatura inválida" });
    }

    let trabalho;
    try {
      trabalho = JSON.parse(corpoCru);
    } catch {
      return responder(400, { error: "Corpo não é JSON" });
    }
    if (!trabalho.videoJobId || !trabalho.sourceUrl || !trabalho.callbackUrl) {
      return responder(400, { error: "Faltam videoJobId, sourceUrl ou callbackUrl" });
    }

    // Responde ANTES de trabalhar. O app não pode ficar segurando uma requisição
    // por vários minutos: é a mesma armadilha que derrubou a seleção de trechos.
    responder(202, { aceito: true, videoJobId: trabalho.videoJobId });

    try {
      const resultados = await processar(trabalho);
      await avisar(trabalho, { ok: true, ...resultados });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha no processamento";
      console.error(`[${trabalho.videoJobId}] ${mensagem}`);
      await avisar(trabalho, { ok: false, erro: mensagem }).catch(() => {});
    }
  });
});

servidor.listen(PORTA, () => {
  console.log(`worker de vídeo ouvindo na porta ${PORTA}`);
});
