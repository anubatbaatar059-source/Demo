import { INTRO_WEBM_URL, INTRO_MP4_URL, EXERCISE_WEBM_URL, EXERCISE_MP4_URL } from "./config.js";
import { isIOS, dbg } from "./utils.js";
import { initAR, ensureCamera, onFrame, setSources, videoTexture, fitPlaneToVideo, makeSbsAlphaMaterial, applyScale } from "./ar.js";
import { bindIntroButtons, updateIntroButtons, showMenuOverlay, closeMenu, stopIntroButtons } from "./ui.js";
import { ensureOtp } from "./otp.js";

// DOM
const vIntro = document.getElementById("vidIntro");
const vEx    = document.getElementById("vidExercise");
const btnUnmute = document.getElementById("btnUnmute");
const tapLay = document.getElementById("tapToStart");
let currentVideo = null;

// main
await initAR();

// OTP → амжилттай бол интро эхлүүлнэ
await ensureOtp(startIntroFlow);

// tap-to-start fallback
tapLay.addEventListener("pointerdown", async ()=>{
  tapLay.style.display="none";
  try{ await startIntroFlow(true); }catch(e){ dbg("after tap failed: "+(e?.message||e)); }
});

// Меню товч
document.getElementById("mExercise").addEventListener("click", startExerciseDirect);

// render callback (интро үед world-tracked товчийг хөдөлгөх)
onFrame(()=>{ if (currentVideo===vIntro) updateIntroButtons(); });

// ===== flows =====
async function startIntroFlow(fromTap=false){
  bindIntroButtons(vIntro);

  await ensureCamera();

  setSources(vIntro, INTRO_WEBM_URL, INTRO_MP4_URL, isIOS);
  setSources(vEx,    EXERCISE_WEBM_URL, EXERCISE_MP4_URL, isIOS);

  const texIntro = videoTexture(vIntro);
  if (isIOS) {
    vIntro.hidden=false;
    vIntro.onloadedmetadata = ()=>fitPlaneToVideo(vIntro);
    planeUseShader(texIntro);
  } else {
    planeUseMap(texIntro);
    if (vIntro.readyState>=1) fitPlaneToVideo(vIntro);
    else vIntro.addEventListener("loadedmetadata", ()=>fitPlaneToVideo(vIntro), { once:true });
  }

  currentVideo = vIntro;
  try { vIntro.muted=false; await vIntro.play(); btnUnmute.style.display="none"; }
  catch {
    try { vIntro.muted=true; await vIntro.play(); btnUnmute.style.display="inline-block"; }
    catch(e){ if(!fromTap){ tapLay.style.display="grid"; throw e; } }
  }
  applyScale();
  dbg("intro playing");

  vIntro.onended = () => { ["ex","gr","kn"].forEach(id=>document.getElementById("ib"+({ex:"Exercise",gr:"Growth",kn:"Knowledge"})[id]).classList.add("mini")); showMenuOverlay(); dbg("intro ended → menu shown; intro buttons sticky."); };
}

async function startExerciseDirect(){
  closeMenu(); stopIntroButtons();
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

function planeUseMap(tex){ import("./ar.js").then(({ plane }) => { plane.material.map = tex; plane.material.transparent = true; plane.material.needsUpdate = true; }); }
function planeUseShader(tex){ import("./ar.js").then(({ plane }) => { plane.material?.dispose?.(); plane.material = makeSbsAlphaMaterial(tex); }); }

// Unmute
btnUnmute.addEventListener("click", async ()=>{
  try { if (!currentVideo) return; currentVideo.muted=false; await currentVideo.play(); btnUnmute.style.display="none"; }
  catch { dbg("unmute failed"); }
});
