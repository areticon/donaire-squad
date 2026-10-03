import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OS SEGREDOS DO AGENDAMENTO (01/10): assinatura do lead e da reunião, e a
 * cifra do que dá acesso a agenda de alguém (token de renovação do Google,
 * endereço iCal).
 *
 * AS CHAVES SAEM DE UM SEGREDO SÓ, por derivação (HKDF) com rótulos
 * diferentes: `AGENDA_SEGREDO` quando existir, senão o `BETTER_AUTH_SECRET`,
 * que todo ambiente já tem. Assinar e cifrar com a mesma chave crua seria
 * misturar usos; derivar dá uma chave por uso sem pedir variável nova.
 *
 * Trocar o segredo invalida os cookies de lead (a pessoa preenche de novo, uma
 * vez), os links de remarcar já enviados e as contas Google conectadas (é
 * preciso conectar de novo). Por isso `AGENDA_SEGREDO` existe: ele separa o
 * agendamento de uma troca de segredo do login.
 */

function segredoBase(): string {
  const s = process.env.AGENDA_SEGREDO || process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("AGENDA_SEGREDO ou BETTER_AUTH_SECRET ausente: o agendamento não tem como assinar.");
  return s;
}

const chaves = new Map<string, Buffer>();
function chave(rotulo: string): Buffer {
  let k = chaves.get(rotulo);
  if (!k) {
    k = Buffer.from(hkdfSync("sha256", segredoBase(), "demandou-agenda", rotulo, 32));
    chaves.set(rotulo, k);
  }
  return k;
}

const b64 = (b: Buffer) => b.toString("base64url");

function assinar(conteudo: string): string {
  return b64(createHmac("sha256", chave("assinatura")).update(conteudo).digest()).slice(0, 32);
}

function confere(conteudo: string, assinatura: string): boolean {
  const esperada = Buffer.from(assinar(conteudo));
  const veio = Buffer.from(assinatura);
  return esperada.length === veio.length && timingSafeEqual(esperada, veio);
}

/** O cookie que diz "este navegador é do lead X". Nunca o e-mail cru. */
export const COOKIE_DO_LEAD = "dmd_lead";
export const VALIDADE_DO_LEAD_DIAS = 180;

/** Token do lead com validade: "id.expira.assinatura", seguro para cookie e URL. */
export function tokenDoLead(leadId: string, dias = VALIDADE_DO_LEAD_DIAS): string {
  const expira = Math.floor(Date.now() / 1000) + dias * 86400;
  const corpo = `${leadId}.${expira}`;
  return `${corpo}.${assinar(`lead:${corpo}`)}`;
}

export function leadDoToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [id, expira, sig] = partes;
  if (!/^[a-z0-9]{10,40}$/i.test(id) || !/^\d+$/.test(expira)) return null;
  if (Number(expira) * 1000 < Date.now()) return null;
  return confere(`lead:${id}.${expira}`, sig) ? id : null;
}

/**
 * O link de remarcar e cancelar: "id.assinatura", sem validade, porque o
 * e-mail de lembrete sai dias depois e precisa do mesmo link. Não guarda nada
 * no banco: o cron reescreve o link a partir do id.
 */
export function tokenDaReuniao(reuniaoId: string): string {
  return `${reuniaoId}.${assinar(`reuniao:${reuniaoId}`)}`;
}

export function reuniaoDoToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [id, sig, ...resto] = token.split(".");
  if (resto.length || !id || !sig || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return confere(`reuniao:${id}`, sig) ? id : null;
}

/**
 * O link "marcar que começou" da pessoa do time (01/10, régua de alertas). É
 * outro rótulo de assinatura de propósito: o token do lead (remarcar,
 * cancelar, entrar na sala) não pode marcar a reunião como começada, e o do
 * time não abre o remarcar do lead.
 */
export function tokenDoComecou(reuniaoId: string): string {
  return `${reuniaoId}.${assinar(`comecou:${reuniaoId}`)}`;
}

export function reuniaoDoComecou(token: string | null | undefined): string | null {
  if (!token) return null;
  const [id, sig, ...resto] = token.split(".");
  if (resto.length || !id || !sig || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return confere(`comecou:${id}`, sig) ? id : null;
}

/** O "state" do OAuth do Google, amarrado à pessoa e ao admin, com 10 minutos. */
export function estadoDoOAuth(pessoaId: string, adminId: string): string {
  const expira = Math.floor(Date.now() / 1000) + 600;
  const corpo = `${pessoaId}.${adminId}.${expira}.${b64(randomBytes(8))}`;
  return `${corpo}.${assinar(`oauth:${corpo}`)}`;
}

export function lerEstadoDoOAuth(estado: string | null): { pessoaId: string; adminId: string } | null {
  if (!estado) return null;
  const partes = estado.split(".");
  if (partes.length !== 5) return null;
  const [pessoaId, adminId, expira, nonce, sig] = partes;
  if (Number(expira) * 1000 < Date.now()) return null;
  return confere(`oauth:${pessoaId}.${adminId}.${expira}.${nonce}`, sig) ? { pessoaId, adminId } : null;
}

/** AES-256-GCM: "v1.iv.tag.texto", tudo em base64url. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave("cifra"), iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", b64(iv), b64(c.getAuthTag()), b64(corpo)].join(".");
}

export function decifrar(cifrado: string): string {
  const [v, iv, tag, corpo] = cifrado.split(".");
  if (v !== "v1" || !iv || !tag || corpo === undefined) throw new Error("Cifra em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave("cifra"), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(corpo, "base64url")), d.final()]).toString("utf8");
}
