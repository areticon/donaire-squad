"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { PLANOS_PUBLICOS } from "@/lib/planos";
import {
  ACESSO_EXTRA_ANUAL_CENTAVOS,
  MOTIVOS_DE_DESCONTO,
  NOME_DA_FAIXA,
  TETO_COM_APROVACAO,
  TETO_SEM_APROVACAO,
  calcularDesconto,
  diferencaProporcional,
  faixaDoDesconto,
  porcentagem,
  precoDeTabela,
  type ValorDoPreco,
} from "@/lib/contratos/preco";
import { CONDICAO_PARCELADA, CONDICOES_DE_PAGAMENTO, PARCELAS_MAXIMAS, PARCELAS_MINIMAS, calcularParcelamento, condicaoPorExtenso, entradaSugerida, type CondicaoDePagamento } from "@/lib/contratos/condicao";

/**
 * A CONDIÇÃO DE PAGAMENTO no formulário (05/10): à vista, ou 1ª parcela no
 * Pix mais N parcelas no cartão em crédito recorrente (ferramenta de
 * negociação dos vendedores). A conta é a de lib/contratos/condicao.ts, a
 * mesma do servidor; o corpo vai nos campos que formulario.ts lê.
 */
export type ValorDaCondicao = { tipo: CondicaoDePagamento; entradaReais: string; parcelas: number; primeiraParcelaEm: string };

export const condicaoInicial: ValorDaCondicao = { tipo: "a_vista", entradaReais: "", parcelas: 10, primeiraParcelaEm: "" };

export function corpoDaCondicao(v: ValorDaCondicao) {
  return v.tipo === CONDICAO_PARCELADA
    ? { condicaoDePagamento: v.tipo, entradaReais: v.entradaReais, parcelas: v.parcelas, primeiraParcelaEm: v.primeiraParcelaEm || "" }
    : { condicaoDePagamento: "a_vista" };
}

/** O motivo que trava o envio, ou null. */
export function bloqueiaCondicao(v: ValorDaCondicao, totalCentavos: number): string | null {
  if (v.tipo !== CONDICAO_PARCELADA) return null;
  const p = calcularParcelamento(totalCentavos, Math.round(numero(v.entradaReais) * 100), v.parcelas);
  return "erro" in p ? p.erro : null;
}

