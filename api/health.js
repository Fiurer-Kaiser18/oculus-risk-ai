export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: "OCULUS RISK AI",
    message: "Servidor Vercel funcionando correctamente"
  });
}
