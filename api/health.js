export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: "OCULUS RISK AI",
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
}
