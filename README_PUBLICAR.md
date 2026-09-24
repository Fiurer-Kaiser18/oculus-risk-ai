# OCULUS RISK AI — publicación

## Qué incluye
- PWA móvil con identidad OCULUS.
- Cámara y captura de evidencia.
- Análisis multimodal de imágenes mediante Gemini.
- Voz conversacional Gemini Live mediante token efímero.
- Historial de inspecciones.
- Componentes ambientales configurables.
- Módulo de laboratorio.
- Mente Construida como base para RAG/documentos.
- Matriz de impactos editable.
- Vista de informe imprimible a PDF desde el navegador.
- Secretos del servidor: la clave no se expone al frontend.

## Requisito
Node.js 20+.

## Ejecutar
1. Copia `.env.example` como `.env` si trabajas localmente.
2. Coloca tu clave en `GEMINI_API_KEY`.
3. Ejecuta:
   npm install
   npm start
4. Abre el puerto indicado.

## Publicar
Puedes usar cualquier hosting Node que permita variables de entorno, por ejemplo un servicio web de Render, Railway, Replit u otro equivalente.

Variables:
GEMINI_API_KEY = TU_CLAVE_REAL

No pongas la clave en `public/app.js`, `public/index.html` ni en el repositorio público.

## Seguridad
El endpoint `/api/live-token` genera un token efímero para que el navegador no reciba la clave permanente. La documentación oficial de Gemini recomienda este patrón para clientes web/móviles en producción.

## Importante
Esta versión es una base funcional y extensible. Las funciones de normativa dinámica, búsqueda web, geolocalización avanzada, mapas históricos, carga RAG de documentos, matrices basadas en metodologías suministradas por el usuario y exportación DOCX/Excel requieren sus módulos de integración correspondientes; la interfaz y arquitectura están preparadas para añadirlos sin presentar datos inventados.

La IA es preliminar y no sustituye inspección profesional, medición instrumental, laboratorio, certificación o verificación normativa.
<!-- Actualización de configuración -->
