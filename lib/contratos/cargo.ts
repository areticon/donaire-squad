/**
 * O CARGO DO REPRESENTANTE LEGAL (06/10/2026).
 *
 * Pedido do dono: o quadro "Representante legal" do contrato traz o nome E o
 * cargo de quem assina pelo cliente ("Maria Silva, Sócio-administrador").
 *
 * Módulo PURO, sem banco: o formulário do gestor (componente de cliente), as
 * rotas, o texto do contrato, o PDF e os testes usam a MESMA lista e a MESMA
 * composição. Cargo em branco (contrato de antes) deixa só o nome, e o texto
 * dele continua idêntico ao que foi assinado (o hash não muda).
 */

/** As opções do seletor, na ordem em que aparecem. */
export const CARGOS_DO_REPRESENTANTE = ["Sócio-administrador", "Administrador", "Diretor", "Procurador", "Titular (MEI)", "Pessoa física"] as const;

/** O valor do seletor que abre o texto livre. */
export const CARGO_OUTRO = "outro" as const;

/** O cargo que o formulário já traz escolhido. */
export const CARGO_PADRAO: (typeof CARGOS_DO_REPRESENTANTE)[number] = "Sócio-administrador";

/** Tamanho máximo de um cargo escrito à mão. */
const TAMANHO_MAXIMO = 80;

/** O cargo limpo para gravar: sem espaço sobrando, sem passar do tamanho; vazio vira null. */
export function cargoLimpo(v: unknown): string | null {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, TAMANHO_MAXIMO) : "";
  return t || null;
}

/**
 * O que o formulário mostra para um cargo gravado: um da lista fica no
 * seletor; qualquer outro texto abre "Outro" com o texto preenchido; null
 * cai no padrão.
 */
export function cargoNoSeletor(gravado: string | null | undefined): { escolha: string; outro: string } {
  if (!gravado) return { escolha: CARGO_PADRAO, outro: "" };
  return (CARGOS_DO_REPRESENTANTE as readonly string[]).includes(gravado) ? { escolha: gravado, outro: "" } : { escolha: CARGO_OUTRO, outro: gravado };
}

/** "Nome, Cargo" para o quadro das partes e a frase "representado por". Sem cargo, só o nome; sem nome, null. */
export function representanteComCargo(nome: string | null | undefined, cargo: string | null | undefined): string | null {
  const n = nome?.trim();
  if (!n) return null;
  const c = cargo?.trim();
  return c ? `${n}, ${c}` : n;
}
