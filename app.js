let inspections = [];
let current = null;
let stream = null;
let liveSocket = null;
let liveAudioCtx = null;
let micProcessor = null;
let micSource = null;
let liveRunning = false;

const $ = id => document.getElementById(id);
const screen = () => $("screen");

async function api(url, opts={}) {
  const r = await fetch(url, {headers: {"Content-Type":"application/json", ...(opts.headers||{})}, ...opts});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Error de servidor");
  return data;
}
async function load() {
  try {
    inspections = await api("/api/inspections");
    $("countCard").textContent = `${inspections.length} inspección${inspections.length===1?"":"es"}`;
    const h = await api("/api/health");
$("aiState").textContent = h.openaiConfigured
  ? "● OpenAI conectado en servidor"
  : "○ Falta configurar OPENAI_API_KEY";

$("statusText").textContent = h.openaiConfigured
  ? "IA lista"
  : "Modo evidencia";

$("statusDot").style.background =
  h.openaiConfigured
    ? "var(--ok)"
    : "var(--danger)";
  } catch(e) { $("aiState").textContent = "Servidor no disponible"; }
}
function goHome(){ location.reload(); }
function newInspection(){ 
  current={title:"",location:"",asset:"",inspector:"Moisés Mier",notes:"",component:"Infraestructura",evidence:null,analysis:""};
  renderInspection();
}
$("newBtn").onclick = newInspection;

