import { INTRO_WEBM_URL, INTRO_MP4_URL, EXERCISE_WEBM_URL, EXERCISE_MP4_URL } from "./config.js";
import { isIOS, dbg } from "./utils.js";
import { initAR, ensureCamera, onFrame, setSources, videoTexture, fitPlaneToVideo, makeSbsAlphaMaterial, applyScale } from "./ar.js";
import { bindIntroButtons, updateIntroButtons, showMenuOverlay, closeMenu, stopIntroButtons } from "./ui.js";
import { ensureOtp } from "./otp.js";

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

// ====== main ======
await initAR();

// OTP → амжилттай бол: эхлээд GPS (алдаа бол зүгээр алгасна) → дараа нь интро
await ensureOtp(async ()=>{
  try{
    const pos = await getGeoOnce();
    dbg(fmtLoc(pos));
  }catch(e){
    dbg("GPS error: " + (e?.message||e));
  }
  await startIntroFlow(true);
});

// tap-to-start fallback
tapLay.addEventListener("pointerdown", async ()=>{
  tapLay.style.display="none";
  try{ await startIntroFlow(true); }catch(e){ dbg("after tap failed: "+(e?.message||e)); }
});

// Меню товч
document.getElementById("mExercise")?.addEventListener("click", startExerciseDirect);

// render callback (интро үед world-tracked UI-г хөдөлгөх)
onFrame(()=>{ if (currentVideo===vIntro) updateIntroButtons(); });

// ===== flows =====
async function startIntroFlow(fromTap=false){
  bindIntroButtons(vIntro);

  await ensureCamera();

  setSources(vIntro, INTRO_WEBM_URL, INTRO_MP4_URL, isIOS);
  setSources(vEx,    EXERCISE_WEBM_URL, EXERCISE_MP4_URL, isIOS);

  const texIntro = videoTexture(vIntro);
  if (isIOS) {
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
      // эндээс pos.coords.latitude/longitude ашиглаад контент/UX-ээ өөрчилж болно
    });
  }catch(e){ dbg("GPS watch failed: " + (e?.message||e)); }

  // Интро дуусахад: sticky + том меню
  vIntro.onended = () => {
    try {
      ["ex","gr","kn"].forEach(id=>{
        const el = document.getElementById("ib"+({ex:"Exercise",gr:"Growth",kn:"Knowledge"})[id]);
        el?.classList.add("mini");
      });
    } catch {}
    showMenuOverlay();
    dbg("intro ended → menu shown; intro buttons sticky.");
  };
}

async function startExerciseDirect(){
  closeMenu(); 
  stopIntroButtons();
  stopGeoWatch();     // ✅ дасгал руу ороход GPS watch-ийг унтраана
  await ensureCamera();

  try{ currentVideo?.pause?.(); }catch{}

  setSources(vEx, EXERCISE_WEBM_URL, EXERCISE_MP4_URL, isIOS);
  const texEx = videoTexture(vEx);
  if (isIOS) planeUseShader(texEx); else planeUseMap(texEx);

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

// Unmute
btnUnmute.addEventListener("click", async ()=>{
  try {
    if (!currentVideo) return;
    currentVideo.muted=false;
    await currentVideo.play();
    btnUnmute.style.display="none";
  } catch { dbg("unmute failed"); }
});
