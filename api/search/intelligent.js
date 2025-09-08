// api/search/intelligent.js
import { withCors, checkApiKey, getDrive } from "../_util";

/** Utilidades */
const uniqById = arr => Object.values(
  arr.reduce((acc, f) => (acc[f.id] = acc[f.id] || f, acc), {})
);

function buildParentsClause(folderWhitelist = []) {
  const ids = (folderWhitelist || []).filter(Boolean);
  if (!ids.length) return "";
  const clauses = ids.map(id => `'${id}' in parents`);
  return `(${clauses.join(" or ")})`;
}

function buildTypesClause(types = []) {
  const t = (types || []).map(s => s.toLowerCase());
  const pieces = [];
  if (t.includes("weekly")) pieces.push(`name contains 'Weekly de Alta Performance'`);
  if (t.includes("daily")) pieces.push(`name contains 'Daily Operacional'`);
  if (t.includes("check-in") || t.includes("checkin")) pieces.push(`(name contains 'check-in' or name contains 'checkin')`);
  if (t.includes("planejamento")) pieces.push(`name contains 'planejamento'`);
  if (t.includes("estratégia") || t.includes("estrategia")) pieces.push(`(name contains 'estratégia' or name contains 'estrategia')`);
  if (t.includes("tráfego") || t.includes("trafego")) pieces.push(`(name contains 'tráfego' or name contains 'trafego')`);
  return pieces.length ? `(${pieces.join(" or ")})` : "";
}

function dateWindowClause(windowDays) {
  if (!windowDays || windowDays <= 0) return "";
  const dt = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  return `modifiedTime > '${dt}'`;
}

function andJoin(parts) {
  return parts.filter(Boolean).join(" and ");
}

/** Score heurístico */
function scoreFile(file, opts) {
  const { folderWhitelist = [], client, types = [] } = opts || {};
  let s = 0;
  const name = (file.name || "").toLowerCase();

  // pasta whitelist
  if (file.parents && file.parents.some(p => folderWhitelist.includes(p))) s += 4;

  // padrão por tipo
  if (name.includes("weekly de alta performance")) s += 3;
  if (name.includes("daily operacional")) s += 3;
  if (name.includes("check-in") || name.includes("checkin")) s += 3;

  // cliente
  if (client) {
    const c = client.toLowerCase();
    if (name.includes(c)) s += 2;
  }

  // termos de intenção
  if (/(planejamento|estratégia|estrategia|tráfego|trafego)/i.test(name)) s += 1;

  // mime Google
  if (/^application\/vnd\.google-apps\./.test(file.mimeType)) s += 1;

  return s;
}

/** Busca no Drive */
async function driveSearch(drive, q, pageSize = 25, orderBy = "modifiedTime desc") {
  const fields = "files(id,name,mimeType,modifiedTime,createdTime,parents,owners,webViewLink),nextPageToken";
  let all = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q,
      fields,
      orderBy,
      pageSize,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
      spaces: "drive"
    });
    all = all.concat(data.files || []);
    pageToken = data.nextPageToken;
  } while (pageToken && all.length < pageSize);
  return all.slice(0, pageSize);
}

/** Handler */
export default async function handler(req, res) {
  try {
    withCors(res);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    if (!checkApiKey(req, res)) return;

    const {
      goal = "",
      client = "",
      types = [],
      folderWhitelist = [],
      dateHint = "",
      windowDays = 120,
      pageSize = 25,
      maxPasses = 4
    } = req.body || {};

    const drive = await getDrive();

    const passes = [];
    let candidates = [];

    // Normalizações
    const parentsClause = buildParentsClause(folderWhitelist);
    const typesClause = buildTypesClause(types);
    const windowClause = dateWindowClause(windowDays);
    const clientName = client?.trim();
    const clientNameClause = clientName
      ? `(name contains '${clientName}' or fullText contains '${clientName}')`
      : "";

    // PASSO 1: pasta oficial + padrões de tipo
    if (maxPasses >= 1) {
      const q = andJoin([
        "trashed = false",
        parentsClause,
        typesClause || "(name contains 'Weekly de Alta Performance' or name contains 'Daily Operacional' or name contains 'check-in' or name contains 'checkin')",
        windowClause
      ]);
      const files = await driveSearch(drive, q, pageSize);
      passes.push({ pass: 1, q, hits: files.length });
      candidates = candidates.concat(files);
    }

    // PASSO 2: cliente + intenção no nome
    if (maxPasses >= 2) {
      const intentClause = buildTypesClause(types) ||
        "(name contains 'planejamento' or name contains 'estratégia' or name contains 'estrategia' or name contains 'tráfego' or name contains 'trafego')";
      const q = andJoin([
        "trashed = false",
        clientNameClause,
        intentClause,
        windowClause
      ]);
      const files = await driveSearch(drive, q, pageSize);
      passes.push({ pass: 2, q, hits: files.length });
      candidates = candidates.concat(files);
    }

    // PASSO 3: fallback por conteúdo de transcrição
    if (maxPasses >= 3) {
      const q = andJoin([
        "trashed = false",
        parentsClause || clientNameClause,
        "(name contains 'Anotações do Gemini' or fullText contains 'Transcrição')",
        windowClause
      ]);
      const files = await driveSearch(drive, q, pageSize);
      passes.push({ pass: 3, q, hits: files.length });
      candidates = candidates.concat(files);
    }

    // PASSO 4: ampliação controlada só por cliente na janela
    if (maxPasses >= 4 && clientName) {
      const q = andJoin([
        "trashed = false",
        clientNameClause,
        windowClause
      ]);
      const files = await driveSearch(drive, q, pageSize);
      passes.push({ pass: 4, q, hits: files.length });
      candidates = candidates.concat(files);
    }

    // Dedup e score
    const unique = uniqById(candidates);
    const scored = unique
      .map(f => ({
        ...f,
        score: scoreFile(f, { folderWhitelist, client, types }),
        why: [
          ...(folderWhitelist?.length && f.parents?.some(p => folderWhitelist.includes(p)) ? ["Está em pasta whitelisted"] : []),
          (f.name || "").includes("Weekly de Alta Performance") ? "Bate padrão de Weekly" : null,
          (f.name || "").includes("Daily Operacional") ? "Bate padrão de Daily" : null,
          (/check-?in/i.test(f.name || "")) ? "Bate padrão de Check-in" : null,
          client && (f.name || "").toLowerCase().includes(client.toLowerCase()) ? "Contém cliente no nome" : null,
          /^application\/vnd\.google-apps\./.test(f.mimeType) ? "Arquivo Google (Docs/Slides/Sheets)" : null
        ].filter(Boolean)
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.modifiedTime) - new Date(a.modifiedTime);
      })
      .slice(0, pageSize);

    return res.status(200).json({ passes, files: scored });
  } catch (err) {
    console.error("search/intelligent error:", err?.message, err?.stack);
    return res.status(500).json({ error: "Internal Error", detail: err?.message });
  }
}
