import type { Jev } from "@/lib/media/jornada/decisoes";
import { promptFinal, type EntradaDoPrompt } from "@/lib/media/jornada/prompts";
import { reforcoDoTexto, textoConfere } from "@/lib/media/jornada/leitura-do-texto";
import { mmss } from "@/lib/media/jornada/estado";

/**
 * O PASSO 6 DA JORNADA, a geração (E4): cada elemento aprovado vira UMA mídia
 * gerada por IA, nova, num nome único desta edição.
 *
 *   - imagem: Higgsfield, GPT Image 2.5 (o melhor da conta para texto e logo);
 *   - vídeo (B-roll): Higgsfield, Kling 3.0 Pro texto para vídeo, 3 s, só quando
 *     o JEV escolheu o formato B-roll;
 *   - recorte do fundo (BiRefNet) quando o formato é "recortado sobre a gravação";
 *   - LEITURA SÓ DO TEXTO quando há texto pedido (Gemini lê, JEV compara);
 *     errado, gera de novo UMA vez; errado de novo, o elemento sai e a entrega
 *     avisa o cliente em qual momento (decisão 1 do Bruno).
 *
 * SEM RECUO SILENCIOSO (decisão 2): a Higgsfield falhou ou está fora, a imagem
 * sai do segundo melhor modelo (Nano Banana Pro, gemini-3-pro-image-preview),
 * com o nome do modelo gravado e o aviso só para o admin.
 *
 * Em paralelo (o limite da Higgsfield é respeitado dentro do gerador, pelas
 * vagas da conta), com a leitura do texto também em paralelo. Módulo puro: as
 * chamadas pagas entram por injeção.
 */

export type MidiaGerada = { dados: Buffer; custoUsd: number; modelo: string };

export type DependenciasDaGeracao = {
  imagem: (prompt: string, proporcao: string) => Promise<MidiaGerada>;
  imagemReserva: (prompt: string, proporcao: string) => Promise<MidiaGerada>;
  video: (prompt: string, proporcao: string, segundos: number) => Promise<MidiaGerada>;
  recortar: (png: Buffer) => Promise<{ png: Buffer | null; custoUsd: number }>;
  lerTexto: (png: Buffer) => Promise<{ texto: string; custoUsd: number }>;
  jev?: Jev | null;
  gravar: (dados: Buffer, elementoId: string, ext: "webp" | "png" | "mp4") => Promise<string>;
  /** Largura / altura da imagem. */
  medir?: (png: Buffer) => Promise<number>;
  avisarAdmin: (onde: string, detalhe: string) => Promise<void> | void;
  projectId?: string | null;
  /** Quantos elementos ao mesmo tempo (a Higgsfield ainda limita pelas vagas da conta). */
  concorrencia?: number;
};

export type ElementoGerado = {
  id: string;
  url: string | null;
  tipo: "imagem" | "recorte" | "video" | null;
  formato: EntradaDoPrompt["formato"];
  proporcao: number | null;
  custoUsd: number;
  modelo: string | null;
  rodadas: number;
  prompt: string;
  avisoAdmin: string | null;
  avisoCliente: string | null;
  tempos: { gerar: number; recorte: number; leitura: number };
};

const seg = (t0: number) => +((Date.now() - t0) / 1000).toFixed(1);

/** Uma imagem pela Higgsfield; falhou, pelo segundo modelo, com aviso ao admin. */
async function imagemComReserva(deps: DependenciasDaGeracao, prompt: string, proporcao: string, onde: string): Promise<{ m: MidiaGerada; aviso: string | null }> {
  try {
    return { m: await deps.imagem(prompt, proporcao), aviso: null };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message.slice(0, 200) : String(e);
    const aviso = `Higgsfield falhou em ${onde} (${detalhe}); gerado pelo Nano Banana Pro (gemini-3-pro-image-preview)`;
    await deps.avisarAdmin(onde, aviso);
    return { m: await deps.imagemReserva(prompt, proporcao), aviso };
  }
}

