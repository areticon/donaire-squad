"use client";

import { BibliotecaDeMateriais } from "@/components/materiais/biblioteca-de-materiais";
import { EstiloDosPosts } from "@/components/estilo-dos-posts/estilo-dos-posts";

/**
 * A ETAPA FOTOS E ESTILO DO ASSISTENTE (08/10/2026).
 *
 * Decisões do Bruno, literais: "só use foto em post se for foto enviada pelo
 * usuário (que deve ser no início da configuração do projeto, isso tudo:
 * estilo de marca, dos posts, materiais, etc...)"; e "o usuário gera a
 * campanha toda e só no final descobre que está faltando aprovar o estilo".
 *
 * Até aqui o assistente pedia cores, logo, manual e documentos, e parava aí:
 * as fotos só eram pedidas em Criar e em Configurações, e o estilo dos posts
 * morava escondido em Configurações > Modelos de arte. Esta etapa vem logo
 * depois da Marca (as cores já estão salvas) e junta as duas coisas, com os
 * componentes que já existiam:
 *   - as FOTOS (a Biblioteca de materiais): da pessoa, do produto, do lugar.
 *     São as ÚNICAS fotos reais que entram nos posts;
 *   - o ESTILO DOS POSTS: escrever no chat ou escolher da biblioteca, e já
 *     fica aprovado.
 * Nada aqui trava o avanço: quem pular é perguntado de novo antes da primeira
 * campanha com arte (a janela da campanha e a jornada do vídeo).
 */
export function StepMateriais({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-bold text-[var(--text-primary)]">Fotos e estilo: como os seus posts vão ficar</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Suba as suas fotos e diga como quer as artes. Fica tudo pronto antes da primeira campanha, e você muda quando quiser em Configurações.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border p-4 sm:p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div>
          <p className="text-base font-bold text-[var(--text-primary)]">Suas fotos</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Fotos suas, do seu produto e do seu lugar. Só estas fotos entram nos seus posts: sem foto sua, a arte sai sem pessoa, e nunca com um print do seu vídeo. Não tem agora? Pode seguir e subir depois.
          </p>
        </div>
        <BibliotecaDeMateriais projectId={projectId} compacto />
      </section>

      <EstiloDosPosts
        projectId={projectId}
        sempreAberto
        explicacao="Escreva do seu jeito ou escolha um estilo da biblioteca. Escolheu, está aprovado: as artes das campanhas já saem nele."
      />
    </div>
  );
}
