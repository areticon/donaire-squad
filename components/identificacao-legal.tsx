import Link from "next/link";

/**
 * Identificação do fornecedor, exigida pelo Decreto 7.962/2013 art. 2º, que
 * manda todo site que vende no Brasil exibir nome empresarial, CNPJ e
 * endereço físico e eletrônico "em local de destaque e de fácil visualização".
 *
 * Existe também por um segundo motivo, descoberto em 21/08/2026: o Google
 * marcou o demandou.com como "página enganosa". O site pedia senha e cartão
 * sem dizer quem era o dono, e esse é o retrato exato de phishing para um
 * classificador. Os dados estavam só dentro de /terms, onde ninguém lê e
 * nenhum robô associa à página de cadastro.
 *
 * Fonte única: mudou o cadastro da empresa, muda aqui e vale em todo lugar.
 */

export const EMPRESA = {
  razaoSocial: "DEMANDOU TECNOLOGIA DA INFORMACAO LTDA",
  cnpj: "66.140.770/0001-48",
  endereco: "Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150",
  email: "contato@demandou.com",
} as const;

export function IdentificacaoLegal({ className = "" }: { className?: string }) {
  return (
    <address
      className={`not-italic text-xs leading-relaxed text-[var(--text-muted)] ${className}`}
    >
      <span className="block">{EMPRESA.razaoSocial}</span>
      <span className="block">CNPJ {EMPRESA.cnpj}</span>
      <span className="block">{EMPRESA.endereco}</span>
      <span className="block">
        <a
          href={`mailto:${EMPRESA.email}`}
          className="hover:text-[var(--text-primary)] transition-colors underline underline-offset-2"
        >
          {EMPRESA.email}
        </a>
      </span>
    </address>
  );
}

/**
 * Versão curta, de uma linha, para o pé das telas de cadastro, entrada e
 * planos, onde o rodapé completo não cabe mas o anonimato é justamente o que
 * derruba a confiança.
 */
export function IdentificacaoCurta({ className = "" }: { className?: string }) {
  return (
    <div className={`text-center text-xs text-[var(--text-muted)] ${className}`}>
      <p>
        {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj}
      </p>
      <p className="mt-1">
        <a
          href={`mailto:${EMPRESA.email}`}
          className="hover:text-[var(--text-primary)] transition-colors"
        >
          {EMPRESA.email}
        </a>
        {" · "}
        <Link href="/terms" className="hover:text-[var(--text-primary)] transition-colors">
          Termos
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:text-[var(--text-primary)] transition-colors">
          Privacidade
        </Link>
      </p>
    </div>
  );
}
