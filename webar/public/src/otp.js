// public/src/otp.js
import { OTP_CODE_STATIC, OTP_STORE_KEY } from "./config.js";
import { dbg, storage } from "./utils.js";

function getEls() {
  const q = (id) => document.getElementById(id);
  const els = {
    gate: q("otpGate"),
    phone: q("otpPhone"),
    send:  q("btnSendCode"),
    wrap:  q("otpCodeWrap"),
    inputsWrap: q("otpInputs"),
    verify: q("btnVerifyCode"),
    error: q("otpError"),
    resend: q("btnResend"),
    timer: q("otpTimer"),
    reset: q("btnOtpReset"),
  };
  // Наад захын null хамгаалалт
  Object.entries(els).forEach(([k,v]) => {
    if (!v) dbg(`OTP UI element missing: ${k}`);
  });
  return els;
}

function isOtpVerified(){
  const d = storage.get(OTP_STORE_KEY);
  return !!(d && d.ok === true);
}
function saveOtpVerified(phone){
  storage.set(OTP_STORE_KEY, { ok:true, phone: phone||"", ts: Date.now() });
}

function createInputs(els){
  els.inputsWrap.innerHTML="";
  for (let i=0;i<6;i++){
    const inp = document.createElement("input");
    inp.maxLength=1; inp.inputMode="numeric"; inp.pattern="\\d*";
    inp.addEventListener("input", e=>{
      e.target.value=e.target.value.replace(/\D/g,"").slice(0,1);
      if (e.target.value && i<5) els.inputsWrap.children[i+1].focus();
    });
    inp.addEventListener("keydown", e=>{
      if (e.key==="Backspace" && !e.target.value && i>0) els.inputsWrap.children[i-1].focus();
    });
    inp.addEventListener("paste", e=>{
      const txt=(e.clipboardData.getData("text")||"").replace(/\D/g,"").slice(0,6);
      if (!txt) return; e.preventDefault();
      [...txt].forEach((d,idx)=>{ if (els.inputsWrap.children[idx]) els.inputsWrap.children[idx].value=d; });
      if (txt.length===6) els.verify.click();
    });
    els.inputsWrap.appendChild(inp);
  }
}
function enteredCode(els){ return [...els.inputsWrap.querySelectorAll("input")].map(i=>i.value||"").join(""); }
function clearInputs(els){ els.inputsWrap.querySelectorAll("input").forEach(i=>i.value=""); els.inputsWrap.firstChild?.focus(); }
function showError(els, m){ els.error.textContent=m||""; }
function setCooldown(els, sec=60){
  let left=sec; els.resend.disabled=true; els.timer.textContent=left;
  const iv=setInterval(()=>{ left--; els.timer.textContent=left;
    if (left<=0){ clearInterval(iv); els.resend.disabled=false; } },1000);
}

/**
 * Promise-ээр баталгаажуулалт.
 * - Хэрэв аль хэдийн verified: шууд resolve(true) + openCb() (хэрвээ өгсөн бол).
 * - Үгүй бол UI нээгээд, Verify амжилттай болмогц resolve(true).
 */
export function ensureOtp(openCb){
  const els = getEls();
  if (isOtpVerified()){
    dbg("OTP: already verified on this device");
    openCb?.();
    return Promise.resolve(true);
  }

  // UI setup
  els.gate.hidden=false;
  createInputs(els);
  showError(els, "");
  els.wrap.hidden=true;

  return new Promise((resolve) => {
    els.send.onclick = () => {
      const p = (els.phone.value||"").replace(/\D/g,"");
      if (p.length!==8){
        showError(els, "Утасны 8 цифр оруулна уу.");
        return;
      }
      showError(els, "");
      els.wrap.hidden=false;
      clearInputs(els);
      setCooldown(els, 60);
      dbg("OTP sent (demo): "+OTP_CODE_STATIC);
    };

    els.verify.onclick = () => {
      const code = enteredCode(els);
      if (code.length!==6){ showError(els, "6 оронтой кодоо бүрэн оруулна уу."); return; }
      if (code!==OTP_CODE_STATIC){ showError(els, "Буруу код. Дахин оролдоно уу."); return; }
      saveOtpVerified(els.phone.value);
      els.gate.hidden=true; showError(els, "");
      dbg("OTP verified");
      openCb?.();
      resolve(true);
    };

    els.resend.onclick = ()=>{
      clearInputs(els);
      setCooldown(els, 60);
      dbg("OTP re-sent (demo): "+OTP_CODE_STATIC);
    };

    els.reset.onclick  = ()=>{
      storage.del(OTP_STORE_KEY);
      els.gate.hidden=false;
      showError(els, "");
      dbg("OTP reset; please verify again");
    };
  });
}