export function CamposDaCondicao({ valor, mudar, totalCentavos }: { valor: ValorDaCondicao; mudar: (v: ValorDaCondicao) => void; totalCentavos: number }) {
  const set = (p: Partial<ValorDaCondicao>) => mudar({ ...valor, ...p });
  const parcelado = valor.tipo === CONDICAO_PARCELADA;
  const conta = parcelado ? calcularParcelamento(totalCentavos, Math.round(numero(valor.entradaReais) * 100), valor.parcelas) : null;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <fieldset className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-3" style={{ borderColor: "var(--border)" }} data-campos-da-condicao>
      <legend className="px-1 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
        Condição de pagamento
      </legend>
      <label className={`sm:col-span-3 ${rotulo}`} style={corDoRotulo}>
        Como o cliente paga
        <select
          value={valor.tipo}
          onChange={(e) => {
            const tipo = e.target.value as CondicaoDePagamento;
            const entrada = tipo === CONDICAO_PARCELADA && !valor.entradaReais ? (entradaSugerida(totalCentavos, valor.parcelas) / 100).toFixed(2).replace(".", ",") : valor.entradaReais;
            set({ tipo, entradaReais: entrada });
          }}
          className={`${campo} mt-1`}
          style={estiloCampo}
          data-campo-condicao
        >
          {Object.entries(CONDICOES_DE_PAGAMENTO).map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
      </label>
      {parcelado && (
        <>
          <label className={rotulo} style={corDoRotulo}>
            1ª parcela no Pix (R$)
            <input inputMode="decimal" value={valor.entradaReais} onChange={(e) => set({ entradaReais: e.target.value })} placeholder="Ex.: 1.500,00" className={`${campo} mt-1`} style={estiloCampo} data-campo-entrada />
          </label>
          <label className={rotulo} style={corDoRotulo}>
            Parcelas no cartão ({PARCELAS_MINIMAS} a {PARCELAS_MAXIMAS})
            <input type="number" min={PARCELAS_MINIMAS} max={PARCELAS_MAXIMAS} step={1} value={valor.parcelas} onChange={(e) => set({ parcelas: Math.max(PARCELAS_MINIMAS, Math.min(PARCELAS_MAXIMAS, Math.floor(Number(e.target.value) || 0))) })} className={`${campo} mt-1`} style={estiloCampo} data-campo-parcelas />
          </label>
          <label className={rotulo} style={corDoRotulo}>
            Primeira parcela no cartão (opcional: sem data, um mês depois do Pix)
            <input type="date" min={hoje} value={valor.primeiraParcelaEm} onChange={(e) => set({ primeiraParcelaEm: e.target.value })} className={`${campo} mt-1`} style={estiloCampo} />
          </label>
          <p className="sm:col-span-3 text-xs" style={{ color: conta && "erro" in conta ? "var(--badge-danger-text)" : "var(--text-muted)" }} data-conta-da-condicao aria-live="polite">
            {conta && "erro" in conta
              ? conta.erro
              : conta
                ? `${condicaoPorExtenso({ ...conta, primeiraParcelaEm: valor.primeiraParcelaEm ? `${valor.primeiraParcelaEm}T12:00:00-03:00` : null })}.${conta.ajusteNaEntradaCentavos ? ` Os ${reais(conta.ajusteNaEntradaCentavos)} que sobram da divisão vão para a 1ª parcela, para as parcelas ficarem iguais.` : ""} O Pix é feito por fora e registrado com o comprovante; o contrato sai com o link do cartão.`
                : ""}
          </p>
        </>
      )}
    </fieldset>
  );
}


/**
 * O PREÇO NO GESTOR DE CONTRATOS (04/10/2026): os campos de plano, acessos
 * extras e desconto (em % ou em reais, com motivo), com a conta ao vivo de
 * tabela, desconto e valor final, e a faixa do desconto (o vendedor concede,
 * precisa do dono, bloqueado). A conta é a de lib/contratos/preco.ts, a mesma
 * do servidor. Aqui também moram a versão nova antes de assinar, o aditivo
 * depois de assinado e a decisão do dono. Não importa nada que toque o banco.
 */

const campo = "w-full rounded-lg border px-3 py-2 text-sm";
const estiloCampo = { borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" };
const rotulo = "text-xs font-medium";
const corDoRotulo = { color: "var(--text-muted)" };
const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function chamar(url: string, corpo: Record<string, unknown> | FormData) {
  const r = await fetch(url, {
    method: "POST",
    ...(corpo instanceof FormData ? { body: corpo } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }),
  });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Não deu certo.");
  return d;
}