/** UM elemento, do prompt à url. Nunca lança: falha vira url null com o motivo. */
export async function gerarElementoDaJornada(e: EntradaDoPrompt & { t: number }, doSonnet: string, deps: DependenciasDaGeracao): Promise<ElementoGerado> {
  const tempos = { gerar: 0, recorte: 0, leitura: 0 };
  let custo = 0;
  let avisoAdmin: string | null = null;
  let prompt = promptFinal(doSonnet, e);
  const base = { id: e.id, formato: e.formato, prompt, avisoCliente: null as string | null, tempos };
  try {
    // B-ROLL EM VÍDEO: só quando o JEV escolheu o formato. Falhou: a imagem pelo segundo modelo, em tela cheia, com aviso ao admin.
    if (e.midia === "video") {
      const t0 = Date.now();
      try {
        const v = await deps.video(prompt, e.proporcao, 3);
        tempos.gerar = seg(t0);
        custo += v.custoUsd;
        const url = await deps.gravar(v.dados, e.id, "mp4");
        return { ...base, url, tipo: "video", proporcao: null, custoUsd: +custo.toFixed(4), modelo: v.modelo, rodadas: 1, avisoAdmin };
      } catch (err) {
        avisoAdmin = `B-roll da Higgsfield falhou (${err instanceof Error ? err.message.slice(0, 160) : err}); entrou a imagem do Nano Banana Pro em tela cheia`;
        await deps.avisarAdmin(`B-roll ${e.id}`, avisoAdmin);
        const r = await deps.imagemReserva(prompt, e.proporcao);
        tempos.gerar = seg(t0);
        custo += r.custoUsd;
        const url = await deps.gravar(r.dados, e.id, "webp");
        return { ...base, formato: "tela-cheia", url, tipo: "imagem", proporcao: deps.medir ? await deps.medir(r.dados).catch(() => null) : null, custoUsd: +custo.toFixed(4), modelo: r.modelo, rodadas: 1, avisoAdmin };
      }
    }
    let reforco: string | undefined;
    for (let rodada = 0; rodada < 2; rodada++) {
      prompt = promptFinal(doSonnet, e, reforco);
      const t0 = Date.now();
      const { m, aviso } = await imagemComReserva(deps, prompt, e.proporcao, `elemento ${e.id}`);
      tempos.gerar += seg(t0);
      avisoAdmin = aviso ?? avisoAdmin;
      custo += m.custoUsd;
      let png = m.dados;
      let tipo: ElementoGerado["tipo"] = "imagem";
      let formato = e.formato;
      if (e.formato === "recorte-sobre") {
        const t1 = Date.now();
        const rec = await deps.recortar(png).catch(() => ({ png: null, custoUsd: 0 }));
        tempos.recorte += seg(t1);
        custo += rec.custoUsd;
        if (rec.png) {
          png = rec.png;
          tipo = "recorte";
        } else {
          // O recorte não achou o objeto: a imagem inteira entra numa janela (o elemento não some).
          formato = "janela";
          avisoAdmin = `${avisoAdmin ? `${avisoAdmin}; ` : ""}recorte do ${e.id} falhou, entrou em janela`;
        }
      }
      if (e.textoNaImagem) {
        const t2 = Date.now();
        const lido = await deps.lerTexto(png).catch(() => null);
        tempos.leitura += seg(t2);
        custo += lido?.custoUsd ?? 0;
        const conf = lido ? await textoConfere(lido.texto, e.textoNaImagem, deps.jev ?? null, deps.projectId) : { ok: true, porQue: "leitura indisponível" };
        if (!conf.ok) {
          if (rodada === 0) {
            reforco = reforcoDoTexto(lido?.texto ?? "", e.textoNaImagem);
            continue;
          }
          return {
            ...base,
            prompt,
            url: null,
            tipo: null,
            proporcao: null,
            custoUsd: +custo.toFixed(4),
            modelo: m.modelo,
            rodadas: 2,
            avisoAdmin,
            avisoCliente: `No momento ${mmss(e.t)}, o elemento "${e.descricao.slice(0, 80)}" saiu do vídeo porque o texto "${e.textoNaImagem}" não ficou certo nas duas gerações. Peça de novo esse elemento.`,
          };
        }
      }
      const url = await deps.gravar(png, e.id, "webp");
      const proporcao = deps.medir ? await deps.medir(png).catch(() => null) : null;
      return { ...base, formato, prompt, url, tipo, proporcao, custoUsd: +custo.toFixed(4), modelo: m.modelo, rodadas: rodada + 1, avisoAdmin };
    }
  } catch (err) {
    return { ...base, url: null, tipo: null, proporcao: null, custoUsd: +custo.toFixed(4), modelo: null, rodadas: 1, avisoAdmin: `geração do ${e.id} falhou: ${err instanceof Error ? err.message.slice(0, 200) : err}`, avisoCliente: `No momento ${mmss(e.t)}, o elemento "${e.descricao.slice(0, 80)}" não pôde ser gerado agora. Peça de novo esse elemento.` };
  }
  return { ...base, url: null, tipo: null, proporcao: null, custoUsd: +custo.toFixed(4), modelo: null, rodadas: 2, avisoAdmin, avisoCliente: null };
}

/** Todos os elementos, em paralelo até a concorrência; o que tem prompt do Sonnet. */
export async function gerarTodos(entradas: Array<EntradaDoPrompt & { t: number }>, prompts: Record<string, string>, deps: DependenciasDaGeracao): Promise<{ gerados: ElementoGerado[]; custoUsd: number; ms: number }> {
  const t0 = Date.now();
  const fila = entradas.filter((e) => prompts[e.id]);
  const gerados: ElementoGerado[] = [];
  const n = Math.max(1, Math.min(deps.concorrencia ?? 4, fila.length));
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < fila.length) {
        const e = fila[i++];
        gerados.push(await gerarElementoDaJornada(e, prompts[e.id], deps));
      }
    })
  );
  for (const e of entradas) if (!prompts[e.id]) gerados.push({ id: e.id, url: null, tipo: null, formato: e.formato, proporcao: null, custoUsd: 0, modelo: null, rodadas: 0, prompt: "", avisoAdmin: `${e.id}: sem prompt do Sonnet`, avisoCliente: `No momento ${mmss(e.t)}, o elemento "${e.descricao.slice(0, 80)}" não pôde ser gerado agora. Peça de novo esse elemento.`, tempos: { gerar: 0, recorte: 0, leitura: 0 } });
  return { gerados, custoUsd: +gerados.reduce((s, g) => s + g.custoUsd, 0).toFixed(4), ms: Date.now() - t0 };
}
