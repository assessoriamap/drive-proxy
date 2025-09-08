import { getDrive, checkApiKey, withCors, config } from "./_util.js";
export { config };

export default async function handler(req, res) {
  withCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!checkApiKey(req, res)) return;

  try {
    const {
      query = "",
      folderId = "",
      pageSize = 10,
      includeFullText = "false",
      mimeTypes = "",
      modifiedAfter = "",
      orderBy = "modifiedTime desc"
    } = req.query;

    const drive = await getDrive();

    // base
    let q = "trashed=false";

    // nome vs fullText
    if (query) {
      const safe = String(query).replace(/'/g, "\\'");
      q += includeFullText === "true"
        ? ` and (name contains '${safe}' or fullText contains '${safe}')`
        : ` and name contains '${safe}'`;
    }

    // múltiplas pastas
    if (folderId) {
      const ids = folderId.split(",").map(s => s.trim()).filter(Boolean);
      if (ids.length === 1) q += ` and '${ids[0]}' in parents`;
      if (ids.length > 1) q += ` and (${ids.map(id => `'${id}' in parents`).join(" or ")})`;
    }

    // filtros MIME
    if (mimeTypes) {
      const list = mimeTypes.split(",").map(s => s.trim()).filter(Boolean);
      if (list.length === 1) q += ` and mimeType='${list[0]}'`;
      if (list.length > 1) q += ` and (${list.map(mt => `mimeType='${mt}'`).join(" or ")})`;
    }

    // janela temporal
    if (modifiedAfter) q += ` and modifiedTime > '${modifiedAfter}'`;

    const resp = await drive.files.list({
      q,
      pageSize: Number(pageSize),
      orderBy,
      fields: "files(id,name,mimeType,modifiedTime,createdTime,webViewLink,parents)"
    });

    res.status(200).json({ files: resp.data.files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