/** "7,5" e "1.500,00" viram número. */
function numero(v: string): number {
  const t = v.replace(/[^\d.,]/g, "");
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function contaDoPreco(v: ValorDoPreco) {
  const tabela = precoDeTabela(v.plano, v.extras);
  const total = tabela?.totalCentavos ?? 0;
  const n = numero(v.valor);
  const d = calcularDesconto(total, n > 0 ? v.tipo : null, v.tipo === "percentual" ? n : Math.round(n * 100));
  return { tabela, ...d, faixa: faixaDoDesconto(d.percentual) };
}

/** O corpo que as rotas leem (lib/contratos/formulario.ts). */
export function corpoDoPreco(v: ValorDoPreco) {
  return {
    plano: v.plano,
    acessosExtras: v.extras,
    descontoTipo: v.tipo,
    descontoValor: numero(v.valor) > 0 ? v.valor : "",
    descontoMotivo: v.motivo,
    descontoObservacao: v.observacao,
    fundador: v.fundador,
  };
}

const COR_DA_FAIXA = {
  sem_desconto: "var(--text-muted)",
  livre: "var(--painel-1)",
  aprovacao: "var(--marca-laranja-texto)",
  bloqueado: "var(--badge-danger-text)",
} as const;

/**
 * Os campos do preço e o quadro da conta. Controlado: quem usa guarda o
 * estado (o contrato novo, a versão nova e o aditivo).
 */
export function CamposDoPreco({ valor, mudar, rotuloDoPlano = "Plano (anual)" }: { valor: ValorDoPreco; mudar: (v: ValorDoPreco) => void; rotuloDoPlano?: string }) {
  const conta = contaDoPreco(valor);
  const set = (p: Partial<ValorDoPreco>) => mudar({ ...valor, ...p });
  const comDesconto = conta.descontoCentavos > 0;
  return (
    <>
      <label className={rotulo} style={corDoRotulo}>
        {rotuloDoPlano}
        <select value={valor.plano} onChange={(e) => set({ plano: e.target.value })} className={`${campo} mt-1`} style={estiloCampo} data-campo-plano>
          {PLANOS_PUBLICOS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}, {reais(p.anual * 100)} por ano
            </option>
          ))}
        </select>
      </label>
      <label className={rotulo} style={corDoRotulo}>
        Acessos extras ({reais(ACESSO_EXTRA_ANUAL_CENTAVOS)} por ano cada, preço de tabela)
        <input
          type="number"
          min={0}
          max={200}
          step={1}
          value={valor.extras}
          onChange={(e) => set({ extras: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          className={`${campo} mt-1`}
          style={estiloCampo}
          data-campo-extras
        />
      </label>
      <fieldset className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]" style={{ borderColor: "var(--border)" }} data-campos-do-desconto>
        <legend className="px-1 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
          Desconto (opcional)
        </legend>
        {/* "Em" fica em coluna, como os outros rótulos, e o seletor na altura dos campos. */}
        <div className={`${rotulo} flex flex-col`} style={corDoRotulo}>
          Em
          <div className="mt-1 inline-flex h-[38px] w-fit items-center rounded-lg border p-0.5" style={{ borderColor: "var(--border)" }} role="radiogroup" aria-label="Desconto em porcentagem ou em reais">
            {(
              [
                ["percentual", "%"],
                ["valor", "R$"],
              ] as const
            ).map(([id, nome]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={valor.tipo === id}
                onClick={() => set({ tipo: id, valor: "" })}
                className="min-w-10 rounded-md px-3 py-1.5 text-xs font-semibold"
                style={valor.tipo === id ? { background: "var(--realce-2)", color: "var(--text-primary)" } : { color: "var(--text-muted)" }}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>
        <label className={rotulo} style={corDoRotulo}>
          {valor.tipo === "percentual" ? `Porcentagem (até ${TETO_COM_APROVACAO}%)` : "Valor do desconto no ano (R$)"}
          <input inputMode="decimal" value={valor.valor} onChange={(e) => set({ valor: e.target.value })} placeholder={valor.tipo === "percentual" ? "Ex.: 8" : "Ex.: 2.000,00"} className={`${campo} mt-1`} style={estiloCampo} data-campo-desconto />
        </label>
        <label className={rotulo} style={corDoRotulo}>
          Motivo {comDesconto ? "(obrigatório)" : ""}
          <select value={valor.motivo} onChange={(e) => set({ motivo: e.target.value, ...(e.target.value === "fundador" ? { fundador: true } : {}) })} required={comDesconto} className={`${campo} mt-1`} style={estiloCampo} data-campo-motivo>
            <option value="">Escolha o motivo</option>
            {Object.entries(MOTIVOS_DE_DESCONTO).map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        {comDesconto && (
          <label className={`sm:col-span-3 ${rotulo}`} style={corDoRotulo}>
            Detalhe do motivo (opcional: a campanha, o parceiro, o que foi negociado)
            <input value={valor.observacao} onChange={(e) => set({ observacao: e.target.value })} maxLength={300} className={`${campo} mt-1`} style={estiloCampo} />
          </label>
        )}
      </fieldset>
      <label className="sm:col-span-2 inline-flex items-start gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
        <input type="checkbox" checked={valor.fundador} onChange={(e) => set({ fundador: e.target.checked })} className="mt-1" data-campo-fundador />
        <span>
          Condição de Fundador (cláusula 5.6)
          <span className="block text-xs" style={corDoRotulo}>
            O cliente mantém o preço desta contratação nas renovações sem interrupção, sem o reajuste da cláusula 5.4.
          </span>
        </span>
      </label>
      <div className="sm:col-span-2 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} data-conta-do-preco aria-live="polite">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs" style={corDoRotulo}>
              Preço de tabela
            </dt>
            <dd className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {reais(conta.tabela?.totalCentavos ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs" style={corDoRotulo}>
              Desconto
            </dt>
            <dd className="font-semibold tabular-nums" style={{ color: comDesconto ? COR_DA_FAIXA[conta.faixa] : "var(--text-primary)" }}>
              {comDesconto ? `${porcentagem(conta.percentual)}, menos ${reais(conta.descontoCentavos)}` : "nenhum"}
            </dd>
          </div>
          <div>
            <dt className="text-xs" style={corDoRotulo}>
              Valor anual final
            </dt>
            <dd className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }} data-valor-final>
              {reais(conta.finalCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs" style={corDoRotulo}>
              Equivale por mês
            </dt>
            <dd className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {reais(Math.round(conta.finalCentavos / 12))}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs font-semibold" style={{ color: COR_DA_FAIXA[conta.faixa] }} data-faixa-do-desconto={conta.faixa}>
          {NOME_DA_FAIXA[conta.faixa]}
          {conta.faixa === "aprovacao" ? ". O pedido fica na trilha e o dono recebe o aviso por e-mail." : ""}
        </p>
      </div>
    </>
  );
}

function bloqueiaEnvio(v: ValorDoPreco) {
  const c = contaDoPreco(v);
  if (c.faixa === "bloqueado") return `Desconto acima de ${TETO_COM_APROVACAO}% não sai.`;
  if (c.descontoCentavos > 0 && !v.motivo) return "Escolha o motivo do desconto.";
  return null;
}

/**
 * A VERSÃO NOVA, antes de assinar: o preço e os dados de quem assina. Se o
 * contrato já estava no provedor, o servidor cancela o envio e reenvia.
 */
export function EditarContrato({
  id,
  enviado,
  inicial,
  dados,
  aoFechar,
}: {
  id: string;
  enviado: boolean;
  inicial: ValorDoPreco;
  dados: { empresa: string | null; signatarioNome: string | null; signatarioEmail: string | null; signatarioDocumento: string | null; inicio: string | null };
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [preco, setPreco] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const erro = bloqueiaEnvio(preco);
    if (erro) return void toast.error(erro);
    const f = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      const d = await chamar(`/api/admin/contratos/${id}`, {
        acao: "editar",
        ...corpoDoPreco(preco),
        empresa: f.get("empresa"),
        signatarioNome: f.get("nome"),
        signatarioEmail: f.get("email"),
        signatarioDocumento: f.get("documento"),
        inicioVigencia: f.get("inicio") ?? "",
      });
      toast.success(
        d.reenviado
          ? `Versão ${String(d.versao)} salva. O envio anterior foi cancelado e a versão nova foi para assinatura.`
          : d.motivo
            ? `Versão ${String(d.versao)} salva. O envio anterior foi cancelado; ${String(d.motivo)}`
            : `Versão ${String(d.versao)} salva.`,
        { duration: 7000 },
      );
      aoFechar();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu certo.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <form onSubmit={salvar} className="mt-3 grid w-full grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2" style={{ borderColor: "var(--border)" }} data-editar-contrato={id}>
      <p className="sm:col-span-2 text-xs" style={corDoRotulo}>
        Salvar cria a versão seguinte; a anterior fica inteira na trilha.{enviado ? " Este contrato já está no provedor de assinatura: o envio anterior é cancelado e a versão nova vai no lugar." : ""}
      </p>
      <CamposDoPreco valor={preco} mudar={setPreco} />
      <label className={rotulo} style={corDoRotulo}>
        Empresa (razão social)
        <input name="empresa" defaultValue={dados.empresa ?? ""} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
        CNPJ ou CPF
        <input name="documento" defaultValue={dados.signatarioDocumento ?? ""} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
        Nome de quem assina
        <input name="nome" defaultValue={dados.signatarioNome ?? ""} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
        E-mail de quem assina
        <input name="email" type="email" defaultValue={dados.signatarioEmail ?? ""} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <label className={rotulo} style={corDoRotulo}>
        Início da vigência (opcional)
        <input type="date" name="inicio" defaultValue={dados.inicio ?? ""} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <div className="flex items-end justify-end gap-2">
        <button type="button" onClick={aoFechar} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Fechar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {enviando ? "Salvando..." : enviado ? "Salvar e reenviar" : "Salvar versão nova"}
        </button>
      </div>
    </form>
  );
}

/**
 * O ADITIVO, depois de assinado: o que muda (plano, acessos, desconto,
 * Fundador), desde quando, e a diferença proporcional calculada ao vivo.
 */
export function NovoAditivo({
  id,
  atual,
  vigencia,
  aoFechar,
}: {
  id: string;
  atual: ValorDoPreco & { valorAnualCentavos: number; nomeDoPlano: string };
  vigencia: { inicio: string; fim: string };
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [preco, setPreco] = useState<ValorDoPreco>({ ...atual });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [desde, setDesde] = useState(hoje);
  const [enviando, setEnviando] = useState(false);
  const conta = contaDoPreco(preco);
  const dif = diferencaProporcional({
    valorAtualCentavos: atual.valorAnualCentavos,
    valorNovoCentavos: conta.finalCentavos,
    inicioVigencia: new Date(vigencia.inicio),
    fimVigencia: new Date(vigencia.fim),
    desde: new Date(`${desde}T12:00:00-03:00`),
  });
  async function criar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const erro = bloqueiaEnvio(preco);
    if (erro) return void toast.error(erro);
    setEnviando(true);
    try {
      const d = await chamar(`/api/admin/contratos/${id}`, { acao: "aditivo", ...corpoDoPreco(preco), valeDesde: desde });
      toast.success(`Aditivo nº ${String(d.ordem)} criado como rascunho. Confira o texto e envie para assinar.`);
      aoFechar();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não deu certo.");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <form onSubmit={criar} className="mt-3 grid w-full grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2" style={{ borderColor: "var(--border)" }} data-novo-aditivo={id}>
      <p className="sm:col-span-2 text-xs" style={corDoRotulo}>
        Contrato assinado não se edita. O aditivo diz o que muda, desde quando e a diferença; vai para assinatura pelo mesmo provedor e, assinado (e pago, se houver diferença a
        pagar), muda a conta. Hoje: {atual.nomeDoPlano}, {atual.extras} acesso(s) extra(s), {reais(atual.valorAnualCentavos)} por ano.
      </p>
      <CamposDoPreco valor={preco} mudar={setPreco} rotuloDoPlano="Plano depois do aditivo" />
      <label className={rotulo} style={corDoRotulo}>
        A mudança vale a partir de
        <input type="date" value={desde} min={vigencia.inicio.slice(0, 10)} max={vigencia.fim.slice(0, 10)} onChange={(e) => setDesde(e.target.value)} className={`${campo} mt-1`} style={estiloCampo} />
      </label>
      <div className="self-end rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} data-diferenca-do-aditivo>
        <p className="text-xs" style={corDoRotulo}>
          Diferença proporcional ({dif.diasRestantes} de {dif.diasDaVigencia} dias)
        </p>
        <p className="font-semibold tabular-nums" style={{ color: dif.diferencaCentavos > 0 ? "var(--marca-laranja-texto)" : "var(--text-primary)" }}>
          {dif.diferencaCentavos > 0
            ? `Cobrar ${reais(dif.diferencaCentavos)}`
            : dif.diferencaCentavos < 0
              ? `Crédito de ${reais(-dif.diferencaCentavos)} na renovação`
              : "Sem diferença de valor"}
        </p>
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={aoFechar} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Fechar
        </button>
        <button type="submit" disabled={enviando} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {enviando ? "Criando..." : "Criar aditivo"}
        </button>
      </div>
    </form>
  );
}

/** A DECISÃO DO DONO sobre o desconto acima do teto livre (contrato ou aditivo). */
export function DecisaoDoDesconto({ url, souDono, aprovador, percentual }: { url: string; souDono: boolean; aprovador: string; percentual: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  async function decidir(corpo: Record<string, unknown>, ok: string) {
    setOcupado(true);
    try {
      await chamar(url, corpo);
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--painel-2)", background: "var(--bg-elevated)" }} data-espera-aprovacao>
      <p className="text-xs font-semibold" style={{ color: "var(--marca-laranja-texto)" }}>
        Desconto de {porcentagem(percentual)} passa de {TETO_SEM_APROVACAO}%: espera a aprovação de um sócio antes de ir para assinatura.
        {souDono ? "" : ` Quem aprova: ${aprovador}.`}
      </p>
      {souDono && (
        <>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void decidir({ acao: "aprovar_desconto" }, "Desconto aprovado. A aprovação ficou na trilha.")}
            className="rounded-lg bg-[var(--marca-laranja-botao)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            data-aprovar-desconto
          >
            Aprovar desconto
          </button>
          {!url.includes("/aditivos/") && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                const motivo = window.prompt("Motivo da recusa (fica na trilha):");
                if (motivo) void decidir({ acao: "recusar_desconto", motivo }, "Desconto recusado. O vendedor faz uma versão nova.");
              }}
              className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--badge-danger-text)" }}
            >
              Recusar
            </button>
          )}
        </>
      )}
    </div>
  );
}

const FORMAS = [
  { id: "pix", nome: "Pix" },
  { id: "boleto", nome: "Boleto" },
  { id: "transferencia", nome: "Transferência" },
  { id: "cartao", nome: "Cartão" },
] as const;

/** As ações do aditivo: texto, enviar, assinar à mão, pagamento da diferença, cancelar. */
export function AcoesDoAditivo({ contratoId, id, status, assinado, faltaCentavos, temProvedor }: { contratoId: string; id: string; status: string; assinado: boolean; faltaCentavos: number; temProvedor: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const url = `/api/admin/contratos/${contratoId}/aditivos/${id}`;
  async function fazer(acao: string, corpo: Record<string, unknown> | FormData, ok: string) {
    setOcupado(acao);
    try {
      const d = await chamar(url, corpo);
      toast.success(d.situacao === "aguardando_provedor" ? "Aguardando provedor: falta ligar a assinatura eletrônica." : ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(null);
    }
  }
  const botao = "rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 hover:bg-[var(--realce-2)]";
  const estilo = { borderColor: "var(--border)", color: "var(--text-primary)" };
  const vivo = status !== "cancelado" && status !== "aplicado";
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <div className="flex flex-wrap items-center gap-2" data-acoes-do-aditivo={id}>
      <a href={`${url}/texto`} target="_blank" rel="noopener noreferrer" className={botao} style={estilo}>
        Ver o texto
      </a>
      {(status === "rascunho" || status === "enviado") && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => void fazer("enviar", { acao: "enviar" }, "Aditivo enviado para assinatura.")} data-enviar-aditivo>
          {ocupado === "enviar" ? "Enviando..." : status === "enviado" ? "Enviar de novo" : "Enviar para assinar"}
        </button>
      )}
      {status === "enviado" && temProvedor && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => void fazer("sincronizar", { acao: "sincronizar" }, "Situação conferida no provedor.")}>
          Conferir no provedor
        </button>
      )}
      {vivo && !assinado && (
        <button type="button" disabled={Boolean(ocupado)} className={botao} style={estilo} onClick={() => void fazer("assinar", { acao: "assinar_manual" }, "Aditivo marcado como assinado.")}>
          Marcar assinado (sem PDF)
        </button>
      )}
      {status === "aguardando_pagamento" && faltaCentavos > 0 && (
        <>
          <button type="button" className="rounded-lg bg-[var(--marca-laranja-botao)] px-2.5 py-1.5 text-xs font-semibold text-white" onClick={() => setPagando((v) => !v)} data-abrir-pagamento-aditivo={id}>
            Registrar pagamento da diferença
          </button>
          <button
            type="button"
            disabled={Boolean(ocupado)}
            className={botao}
            style={estilo}
            onClick={async () => {
              setOcupado("link");
              try {
                const d = await chamar(url, { acao: "link_pagamento" });
                await navigator.clipboard?.writeText(String(d.link ?? "")).catch(() => undefined);
                toast.success("Link de pagamento gerado e copiado.");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não deu certo.");
              } finally {
                setOcupado(null);
              }
            }}
          >
            {ocupado === "link" ? "Gerando..." : "Gerar link de pagamento (Stripe)"}
          </button>
        </>
      )}
      {vivo && (
        <button
          type="button"
          disabled={Boolean(ocupado)}
          className={botao}
          style={{ ...estilo, color: "var(--badge-danger-text)" }}
          onClick={() => {
            const motivo = window.prompt("Motivo do cancelamento do aditivo (fica na trilha):");
            if (motivo) void fazer("cancelar", { acao: "cancelar", motivo }, "Aditivo cancelado.");
          }}
        >
          Cancelar aditivo
        </button>
      )}
      {pagando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("acao", "pagamento");
            void fazer("pagamento", fd, "Pagamento da diferença registrado.").then(() => setPagando(false));
          }}
          className="mt-2 grid w-full grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-4"
          style={{ borderColor: "var(--border)" }}
          data-registrar-pagamento-aditivo={id}
        >
          <label className={rotulo} style={corDoRotulo}>
            Valor recebido (R$)
            <input name="valorReais" required inputMode="decimal" defaultValue={(faltaCentavos / 100).toFixed(2).replace(".", ",")} className={`${campo} mt-1`} style={estiloCampo} />
          </label>
          <label className={rotulo} style={corDoRotulo}>
            Data do pagamento
            <input name="pagoEm" type="date" required defaultValue={hoje} max={hoje} className={`${campo} mt-1`} style={estiloCampo} />
          </label>
          <label className={rotulo} style={corDoRotulo}>
            Forma
            <select name="forma" required defaultValue="pix" className={`${campo} mt-1`} style={estiloCampo}>
              {FORMAS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>
          <label className={rotulo} style={corDoRotulo}>
            Comprovante (PDF ou imagem, até 4 MB)
            <input name="comprovante" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className={`${campo} mt-1`} style={estiloCampo} />
          </label>
          <div className="sm:col-span-4 flex justify-end gap-2">
            <button type="button" onClick={() => setPagando(false)} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Fechar
            </button>
            <button type="submit" disabled={Boolean(ocupado)} className="rounded-lg bg-[var(--marca-laranja-botao)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              Confirmar pagamento
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
