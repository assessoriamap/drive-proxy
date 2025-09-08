import { getDrive, checkApiKey, withCors, config } from "./_util";

export { config };

export default async function handler(req, res) {
  withCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!checkApiKey(req, res)) return;

  try {
    const { query = "", folderId, pageSize = 10 } = req.query;
    const drive = await getDrive();

    let q = "trashed=false";
    if (query) q += ` and name contains '${String(query).replace(/'/g, "\\'")}'`;
    if (folderId) q += ` and '${folderId}' in parents`;

    const resp = await drive.files.list({
      q,
      pageSize: Number(pageSize),
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,parents)"
    });

    res.status(200).json({ files: resp.data.files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
