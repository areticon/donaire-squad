// Junta as provas de uma pasta numa folha (para conferir de uma vez). Uso: node folha-de-provas.mjs <pasta> <saida.jpg>
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const [pasta, saida] = process.argv.slice(2);
const fs = readdirSync(pasta).filter((f) => f.endsWith(".jpg")).sort().map((f) => join(pasta, f));
const cols = 6;
const fc = fs.map((_, i) => `[${i}:v]scale=360:640[s${i}]`).join(";") + ";" + fs.map((_, i) => `[s${i}]`).join("") + `xstack=inputs=${fs.length}:layout=${fs.map((_, i) => `${(i % cols) * 360}_${Math.floor(i / cols) * 640}`).join("|")}:fill=black`;
const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...fs.flatMap((f) => ["-i", f]), "-filter_complex", fc, "-frames:v", "1", "-q:v", "3", saida]);
console.log(r.status === 0 ? `ok ${fs.length}` : String(r.stderr));
