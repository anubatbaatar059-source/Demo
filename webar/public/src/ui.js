import { BTN_TIMELINE, BTN_OFFSETS_LOCKED } from "./config.js";
import { worldToScreen, localPointOnPlane } from "./ar.js";

// (Хуучин гурван товч байгаа бол ашиглана; байхгүй байж болно)
const introBtnEls = {
  ex: document.getElementById("ibExercise"),
  gr: document.getElementById("ibGrowth"),
  kn: document.getElementById("ibKnowledge"),
};

// ШИНЭ segmented меню
const segEl = document.getElementById("introSeg");
const segBtns = segEl ? Array.from(segEl.querySelectorAll(".seg-btn")) : [];

const introBtnState = {
  ex: { shown:false, u:null, v:null },
  gr: { shown:false, u:null, v:null },
  kn: { shown:false, u:null, v:null }
};

let vIntro = null;
let lastUIT = -1;
let showIntroBtns = false;

// App-аас өгөх action callback-ууд
let handlers = { onEx:null, onGr:null, onKn:null };

export function bindIntroButtons(videoEl){
  vIntro = videoEl;
  showIntroBtns = true;

  // segmented click binding (нэг удаа)
  if (segBtns.length && !segEl.dataset.bound) {
    segEl.dataset.bound = "1";
    segBtns.forEach(btn=>{
      btn.addEventListener("click", ()=>{
        // UI active төлөв
        segBtns.forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        // Action
        const act = btn.dataset.act;
        if (act==="ex") handlers.onEx?.();
        else if (act==="gr") handlers.onGr?.();
        else if (act==="kn") handlers.onKn?.();
      });
    });
  }
}

export function initIntroMenuCallbacks({ onExercise, onGrowth, onKnowledge }){
  handlers.onEx = onExercise;
  handlers.onGr = onGrowth;
  handlers.onKn = onKnowledge;
}

export function stopIntroButtons(){
  showIntroBtns = false;
  // segmented менюг нуух
  if (segEl){ segEl.classList.add("hide"); segEl.classList.remove("show"); }
  // хуучин гурван товчийг нуух
  ["ex","gr","kn"].forEach(id => introBtnEls[id]?.classList.remove("show","mini"));
}

export function updateIntroButtons(){
  if (!showIntroBtns || !vIntro) return;

  const t = vIntro.currentTime || 0;
  if (Math.abs(t - lastUIT) < 0.033) return; // ~30fps-ээс ойрхон бол алгас
  lastUIT = t;

  const segOf = id => {
    const f = BTN_TIMELINE.filter(s => s.id===id && t>=s.t[0] && t<s.t[1]);
    return f.length ? f[f.length-1] : null;
  };

  // --- Хуучин тус тусдаа товчлуурууд (хэрвээ байгаа бол байршуулна)
  const procOld = (key, el) => {
    if (!el) return;
    const seg = segOf(key);
    const st = introBtnState[key];
    if (seg && seg.show){ st.shown = true; st.u = seg.u; st.v = seg.v; }
    if (st.shown && st.u!=null && st.v!=null){
      const scr = worldToScreen(localPointOnPlane(st.u, st.v));
      if (seg){
        el.style.left = scr.x + "px";
        el.style.top  = scr.y + "px";
        el.classList.remove("mini");
      } else {
        const off = BTN_OFFSETS_LOCKED[key] || {dx:0, dy:0};
        el.style.left = (scr.x + off.dx) + "px";
        el.style.top  = (scr.y + off.dy) + "px";
        el.classList.add("mini");
      }
      el.classList.add("show");
    } else {
      el.classList.remove("show","mini");
    }
  };
  procOld("ex", introBtnEls.ex);
  procOld("gr", introBtnEls.gr);
  procOld("kn", introBtnEls.kn);

  // --- ШИНЭ segmented менюг world-tracked байдлаар байрлуулах
  if (!segEl) return;

  // Идэвхтэй сегмент (видеоны тухайн мөчид)
  const sEX = segOf("ex");
  const sGR = segOf("gr");
  const sKN = segOf("kn");
  const activeSeg = sEX || sGR || sKN;

  if (activeSeg){
    const scr = worldToScreen(localPointOnPlane(activeSeg.u, activeSeg.v));
    segEl.style.left = scr.x + "px";
    segEl.style.top  = scr.y + "px";
    segEl.classList.add("show");
    segEl.classList.remove("hide");
  } else {
    // Sticky байрлал (интро өнгөрөөд дэлгэцийн доод 28%-д төвлөрүүлнэ)
    const rect = document.body.getBoundingClientRect();
    const off = BTN_OFFSETS_LOCKED["ex"] || {dx:0, dy:0};
    segEl.style.left = (rect.width * 0.5 + off.dx) + "px";
    segEl.style.top  = (rect.height * 0.72 + off.dy) + "px";
    segEl.classList.add("show");
    segEl.classList.remove("hide");
  }
}

// Меню overlay (том панель)
const menu = document.getElementById("menu");
export function showMenuOverlay(){
  if (!menu) return;
  menu.style.display = "flex";
  menu.style.opacity = "1";
  menu.style.pointerEvents = "auto";
}
export function closeMenu(){
  if (!menu) return;
  menu.style.display = "none";
}
