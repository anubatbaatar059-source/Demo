// app.js — Firestore-оос уншдаг хувилбар (Intro эхэлж тоглоно, дуусах хүртэл lock)

import { isIOS, dbg } from "./utils.js";
import {
  initAR, ensureCamera, onFrame,
  setSources, videoTexture, fitPlaneToVideo,
  makeSbsAlphaMaterial, applyScale
} from "./ar.js";
import {
  bindIntroButtons, updateIntroButtons,
  showMenuOverlay, closeMenu, stopIntroButtons
} from "./ui.js";
import { ensureOtp } from "./otp.js";

// 🔁 Firestore-оос унших нэмэлтүүд
import {
  fetchIntro,
  fetchExercisesByLocation,
  resolveLocationId
} from "./data/videos.js";

// ====== Geolocation helpers (энгийн, дотоод) ======
let geoWatchId = null;
function canGeolocate(){ return 'geolocation' in navigator; }
function getGeoOnce(options={}){
  if (!canGeolocate()) return Promise.reject(new Error("Geolocation not supported"));
  const opts = { enableHighAccuracy:true, timeout:10000, maximumAge:0, ...options };
  return new Promise((resolve,reject)=>{
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}
function startGeoWatch(onUpdate, options={}){
  if (!canGeolocate()) throw new Error("Geolocation not supported");
  const opts = { enableHighAccuracy:true, timeout:20000, maximumAge:5000, ...options };
  if (geoWatchId!=null) stopGeoWatch();
  geoWatchId = navigator.geolocation.watchPosition(onUpdate, (err)=>onUpdate?.(null, err), opts);
}
function stopGeoWatch(){
  if (geoWatchId!=null && navigator.geolocation?.clearWatch){
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
}
function fmtLoc(pos){
  if (!pos) return "";
  const { latitude, longitude, accuracy } = pos.coords || {};
  return `GPS: lat=${latitude?.toFixed(6)} lng=${longitude?.toFixed(6)} ±${Math.round(accuracy||0)}m`;
}

// ====== DOM ======
const vIntro = document.getElementById("vidIntro");
const vEx    = document.getElementById("vidExercise");
const btnUnmute = document.getElementById("btnUnmute");
const tapLay = document.getElementById("tapToStart");
let currentVideo = null;

// Exercises-ийн кэш
let EX_LIST = [];            // [{ id, name, sources:[{format,url},...] }, ...]
let SELECTED_EX = null;      // сонгосон бичлэг

// ✅ Intro control flags
let introStarting = false;   // аль хэдийн intro эхлэж байгаа эсэх
let introDone     = false;   // intro бүрэн дууссан эсэх

// ====== main ======
await initAR();

// 🔐 Эхлээд OTP → дараа нь GPS (алдаа бол алгасна) → интро
await ensureOtp(); // callback хэрэггүй — resolve болтол хүлээнэ
try{
  const pos = await getGeoOnce();
  dbg(fmtLoc(pos));
}catch(e){
  dbg("GPS error: " + (e?.message||e));
}
await startIntroFlow(true);

// tap-to-start fallback
tapLay?.addEventListener("pointerdown", async ()=>{
  tapLay.style.display="none";
  try{ await startIntroFlow(true); }catch(e){ dbg("after tap failed: "+(e?.message||e)); }
});

// Меню товч (default: эхний exercise-г тоглуулна)
document.getElementById("mExercise")?.addEventListener("click", ()=>{
  // 🔒 Intro дуусаагүй бол хориглоно
  if (!introDone) { dbg("Please watch the intro first."); return; }
  SELECTED_EX = SELECTED_EX || EX_LIST?.[0] || null;
  startExerciseDirect();
});

// render callback (интро үед world-tracked UI-г хөдөлгөх)
onFrame(()=>{ if (currentVideo===vIntro) updateIntroButtons(); });

// ===== flows =====
async function startIntroFlow(fromTap=false){
  // 🔒 Давхар дуудагдах/skip хийхээс хамгаална
  if (introStarting || introDone) return;
  introStarting = true;

  try {
    bindIntroButtons(vIntro);
    await ensureCamera();

    // ---------- 1) Firestore → Intro
    const introDoc = await fetchIntro();
    if (!introDoc || !introDoc.sources?.length){
      dbg("intro source not found");
      return;
    }
    const fmt = pickFormats(introDoc.sources);
    applySources(vIntro, fmt); // HLS-ийг зөв MIME-тай, бусдыг setSources-оор

    // ---------- 2) Firestore → Exercises (байршлаар)
    const locParam = new URL(location.href).searchParams.get("loc") || "";
    const locationId = await resolveLocationId(locParam);
    EX_LIST = locationId ? await fetchExercisesByLocation(locationId) : [];
    SELECTED_EX = EX_LIST?.[0] || null;

    // ---------- 3) Intro видеог AR plane дээр байрлуулж тоглуулах
    const texIntro = videoTexture(vIntro);
    if (fmt.isSbs) { // SBS бол шэйдэр
      vIntro.hidden = false;
      vIntro.onloadedmetadata = ()=>fitPlaneToVideo(vIntro);
      planeUseShader(texIntro);
    } else {
      planeUseMap(texIntro);
      if (vIntro.readyState>=1) fitPlaneToVideo(vIntro);
      else vIntro.addEventListener("loadedmetadata", ()=>fitPlaneToVideo(vIntro), { once:true });
    }

    currentVideo = vIntro;

    // iOS autoplay policy-д тааруулж эхлүүлэх
    try { vIntro.muted=false; await vIntro.play(); btnUnmute.style.display="none"; }
    catch {
      try { vIntro.muted=true; await vIntro.play(); btnUnmute.style.display="inline-block"; }
      catch(e){ if(!fromTap){ tapLay.style.display="grid"; throw e; } }
    }

    applyScale();
    dbg("intro playing");

    // 🔄 GPS watch асаах (интро явж байх хугацаанд)
    try{
      startGeoWatch((pos, err)=>{
        if (err) { dbg("GPS watch error: " + (err?.message||err)); return; }
        dbg(fmtLoc(pos));
      });
    }catch(e){ dbg("GPS watch failed: " + (e?.message||e)); }

    // Интро дуусахад: sticky + том меню
    vIntro.onended = () => {
      introDone = true; // ✅ Intro played бүрэн
      try {
        ["ex","gr","kn"].forEach(id=>{
          const el = document.getElementById("ib"+({ex:"Exercise",gr:"Growth",kn:"Knowledge"})[id]);
          el?.classList.add("mini");
        });
      } catch {}
      if (!EX_LIST?.length) dbg("no exercises for this location");
      showMenuOverlay();
      dbg("intro ended → menu shown; intro buttons sticky.");
    };
  } finally {
    // Интро эхлүүлж чадаагүй / эрт return хийсэн тохиолдолд дахин оролдож болохоор болгоно
    if (!introDone) introStarting = false;
  }
}

async function startExerciseDirect(){
  // 🔒 Intro дуустал дасгал руу оруулахгүй
  if (!introDone) { dbg("Please watch the intro first."); return; }

  closeMenu();
  stopIntroButtons();
  stopGeoWatch();     // ✅ дасгал руу ороход GPS watch-ийг унтраана
  await ensureCamera();

  try{ currentVideo?.pause?.(); }catch{}

  if (!SELECTED_EX){
    dbg("no selected exercise"); return;
  }
  const fmtEx = pickFormats(SELECTED_EX.sources || []);
  applySources(vEx, fmtEx);

  const texEx = videoTexture(vEx);
  if (fmtEx.isSbs) planeUseShader(texEx); else planeUseMap(texEx);

  if (vEx.readyState>=1) fitPlaneToVideo(vEx);
  else await new Promise(r => vEx.addEventListener("loadedmetadata", ()=>{ fitPlaneToVideo(vEx); r(); }, { once:true }));

  vEx.currentTime=0; currentVideo=vEx;

  try { vEx.muted=false; await vEx.play(); btnUnmute.style.display="none"; }
  catch { try { vEx.muted=true; await vEx.play(); btnUnmute.style.display="inline-block"; } catch{} }

  dbg("exercise playing (AR, no menu).");
}

// ===== helpers (texture→material) =====
function planeUseMap(tex){
  import("./ar.js").then(({ plane }) => {
    plane.material.map = tex;
    plane.material.transparent = true;
    plane.material.needsUpdate = true;
  });
}
function planeUseShader(tex){
  import("./ar.js").then(({ plane, makeSbsAlphaMaterial }) => {
    plane.material?.dispose?.();
    plane.material = makeSbsAlphaMaterial(tex);
    plane.material.needsUpdate = true;
  });
}

/**
 * Formats → <video> эх сурвалж тавигч
 * - iOS дээр HLS байвал зөв MIME-тайгаар нэн тэргүүнд тавина
 * - бусад тохиолдолд ar.js → setSources(webm, mp4, forceMP4) ашиглана
 */
function applySources(videoEl, fmt){
  if (!videoEl) return;

  // HLS (iOS Safari native)
  if (fmt?.type === "hls" && fmt?.mp4) {
    try {
      videoEl.innerHTML = "";
      const s = document.createElement("source");
      s.src = fmt.mp4; // энд m3u8 ирсэн байгаа
      s.type = "application/vnd.apple.mpegurl";
      videoEl.appendChild(s);
      videoEl.load();
      return;
    } catch {}
  }

  // Бусад: WEBM/MP4
  setSources(videoEl, fmt?.webm || "", fmt?.mp4 || "", false);
}

// Formats → setSources-т таарах байдлаар салгаж авах
// app.js доторх helpers — HLS-ийг iOS-д 1-т тавина
function pickFormats(srcs){
  const m = {};
  (srcs||[]).forEach(s=>{
    const f = (s.format||"").toLowerCase();
    if (f === "mp4_sbs") m.mp4_sbs = s.url;
    else if (f.includes("webm")) m.webm = s.url;
    else if (f.includes("mp4"))  m.mp4  = s.url;
    if (f.includes("hls") || s.url?.endsWith(".m3u8")) m.hls = s.url;
  });

  if (isIOS) {
    if (m.hls)     return { webm: "", mp4: m.hls,     isSbs:false, type:"hls" }; // HLS 1-т
    if (m.mp4_sbs) return { webm: "", mp4: m.mp4_sbs, isSbs:true,  type:"mp4" };
    if (m.mp4)     return { webm: "", mp4: m.mp4,     isSbs:false, type:"mp4" };
    if (m.webm)    return { webm: m.webm, mp4:"",     isSbs:false, type:"webm" };
  }
  if (m.webm)     return { webm: m.webm, mp4:"",       isSbs:false, type:"webm" };
  if (m.mp4)      return { webm:"",      mp4: m.mp4,   isSbs:false, type:"mp4" };
  if (m.mp4_sbs)  return { webm:"",      mp4: m.mp4_sbs,isSbs:true, type:"mp4" };
  return { webm:"", mp4:"", isSbs:false, type:"" };
}

// Unmute
btnUnmute?.addEventListener("click", async ()=>{
  try {
    if (!currentVideo) return;
    currentVideo.muted=false;
    await currentVideo.play();
    btnUnmute.style.display="none";
  } catch { dbg("unmute failed"); }
});
