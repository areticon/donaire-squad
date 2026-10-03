import { dirigirMontagem } from "@/lib/media/diretor-de-montagem";
import { revisarECorrigir, revisorLigado } from "@/lib/media/revisor-da-montagem";
import { perfilDoProjeto } from "@/lib/media/perfil-do-projeto";
import { contextoDoCorte, fundirNoTrecho, lerVideo, Recusa } from "@/lib/media/ajuste-pelo-chat";
import { estiloDosCortes, RecusaDoRoteiro } from "@/lib/media/roteiro-da-edicao";
import { montarTelaComReedicao } from "@/lib/media/reedicao";
import type { TelaDeRoteiro } from "@/lib/media/roteiro-em-texto";

/**
 * TROCAR DE ESTILO E REFAZER REPLANEJA (01/10/2026, decisão do Bruno).
 *
 * O cliente troca a linguagem do projeto (Vox para MrBeast) e volta à edição
 * de um vídeo já pronto: os cortes foram planejados no estilo antigo, e o
 * "Refazer com estes ajustes" reaproveitaria o plano antigo. Aqui, com a
 * reedição aberta, cada corte cujo plano é de outro estilo é planejado de novo
 * pelo diretor no estilo de agora, passa pelo revisor, e vira o RASCUNHO do
 * corte (o mesmo lugar que a tela de reedição edita). O que for gerado de
 * imagem e cena aparece em créditos no botão "Refazer", como qualquer ajuste.
 * O plano em si não é cobrado (o roteiro já foi pago; a Demandou absorve o
 * diretor, como absorve o revisor).
 *
 * O vídeo COMPLETO não é replanejado aqui: o caminho dele mora na montagem do
 * completo (a análise de tela compartilhada e os blocos), que está com o
 * agente do render. Fica para a Fase 2b, com o mesmo princípio.
 */

/** Replaneja, no rascunho da reedição, os cortes feitos em outro estilo. */
export async function replanejarCortesNoEstilo(videoId: string, userId: string): Promise<TelaDeRoteiro> {
  const v = await lerVideo(videoId, userId);
  if (!v) throw new RecusaDoRoteiro("Vídeo não encontrado.", 404);
  const tela = await montarTelaComReedicao(videoId, userId);
  if (!tela?.reedicao?.aberta) throw new RecusaDoRoteiro("Toque em Voltar à edição antes de replanejar no estilo novo.", 409);
  const { atual, cortesDeOutroEstilo: alvos } = estiloDosCortes(v);
  if (!alvos.length) throw new RecusaDoRoteiro("Os cortes deste vídeo já estão no estilo de agora.", 409);
  const perfil = await perfilDoProjeto(v.projectId);
  const pessoa = { x: 0.2, y: 0, w: 0.6, h: 1 };
  const rosto = { x: pessoa.x + pessoa.w * 0.3, y: pessoa.y + 0.1, w: pessoa.w * 0.4, h: 0.3 };
  const falhas: string[] = [];
  await Promise.all(
    alvos.map(async (i) => {
      try {
        const ctx = await contextoDoCorte(v, i, "rascunho");
        if (!ctx.fala?.palavras?.length || !ctx.t.roteiro) return;
        const d = await dirigirMontagem({
          projectId: v.projectId,
          referencia: `${v.id}/replanejar/${i}`,
          palavras: ctx.fala.palavras,
          duracao: ctx.fala.duracao,
          formato: "9:16",
          rosto,
          pessoa,
          escolha: v.project.videoEstiloEscolha,
          videoStyle: v.project.videoStyle,
          colorPalette: v.project.colorPalette,
          nicho: v.project.niche,
          titulo: (ctx.t as { titulo?: string }).titulo ?? null,
          perfil,
        });
        let plano = d.plano;
        let revisao = null;
        if (revisorLigado()) {
          const r = await revisarECorrigir({
            projectId: v.projectId,
            referencia: `${v.id}/replanejar/${i}`,
            plano,
            palavras: ctx.fala.palavras,
            duracao: ctx.fala.duracao,
            formato: "9:16",
            escolha: v.project.videoEstiloEscolha,
            videoStyle: v.project.videoStyle,
            colorPalette: v.project.colorPalette,
            nicho: v.project.niche,
            modo: "corte",
            perfil,
          });
          plano = r.plano;
          revisao = r.revisao;
        }
        // O plano novo vira o rascunho do corte, e o "desfazer" volta a ele.
        await fundirNoTrecho(v.id, i, { roteiro: { ...ctx.t.roteiro, plano, planoOriginal: plano, origem: "diretor", estiloId: atual, revisao, feitoEm: new Date().toISOString() } });
      } catch (e) {
        if (e instanceof Recusa) falhas.push(e.message);
        else falhas.push(e instanceof Error ? e.message.slice(0, 120) : "falhou");
        console.error(`[replanejar ${videoId}/${i}]`, e);
      }
    })
  );
  if (falhas.length === alvos.length) throw new RecusaDoRoteiro(`Não consegui replanejar agora: ${falhas[0]}`, 502);
  return (await montarTelaComReedicao(videoId, userId))!;
}
