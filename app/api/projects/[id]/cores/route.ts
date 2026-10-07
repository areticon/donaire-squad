import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { esquecerIdentidade, identidadeDoProjeto } from "@/lib/media/identidade-visual";
import { estadoDaIdentidade } from "@/lib/modelos-de-arte/identidade-aprovada";
import { artesAguardandoIdentidade } from "@/lib/media/artes-aguardando-identidade";
import { contarArtesEsperando } from "@/lib/modelos-de-arte/espera-da-identidade";
import { ehPaletaDeFabrica, normalizarPaleta, vagasDaPaleta, type CoresDaTela } from "@/lib/marca/cores-da-marca";
import { sugestoesDeCores } from "@/lib/marca/sugestoes-de-cores";

/**
 * AS CORES DA MARCA PARA O SELETOR (08/10/2026), no setup e em Configurações.
 *
 * Só leitura e sem custo. Devolve a paleta salva (normalizada), as vagas por
 * papel (Principal, Fundo, Texto, apoio) já casadas com os papéis do book, o
 * que a arte usa enquanto a pessoa não escolheu (logo, manual ou setor), o
 * estado da identidade aprovada (para a tela avisar antes de uma troca
 * derrubar a aprovação) e as sugestões do logo, do manual e das capas.
 *
 * A gravação continua na rota do projeto (PATCH /api/projects/[id]), que
 * normaliza a string e mantém os papéis do book alinhados.
 */
export const dynamic = "force-dynamic";

const ROTULO_DA_ORIGEM: Record<string, string> = {
  configuracao: "as cores que você escolheu",
  manual: "as cores do seu manual de marca",
  logo: "as cores do seu logo",
  "logo-e-setor": "a cor do seu logo com tons do seu setor",
  setor: "cores do seu setor, porque ainda não há cor escolhida, logo nem manual",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const p = await prisma.project.findUnique({ where: { id }, select: { id: true, userId: true, colorPalette: true, logoUrl: true } });
  if (!p || !(await podeUsarProjeto(userId, p))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const salva = normalizarPaleta(p.colorPalette).cores;
  // A identidade fica 10 min em cache POR PROCESSO. Sem paleta salva, as cores
  // que a tela mostra são as da identidade (logo, manual ou setor), e o cache
  // podia estar velho: o upload do logo esquece a identidade só na instância
  // que recebeu o upload, e o seletor, lido noutra, seguia nas cores do setor
  // (revisão de 08/10). Aqui ela é sempre refeita: custa ler o logo, sem IA.
  if (!salva.length) esquecerIdentidade(id);
  const identidade = await identidadeDoProjeto(id);
  const [estado, aguardando, sugestoes] = await Promise.all([
    estadoDaIdentidade(id, p.colorPalette),
    artesAguardandoIdentidade(id).then(contarArtesEsperando).catch(() => 0),
    sugestoesDeCores(id, p.logoUrl),
  ]);
  const efetivas = salva.length ? salva : estado.paleta;
  const resposta: CoresDaTela = {
    paleta: salva,
    escolhida: salva.length > 0,
    deFabrica: ehPaletaDeFabrica(salva),
    efetivas: { cores: efetivas, origem: salva.length ? "configuracao" : identidade.origemDasCores, rotulo: ROTULO_DA_ORIGEM[salva.length ? "configuracao" : identidade.origemDasCores] ?? "" },
    // Com registro no book, as vagas mostram os papéis que a arte usa; sem
    // ele, a hierarquia da paleta (a mesma do vídeo).
    vagas: vagasDaPaleta(efetivas, estado.registro ? estado.papeis : null),
    identidade: { aprovada: estado.aprovada, papeis: estado.registro ? estado.papeis : null, aguardando },
    sugestoes,
    podeMudar: p.userId === userId,
  };
  return NextResponse.json(resposta);
}
