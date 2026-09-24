  import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = "/tmp/oculus-risk-ai";
const DB_FILE = path.join(DATA_DIR, "inspections.json");

await fs.mkdir(DATA_DIR, { recursive: true });

try {
  await fs.access(DB_FILE);
} catch {
  await fs.writeFile(DB_FILE, "[]", "utf8");
}

app.use(express.json({ limit: "15mb" }));

function hasKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getOpenAI() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

async function readDB() {
  return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
}

async function writeDB(items) {
  await fs.writeFile(
    DB_FILE,
    JSON.stringify(items, null, 2),
    "utf8"
  );
}

function cleanText(text) {
  return String(text ?? "").slice(0, 12000);
}

const SYSTEM = `
Eres OCULUS RISK AI, asistente técnico multimodal para inspecciones
de seguridad, ambiente, mantenimiento y procesos productivos.

Tu creador es Moisés Mier.

Responde principalmente en español.

REGLAS:

1. Separa claramente:
OBSERVADO
MEDIDO
PROPORCIONADO POR EL USUARIO
INFORMACIÓN EXTERNA
INFERENCIA
RECOMENDACIÓN

2. No inventes normas, fuentes, resultados de laboratorio,
especificaciones, fallas internas ni datos que no sean visibles
o proporcionados.

3. Una imagen permite describir indicios visibles, pero NO permite
certificar por sí sola el estado interno de un equipo.

4. Los riesgos y diagnósticos son PRELIMINARES y requieren
verificación profesional.

5. Si una norma colombiana depende del componente, actividad
o fecha, indícalo y señala que debe verificarse en una fuente
oficial antes de declarar cumplimiento.

6. Describe primero lo que realmente se observa y después
las posibles interpretaciones.

7. Da acciones prácticas, seguras y proporcionales.

8. No recomiendes intervenir equipos energizados ni realizar
maniobras peligrosas.

9. Cuando no exista evidencia suficiente, escribe:

"No determinable con la evidencia disponible."

10. Nunca presentes una inferencia como si fuera un hecho.
`;


// ============================================
// SALUD DEL SERVIDOR
// ============================================

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "OCULUS RISK AI",
    creator: "Moisés Mier",
    slogan: "Observa. Escucha. Analiza. Diagnostica.",
    openaiConfigured: hasKey()
  });
});


// ============================================
// INSPECCIONES
// ============================================

app.get("/api/inspections", async (_req, res) => {
  try {
    const items = await readDB();
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "No se pudo leer el historial."
    });
  }
});

app.post("/api/inspections", async (req, res) => {
  try {
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
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "No se pudo guardar la inspección."
    });
  }
});

app.put("/api/inspections/:id", async (req, res) => {
  try {
    const items = await readDB();

    const index = items.findIndex(
      item => item.id === req.params.id
    );

    if (index < 0) {
      return res.status(404).json({
        error: "Inspección no encontrada."
      });
    }

    items[index] = {
      ...items[index],
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    await writeDB(items);

    res.json(items[index]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "No se pudo actualizar la inspección."
    });
  }
});

app.delete("/api/inspections/:id", async (req, res) => {
  try {
    const items = await readDB();

    const next = items.filter(
      item => item.id !== req.params.id
    );

    await writeDB(next);

    res.json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "No se pudo eliminar la inspección."
    });
  }
});


// ============================================
// ANÁLISIS MULTIMODAL CON OPENAI
// ============================================

app.post("/api/analyze", async (req, res) => {

  if (!hasKey()) {
    return res.status(503).json({
      error: "OPENAI_API_KEY no está configurada en el servidor."
    });
  }

  const {
    imageData,
    mimeType = "image/jpeg",
    prompt = "",
    context = {}
  } = req.body || {};

  if (!imageData) {
    return res.status(400).json({
      error: "Falta la evidencia de imagen."
    });
  }

  try {

    const client = getOpenAI();

    const base64Image =
      imageData.replace(/^data:[^,]+,/, "");

    const imageUrl =
      `data:${mimeType};base64,${base64Image}`;

    const response = await client.responses.create({
      model: "gpt-5.6-luna",

      instructions: SYSTEM,

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
CONTEXTO DE LA INSPECCIÓN:

${JSON.stringify(context, null, 2)}

SOLICITUD DEL INSPECTOR:

${cleanText(
  prompt ||
  "Analiza esta evidencia como una inspección técnica preliminar."
)}
`
            },
            {
              type: "input_image",
              image_url: imageUrl
            }
          ]
        }
      ]
    });

    res.json({
      ok: true,
      text: response.output_text || "Sin respuesta textual."
    });

  } catch (error) {

    console.error("ERROR OPENAI:", error);

    res.status(500).json({
      error:
        error?.message ||
        "Error al consultar OpenAI."
    });
  }
});


// ============================================
// MANEJO DE ERRORES
// ============================================

app.use((error, _req, res, _next) => {

  console.error(error);

  res.status(500).json({
    error: "Error interno del servidor."
  });
});


// ============================================
// EXPORTACIÓN PARA VERCEL
// ============================================

export default app;


// ============================================
// SERVIDOR LOCAL
// ============================================

if (process.env.VERCEL !== "1") {

  app.listen(PORT, () => {
    console.log(
      `OCULUS RISK AI funcionando en puerto ${PORT}`
    );
  });

}
