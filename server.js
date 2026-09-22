import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "inspections.json");

await fs.mkdir(DATA_DIR, { recursive: true });
try { await fs.access(DB_FILE); } catch { await fs.writeFile(DB_FILE, "[]", "utf8"); }

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

function hasKey() { return Boolean(process.env.GEMINI_API_KEY); }
function readDB() { return fs.readFile(DB_FILE, "utf8").then(JSON.parse); }
async function writeDB(items) { await fs.writeFile(DB_FILE, JSON.stringify(items, null, 2)); }

const SYSTEM = `
Eres OCULUS RISK AI, asistente técnico multimodal para inspecciones de seguridad, ambiente,
mantenimiento y procesos productivos. Tu creador es Moisés Mier.
Responde principalmente en español.

Reglas obligatorias:
1) Separa siempre OBSERVADO, MEDIDO, PROPORCIONADO POR EL USUARIO, INFORMACIÓN EXTERNA,
INFERENCIA y RECOMENDACIÓN.
2) No inventes normas, fuentes, resultados de laboratorio, especificaciones, fallas internas
ni datos que no sean visibles o proporcionados.
3) Una imagen permite describir indicios visibles, no certificar el estado interno de un equipo.
4) Los riesgos y diagnósticos son PRELIMINARES y requieren verificación profesional.
5) Si una norma colombiana depende del componente, actividad o fecha, dilo y solicita contexto
o indica que debe verificarse en fuente oficial antes de declarar cumplimiento.
6) Para una imagen, describe primero lo que realmente se observa y luego las hipótesis.
7) Da acciones prácticas, seguras y proporcionales. No recomiendes intervenir equipos energizados
ni realizar maniobras peligrosas.
8) Cuando no tengas evidencia suficiente, escribe "No determinable con la evidencia disponible".
`;

function cleanText(s) {
  return String(s ?? "").slice(0, 12000);
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "OCULUS RISK AI",
    creator: "Moisés Mier",
    slogan: "Observa. Escucha. Analiza. Diagnostica.",
    geminiConfigured: hasKey()
  });
});

app.get("/api/inspections", async (_req, res) => {
  res.json(await readDB());
});

app.post("/api/inspections", async (req, res) => {
  const items = await readDB();
  const inspection = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...req.body
  };
  items.unshift(inspection);
  await writeDB(items);
  res.json(inspection);
});

app.put("/api/inspections/:id", async (req, res) => {
  const items = await readDB();
  const i = items.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Inspección no encontrada" });
  items[i] = { ...items[i], ...req.body, updatedAt: new Date().toISOString() };
  await writeDB(items);
  res.json(items[i]);
});

app.delete("/api/inspections/:id", async (req, res) => {
  const items = await readDB();
  const next = items.filter(x => x.id !== req.params.id);
  await writeDB(next);
  res.json({ ok: true });
});

app.post("/api/analyze", async (req, res) => {
  if (!hasKey()) return res.status(503).json({
    error: "GEMINI_API_KEY no está configurada en el servidor."
  });

  const { imageData, mimeType = "image/jpeg", prompt = "", context = {} } = req.body || {};
  if (!imageData) return res.status(400).json({ error: "Falta la evidencia de imagen." });

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [{
        role: "user",
        parts: [
          { text: `${SYSTEM}\n\nCONTEXTO DE INSPECCIÓN:\n${JSON.stringify(context)}\n\nSOLICITUD:\n${cleanText(prompt || "Analiza esta evidencia como inspección técnica preliminar.")}` },
          { inlineData: { mimeType, data: imageData.replace(/^data:[^,]+,/, "") } }
        ]
      }]
    });
    res.json({ ok: true, text: response.text || "Sin respuesta textual." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "Error al consultar Gemini." });
  }
});

/* Secure Live API token. The browser receives only a short-lived token. */
app.post("/api/live-token", async (_req, res) => {
  if (!hasKey()) return res.status(503).json({
    error: "GEMINI_API_KEY no está configurada en el servidor."
  });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        liveConnectConstraints: {
          model: "gemini-3.8-live",
          config: {
            responseModalities: ["AUDIO"],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {}
          }
        }
      }
    });
    res.json({ token: token.name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e?.message || "No se pudo crear el token efímero." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`OCULUS RISK AI listening on ${PORT}`));