function renderInspection(){
  screen().innerHTML=`
  <button class="back" onclick="goHome()">← Centro de mando</button>
  <h2>Nueva inspección</h2>
  <p class="muted">Documenta primero. Analiza después. La IA no reemplaza la verificación profesional.</p>
  <div class="panel form">
    <div class="field"><label>TÍTULO</label><input id="fTitle" placeholder="Ej. Inspección área porcina" value="${esc(current.title)}"></div>
    <div class="row">
      <div class="field"><label>ÁREA / UBICACIÓN</label><input id="fLoc" placeholder="Área, municipio o sitio" value="${esc(current.location)}"></div>
      <div class="field"><label>EQUIPO / ACTIVO</label><input id="fAsset" placeholder="Equipo, proceso o instalación" value="${esc(current.asset)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>INSPECTOR</label><input id="fInspector" value="${esc(current.inspector)}"></div>
      <div class="field"><label>COMPONENTE</label>
        <select id="fComp">${["Agua","Suelo","Aire","Residuos","Ruido","Olores","Emisiones","Vertimientos","Biodiversidad","Energía","Clima","Sustancias químicas","Proceso productivo","Riesgo","Infraestructura","Otro"].map(x=>`<option ${x===current.component?"selected":""}>${x}</option>`).join("")}</select>
      </div>
    </div>
    <div class="field"><label>NOTAS DE CONTEXTO</label><textarea id="fNotes" placeholder="Qué estás inspeccionando, antecedentes, datos aportados por el usuario…">${esc(current.notes)}</textarea></div>
    <div class="toolbar">
      <button class="secondary" onclick="startCamera()">◎ Activar cámara</button>
      <button class="secondary" onclick="toggleLive()">◉ Activar voz / Live</button>
      <button class="secondary" onclick="pickImage()">＋ Adjuntar evidencia</button>
    </div>
    <div id="captureArea"></div>
    <div id="liveArea"></div>
    <div class="toolbar">
      <button class="primary" onclick="saveInspection()">Guardar inspección</button>
      <button class="secondary" onclick="showReportPreview()">Informe</button>
    </div>
  </div>`;
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function values(){
  current.title=$("fTitle").value; current.location=$("fLoc").value; current.asset=$("fAsset").value;
  current.inspector=$("fInspector").value; current.component=$("fComp").value; current.notes=$("fNotes").value;
}
async function startCamera(){
  try{
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    $("captureArea").innerHTML=`<video id="cam" class="video" autoplay playsinline></video><div class="toolbar"><button class="primary" onclick="capture()">◉ Capturar evidencia</button><button class="secondary" onclick="stopCamera()">Cerrar cámara</button></div><canvas id="canvas" hidden></canvas>`;
    $("cam").srcObject=stream;
  }catch(e){alert("No se pudo abrir la cámara: "+e.message);}
}
function stopCamera(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;$("captureArea").innerHTML="";}
function capture(){
  values(); const v=$("cam"), c=$("canvas"); c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);
  current.evidence=c.toDataURL("image/jpeg",.78); current.evidenceAt=new Date().toISOString();
  $("captureArea").innerHTML=`<img class="evidence" src="${current.evidence}"><div class="toolbar"><button class="primary" onclick="analyzeEvidence()">◈ Solicitar análisis</button><button class="secondary" onclick="startCamera()">Otra captura</button></div><div id="analysisBox"></div>`;
  stopCamera();
}
function pickImage(){
  const i=document.createElement("input");i.type="file";i.accept="image/*";i.capture="environment";
  i.onchange=()=>{const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{current.evidence=r.result;current.evidenceAt=new Date().toISOString();$("captureArea").innerHTML=`<img class="evidence" src="${r.result}"><div class="toolbar"><button class="primary" onclick="analyzeEvidence()">◈ Solicitar análisis</button></div><div id="analysisBox"></div>`};r.readAsDataURL(f)};i.click();
}
async function analyzeEvidence(){
  values(); const box=$("analysisBox");box.innerHTML=`<div class="panel"><div class="scan"></div><b>OCULUS está analizando…</b><p class="muted">Se enviará la evidencia al proveedor solo al solicitar el análisis.</p></div>`;
  try{
    const r=await api("/api/analyze",{method:"POST",body:JSON.stringify({
      imageData:current.evidence,
      prompt:"Realiza una lectura técnica preliminar. Identifica elementos visibles, condiciones observables, posibles riesgos y recomendaciones. Separa observado, inferido y recomendado. No inventes fallas.",
      context:{title:current.title,location:current.location,asset:current.asset,component:current.component,notes:current.notes}
    })});
    current.analysis=r.text;box.innerHTML=`<div class="panel result"><b>LECTURA PRELIMINAR</b><hr>${esc(r.text)}</div>`;
  }catch(e){box.innerHTML=`<div class="panel"><b style="color:var(--danger)">No fue posible analizar</b><p>${esc(e.message)}</p><p class="muted">Puedes seguir guardando la evidencia.</p></div>`;}
}
async function saveInspection(){
  values();
  if(!current.title) current.title="Inspección sin título";
  try{
    if(current.id) current=await api("/api/inspections/"+current.id,{method:"PUT",body:JSON.stringify(current)});
    else current=await api("/api/inspections",{method:"POST",body:JSON.stringify(current)});
    inspections=await api("/api/inspections");$("countCard").textContent=`${inspections.length} inspección${inspections.length===1?"":"es"}`;
    alert("Inspección guardada.");
  }catch(e){alert(e.message)}
}
function showHistory(){
  screen().innerHTML=`<button class="back" onclick="goHome()">← Centro de mando</button><h2>Historial</h2><p class="muted">Las inspecciones se almacenan en el servidor de la aplicación.</p><div class="form">${inspections.length?inspections.map(x=>`<article class="card" onclick="openInspection('${x.id}')"><span>◫</span><b>${esc(x.title)}</b><small>${esc(x.location||"Sin ubicación")} · ${new Date(x.createdAt).toLocaleString()}</small><small>${esc(x.component||"Sin componente")}</small></article>`).join(""):`<div class="empty">No hay inspecciones registradas.</div>`}</div>`;
}
function openInspection(id){current=inspections.find(x=>x.id===id);renderInspection();}
function showModule(type){
 const names={environment:"Análisis ambiental",lab:"Laboratorio",knowledge:"Mente Construida",matrix:"Matriz de evaluación de impactos",reports:"Informes",settings:"Configuración"};
 if(type==="reports"){showReports();return;}
 screen().innerHTML=`<button class="back" onclick="goHome()">← Centro de mando</button><h2>${names[type]}</h2>${moduleContent(type)}`;
}
function moduleContent(type){
 if(type==="environment") return `<div class="panel form"><p>Selecciona el componente que quieras documentar en una inspección.</p><div class="chips">${["Agua","Suelo","Aire","Residuos","Ruido","Olores","Emisiones","Vertimientos","Biodiversidad","Energía","Clima","Sustancias químicas","Proceso productivo","Riesgo","Infraestructura","Otro"].map(x=>`<span class="chip">${x}</span>`).join("")}</div><button class="primary" onclick="newInspection()">Iniciar análisis</button></div>`;
 if(type==="lab") return `<div class="panel form"><div class="field"><label>COMPONENTE</label><select><option>Agua</option><option>Suelo</option><option>Aire</option><option>Residuos</option><option>Ruido</option><option>Otro</option></select></div><div class="row"><div class="field"><label>PARÁMETRO</label><input placeholder="pH, turbidez, TDS…"></div><div class="field"><label>RESULTADO / UNIDAD</label><input placeholder="Ej. 7.2 / unidad"></div></div><div class="row"><div class="field"><label>MÉTODO / TÉCNICA</label><input placeholder="Método analítico"></div><div class="field"><label>LABORATORIO</label><input placeholder="Nombre"></div></div><p class="muted">Los resultados deben provenir de medición o certificado; OCULUS no inventa resultados.</p></div>`;
 if(type==="knowledge") return `<div class="panel form"><p><b>Mente Construida</b> organiza conocimiento aportado por ti.</p><div class="field"><label>FUENTE TÉCNICA</label><input placeholder="Título del manual, procedimiento, norma o artículo"></div><div class="field"><label>CLASIFICACIÓN</label><select><option>Manual</option><option>Procedimiento</option><option>Normativa</option><option>Artículo científico</option><option>Método analítico</option><option>Matriz</option><option>Otro</option></select></div><p class="muted">En esta versión la arquitectura queda preparada para incorporar RAG/documentos sin fingir entrenamiento permanente del modelo.</p></div>`;
 if(type==="matrix") return `<div class="panel form"><p><b>Matriz editable:</b> actividad → aspecto → impacto → criterio → valoración → significancia → medidas.</p><div class="row"><div class="field"><label>ACTIVIDAD</label><input></div><div class="field"><label>ASPECTO</label><input></div></div><div class="row"><div class="field"><label>IMPACTO</label><input></div><div class="field"><label>SIGNIFICANCIA</label><input placeholder="Definida por tu metodología"></div></div><p class="muted">La metodología del usuario debe prevalecer sobre cualquier escala genérica.</p></div>`;
 return `<div class="panel form"><p>Configura el servidor con <b>GEMINI_API_KEY</b> como secreto. La clave nunca se guarda en el navegador.</p><div class="notice"><span>Proveedor</span><b>Gemini</b></div><div class="notice"><span>Live multimodal</span><b>Token efímero</b></div><p class="muted">No compartas tu clave en el chat ni dentro del HTML.</p></div>`;
}
function showReports(){screen().innerHTML=`<button class="back" onclick="goHome()">← Centro de mando</button><h2>Informes</h2><div class="form">${inspections.length?inspections.map(x=>`<article class="card"><b>${esc(x.title)}</b><small>${esc(x.location||"")}</small><button class="secondary" onclick="reportById('${x.id}')">Abrir informe</button></article>`).join(""):`<div class="empty">Guarda una inspección para generar su informe.</div>`}</div>`;}
function reportById(id){current=inspections.find(x=>x.id===id);showReportPreview();}
function showReportPreview(){
 values();
 const x=current||{};
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe OCULUS</title><style>body{font-family:Arial;max-width:850px;margin:40px auto;line-height:1.55;color:#172033}h1{color:#13243c}h2{border-bottom:1px solid #ccd5e1;padding-bottom:6px}.meta{background:#f1f5f9;padding:15px;border-radius:8px}.e{max-width:100%;border-radius:8px}.pre{white-space:pre-wrap}</style></head><body><h1>OCULUS RISK AI</h1><p>Observa. Escucha. Analiza. Diagnostica.</p><h2>Informe preliminar de inspección</h2><div class="meta"><b>Título:</b> ${esc(x.title)}<br><b>Área:</b> ${esc(x.location)}<br><b>Activo:</b> ${esc(x.asset)}<br><b>Inspector:</b> ${esc(x.inspector)}<br><b>Componente:</b> ${esc(x.component)}<br><b>Fecha:</b> ${new Date().toLocaleString()}</div><h2>1. Contexto</h2><p>${esc(x.notes)}</p>${x.evidence?`<h2>2. Evidencia</h2><img class="e" src="${x.evidence}">`:""}<h2>3. Lectura preliminar</h2><div class="pre">${esc(x.analysis||"No se ha solicitado análisis.")}</div><h2>4. Limitaciones</h2><p>La lectura automática es preliminar y no sustituye inspección profesional, mediciones instrumentales, ensayos de laboratorio, certificaciones ni la aplicación verificada de la normativa vigente.</p><h2>5. Referencias</h2><p>No se agregan referencias que no hayan sido verificadas.</p><script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`;
 const w=window.open();w.document.write(html);w.document.close();
}
async function toggleLive(){
 if(liveRunning){stopLive();return;}
 const area=$("liveArea"); area.innerHTML=`<div class="eye-live"><b>LIVE</b><div class="wave"></div><button class="secondary" onclick="stopLive()">Detener</button></div><p class="muted" id="liveText">Conectando voz…</p>`;
 try{
   const r=await api("/api/live-token",{method:"POST",body:"{}"});
   const token=encodeURIComponent(r.token);
   liveSocket=new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?access_token=${token}`);
   liveSocket.onopen=async()=>{
     liveRunning=true;$("liveText").textContent="Conectado. Habla con OCULUS.";
     liveSocket.send(JSON.stringify({setup:{model:"models/gemini-3.8-live",responseModalities:["AUDIO"],inputAudioTranscription:{},outputAudioTranscription:{},systemInstruction:{parts:[{text:SYSTEM}]}}}));
     await startMic();
   };
   liveSocket.onmessage=e=>handleLiveMessage(JSON.parse(e.data));
   liveSocket.onerror=()=>{$("liveText").textContent="Error en conexión Live."};
   liveSocket.onclose=()=>{liveRunning=false};
 }catch(e){area.innerHTML=`<div class="panel"><b style="color:var(--danger)">Live no disponible</b><p>${esc(e.message)}</p></div>`;}
}
const SYSTEM=`Eres OCULUS RISK AI. Responde en español, de forma técnica y clara. Distingue observado, medido, proporcionado, inferido y recomendado. No inventes datos ni fallas internas. Tus diagnósticos son preliminares.`;
async function startMic(){
 const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
 liveAudioCtx=new AudioContext({sampleRate:16000});micSource=liveAudioCtx.createMediaStreamSource(s);
 micProcessor=liveAudioCtx.createScriptProcessor(4096,1,1);
 micProcessor.onaudioprocess=e=>{
   if(!liveSocket||liveSocket.readyState!==1)return;
   const input=e.inputBuffer.getChannelData(0), pcm=new Int16Array(input.length);
   for(let i=0;i<input.length;i++)pcm[i]=Math.max(-1,Math.min(1,input[i]))*32767;
   const bytes=new Uint8Array(pcm.buffer);let bin="";for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
   liveSocket.send(JSON.stringify({realtimeInput:{mediaChunks:[{mimeType:"audio/pcm;rate=16000",data:btoa(bin)}]}}));
 };
 micSource.connect(micProcessor);micProcessor.connect(liveAudioCtx.destination);
}
function handleLiveMessage(m){
 const sc=m.serverContent;
 const t=sc?.inputTranscription?.text||sc?.outputTranscription?.text;
 if(t&&$("liveText"))$("liveText").textContent=t;
 const data=sc?.modelTurn?.parts?.find(p=>p.inlineData)?.inlineData?.data;
 if(data)playPCM(data,24000);
}
async function playPCM(b64,rate){
 const bin=atob(b64),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 const pcm=new Int16Array(bytes.buffer);const ctx=liveAudioCtx||new AudioContext();
 const buf=ctx.createBuffer(1,pcm.length,rate),ch=buf.getChannelData(0);for(let i=0;i<pcm.length;i++)ch[i]=pcm[i]/32768;
 const src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);src.start();
}
function stopLive(){
 liveRunning=false;if(liveSocket)liveSocket.close();liveSocket=null;
 if(micProcessor)micProcessor.disconnect();if(micSource)micSource.disconnect();if(liveAudioCtx)liveAudioCtx.close().catch(()=>{});
 micProcessor=micSource=liveAudioCtx=null;
 if($("liveArea"))$("liveArea").innerHTML="";
}
load();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
