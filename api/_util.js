import { google } from "googleapis";

export const config = {
  api: {
    bodyParser: false,
  },
};

export function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
}

export function checkApiKey(req, res) {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export async function getDrive() {
  const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}
