import OpenAI from "openai";

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

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método no permitido. Usa POST."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "OPENAI_API_KEY no está configurada en Vercel."
    });
  }

  try {

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

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const base64 = imageData.replace(/^data:[^,]+,/, "");

    const imageUrl =
      `data:${mimeType};base64,${base64}`;

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

${String(
  prompt ||
  "Analiza esta evidencia como una inspección técnica preliminar."
).slice(0, 12000)}
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

    return res.status(200).json({

      ok: true,

      text:
        response.output_text ||
        "No se obtuvo una respuesta textual."

    });

  } catch (error) {

    console.error("OCULUS OPENAI ERROR:", error);

    return res.status(500).json({

      error:
        error?.message ||
        "Error al consultar OpenAI."

    });
  }
}
