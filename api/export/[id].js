import { getDrive, checkApiKey, withCors, config } from "../_util";

export { config };

export default async function handler(req, res) {
  withCors(res);
  if (!checkApiKey(req, res)) return;

  try {
    const { id } = req.query;
    const mime = req.query.mime || "application/pdf";
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
