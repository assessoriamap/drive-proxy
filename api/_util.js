import { google } from "googleapis";

// Autorização por API Key simples
export function checkApiKey(req, res) {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// CORS básico
export function withCors(res) {
  const allowed = process.env.ALLOWED_ORIGINS || "*";
  res.setHeader("Access-Control-Allow-Origin", allowed);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
}

export async function getDrive() {
  const creds = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"]
  });
  const client = await auth.getClient();
  return google.drive({ version: "v3", auth: client });
}

// Para garantir runtime Node e não Edge
export const config = { runtime: "nodejs20.x" };
