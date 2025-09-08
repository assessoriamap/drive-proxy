import { getDrive, checkApiKey, withCors } from "../_util.js";

// Se quiser, pode até remover isso e deixar sem config
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  withCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!checkApiKey(req, res)) return;

  try {
    const { id, mime = "application/pdf" } = req.query;
    if (!id) return res.status(400).json({ error: "missing id" });

    const drive = await getDrive();
    const r = await drive.files.export(
      { fileId: id, mimeType: mime },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", mime);
    r.data.on("error", err => res.status(500).end(err.message));
    r.data.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
