"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarDoUsuario } from "@/components/ui/avatar-do-usuario";
import { RecorteDeFoto, TETO_DA_FOTO_ORIGINAL } from "@/components/settings/recorte-de-foto";
import toast from "react-hot-toast";

/**
 * Os dados da conta. Nome e foto são editáveis: e-mail é identidade de login e
 * trocar exige reverificação, que é outro fluxo. O selo diz por onde a pessoa
 * entra, porque quem entrou pelo Google não tem senha para procurar.
 *
 * A foto virou editável em 17/09. Antes ela vinha só do provedor social, e a do
 * LinkedIn expira sozinha: a URL é assinada com prazo. Quem depende da foto de
 * um terceiro fica à mercê da data de validade dele, então a pessoa precisa
 * poder trocar a qualquer momento por uma que é nossa e não vence.
 */
export function ContaForm({
  nomeInicial,
  email,
  provedor,
  imagem,
}: {
  nomeInicial: string;
  email: string;
  provedor: string | null;
  imagem: string | null;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [salvando, setSalvando] = useState(false);
  const [foto, setFoto] = useState<string | null>(imagem);
  const [mexendoNaFoto, setMexendoNaFoto] = useState(false);
  const campoDeArquivo = useRef<HTMLInputElement>(null);
  const [aRecortar, setARecortar] = useState<File | null>(null);

  const mudou = nome.trim() !== nomeInicial.trim();

  /**
   * Recebe o RECORTE, nao o arquivo original.
   *
   * O original fica na maquina da pessoa: o recorte de 512 por 512 sai em torno
   * de 100 KB, e foi assim que a reclamacao do limite de 2 MB deixou de existir
   * sem afrouxar nada no servidor.
   */
  async function trocarFoto(recorte: Blob) {
    setMexendoNaFoto(true);
    try {
      const corpo = new FormData();
      corpo.append("foto", recorte, "foto.jpg");
      const res = await fetch("/api/account/foto", { method: "POST", body: corpo });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro");
      setFoto(data.url as string);
      toast.success("Foto atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar a foto.");
    } finally {
      setMexendoNaFoto(false);
      setARecortar(null);
      if (campoDeArquivo.current) campoDeArquivo.current.value = "";
    }
  }

  async function removerFoto() {
    setMexendoNaFoto(true);
    try {
      const res = await fetch("/api/account/foto", { method: "DELETE" });
      if (!res.ok) throw new Error("erro");
      setFoto(null);
      toast.success("Foto removida. Suas iniciais voltam a aparecer.");
    } catch {
      toast.error("Não consegui remover a foto.");
    } finally {
      setMexendoNaFoto(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro");
      toast.success("Nome salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section
      className="flex flex-col gap-5 rounded-xl border p-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          Seus dados
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          O nome aparece nos e-mails que a plataforma manda para você.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <AvatarDoUsuario
            src={foto}
            nome={nome}
            email={email}
            className="h-14 w-14"
            classeDoTexto="text-[20px]"
          />
          <div className="flex flex-col items-start gap-1">
            <input
              ref={campoDeArquivo}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (!arquivo) return;
                if (arquivo.size > TETO_DA_FOTO_ORIGINAL) {
                  toast.error("Essa imagem é grande demais. Escolha uma de até 25 MB.");
                  e.target.value = "";
                  return;
                }
                setARecortar(arquivo);
              }}
            />
            <button
              type="button"
              disabled={mexendoNaFoto}
              onClick={() => campoDeArquivo.current?.click()}
              className="text-[13px] font-medium text-orange-500 hover:underline disabled:opacity-50"
            >
              {mexendoNaFoto ? "Salvando..." : foto ? "Trocar foto" : "Escolher foto"}
            </button>
            {foto && (
              <button
                type="button"
                disabled={mexendoNaFoto}
                onClick={() => void removerFoto()}
                className="text-[13px] hover:underline disabled:opacity-50"
                style={{ color: "var(--text-muted)" }}
              >
                Remover
              </button>
            )}
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Você escolhe o enquadramento no círculo
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 flex-1 gap-4 sm:grid-cols-2">
          <Input
            label="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Como você quer ser chamado"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              E-mail
            </label>
            <div
              className="flex h-10 items-center justify-between gap-2 rounded-md border px-3 text-sm"
              style={{
                background: "var(--bg-input)",
                borderColor: "var(--border)",
                color: "var(--text-muted)",
              }}
            >
              <span className="truncate">{email}</span>
              {provedor && (
                <span
                  className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={{ borderColor: "var(--border)" }}
                >
                  Entra com {provedor}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <Button onClick={salvar} loading={salvando} disabled={!mudou || nome.trim().length < 2}>
          Salvar
        </Button>
      </div>

      {aRecortar && (
        <RecorteDeFoto
          arquivo={aRecortar}
          salvando={mexendoNaFoto}
          aoCancelar={() => {
            setARecortar(null);
            if (campoDeArquivo.current) campoDeArquivo.current.value = "";
          }}
          aoConfirmar={trocarFoto}
        />
      )}
    </section>
  );
}
