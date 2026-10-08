"use client";

import { Building2 } from "lucide-react";
import { ConexaoAssistida } from "@/components/social/conexao-assistida";
import { BotaoDescartar, Descartavel } from "@/components/ui/descartar";
import { chaveDasPaginasDoLinkedin } from "@/lib/avisos/chaves";
import { PAGINA_DO_LINKEDIN, type PedidoDeConexao } from "@/lib/social/textos-da-conexao";

/**
 * A PORTA DA PÁGINA DE EMPRESA DO LINKEDIN, separada e com nome (04/10).
 *
 * Achado do dono testando como cliente novo: conectou o perfil e as páginas
 * não vieram. São dois apps no LinkedIn (o do perfil e o de páginas, com a
 * Community Management API), e um não dá o outro. A porta das páginas só
 * aparecia depois do perfil, como um "Conectar página" pequeno ao lado do selo
 * verde, e a volta dela não dizia nada: nem quantas páginas, nem que vinham
 * desligadas, nem que zero páginas tem saída.
 *
 * Agora: botão próprio, texto que diz o que acontece, e para os dois becos
 * (app de páginas não liberado, ou nenhuma página onde a pessoa é
 * administradora) a explicação e a conexão assistida.
 *
 * PELA PONTE (05/10, decisão do Bruno): o app de páginas do LinkedIn está no
 * nível de desenvolvimento e só autoriza quem é administrador do app. Com
 * `assistida`, a porta da página É a conexão assistida (destino
 * "linkedin-pagina"): o time conecta a página na ponte junto com o cliente, e
 * a publicação na página sai por lá. O botão do app próprio fica só para o
 * admin, como link discreto. O perfil pessoal não muda.
 *
 * Só importa componentes de tela e textos puros: nada que toque o banco.
 */
export function PaginaDeEmpresaLinkedIn({
  projectId,
  appLiberado,
  urlDoApp,
  paginas,
  resultado,
  pedido,
  onPedido,
  onSair,
  assistida = false,
  conectarDiretoUrl = null,
}: {
  projectId: string;
  /** LINKEDIN_PAGES_CLIENT_ID e _SECRET presentes no servidor. */
  appLiberado: boolean;
  urlDoApp: string;
  /** Quantas páginas de empresa o projeto já tem. */
  paginas: number;
  /** A volta do app de páginas: "nenhuma" quando o LinkedIn devolveu zero páginas. */
  resultado: "nenhuma" | "erro" | null;
  pedido: PedidoDeConexao | null;
  onPedido: (p: PedidoDeConexao) => void;
  onSair?: () => void;
  /** A página conecta pela conexão assistida (ver lib/social/conexao-assistida.ts). */
  assistida?: boolean;
  /** Só para admin, com a página assistida: o app de páginas próprio. */
  conectarDiretoUrl?: string | null;
}) {
  if (assistida) {
    return (
      <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }} data-linkedin-paginas="assistida">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-800/20 text-blue-400 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-medium text-[var(--text-primary)]">Página de empresa do LinkedIn</p>
            <p className="text-xs text-[var(--text-muted)]">
              {paginas > 0
                ? `${paginas === 1 ? "1 página conectada" : `${paginas} páginas conectadas`}. Para ligar outra página, peça uma nova conexão.`
                : "Para publicar em nome da empresa. Conectamos a página junto com você; o perfil pessoal continua no botão de cima."}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <ConexaoAssistida
            compacta
            projectId={projectId}
            rede={PAGINA_DO_LINKEDIN}
            temConta={paginas > 0}
            pedido={pedido}
            conectarDiretoUrl={conectarDiretoUrl}
            onPedido={onPedido}
          />
        </div>
      </div>
    );
  }

  const beco = !appLiberado || resultado !== null;

  return (
    <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }} data-linkedin-paginas>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-800/20 text-blue-400 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-medium text-[var(--text-primary)]">Página de empresa do LinkedIn</p>
          <p className="text-xs text-[var(--text-muted)]">
            {paginas > 0
              ? `${paginas === 1 ? "1 página encontrada" : `${paginas} páginas encontradas`}. Ligue abaixo a que vai receber posts.`
              : "Para publicar em nome da empresa. O LinkedIn mostra as páginas que você administra e você escolhe."}
          </p>
        </div>
        {appLiberado && (
          <a
            href={urlDoApp}
            onClick={onSair}
            className="text-xs px-3 py-1.5 rounded-lg border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-all shrink-0 w-full text-center sm:w-auto"
          >
            {paginas > 0 ? "Buscar outras páginas" : "Conectar página de empresa do LinkedIn"}
          </a>
        )}
      </div>

      {/* O beco se descarta (07/10) e recolhe na conexão assistida, que é a saída. */}
      {beco && (
        <Descartavel
          chave={chaveDasPaginasDoLinkedin(projectId, !appLiberado ? "nao-liberado" : (resultado ?? "sem-resultado"))}
          modo="recolher"
          compacto={
            <div className="mt-3">
              <ConexaoAssistida compacta projectId={projectId} rede="linkedin" temConta={false} pedido={pedido} conectarDiretoUrl={null} onPedido={onPedido} />
            </div>
          }
        >
        <div className="mt-3 space-y-2">
          <div className="flex items-start gap-1">
          <p className="flex-1 text-xs leading-relaxed text-[var(--text-primary)]">
            {!appLiberado
              ? "A conexão direta de páginas do LinkedIn ainda não está liberada para a sua conta. O time conecta a página com você:"
              : resultado === "nenhuma"
                ? "O LinkedIn não devolveu nenhuma página em que o seu perfil seja administrador. Na página da empresa no LinkedIn, em Ferramentas de administrador, confira se você é Superadministrador ou Administrador de conteúdo e tente de novo. Se for e a página ainda não vier, o time conecta com você:"
                : "O LinkedIn não concluiu a autorização da página. Tente de novo; se a recusa continuar, o time conecta com você:"}
          </p>
          <BotaoDescartar compacto className="-my-1" />
          </div>
          <ConexaoAssistida
            compacta
            projectId={projectId}
            rede="linkedin"
            temConta={false}
            pedido={pedido}
            conectarDiretoUrl={null}
            onPedido={onPedido}
          />
        </div>
        </Descartavel>
      )}
    </div>
  );
}
