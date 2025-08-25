// public/src/data/videos.js
import { db } from "../firebase.js";
import {
  collection, doc, getDoc, getDocs,
  query, where, orderBy, limit
} from "firebase/firestore";

// ---- helpers ----
function normFmt(f=""){ 
  f = f.toLowerCase(); 
  if (f === "mp4_sbs") return "mp4_sbs";
  if (f.includes("webm")) return "webm";
  if (f.includes("mp4"))  return "mp4";
  return f;
}

// Интро: name == "intro" гэж ялгана (kind талбар заавал биш)
export async function fetchIntro(){
  let qy;
  try {
    qy = query(
      collection(db, "videos"),
      where("name", "==", "intro"),
      // createdAt байхгүй бол orderBy-гүйгээр ч болно
      orderBy("uploadedAt", "desc"),
      limit(10)
    );
  } catch {
    qy = query(collection(db, "videos"), where("name","==","intro"), limit(10));
  }

  const snap = await getDocs(qy);
  if (snap.empty) return null;

  // Хамгийн сүүлийн үеийн WEBM / MP4_SBS / MP4-ыг түүвэрлэнэ
  let base = null, webm=null, mp4sbs=null, mp4=null;
  snap.docs.forEach(d => {
    const x = d.data();
    base = base || { id:d.id, ...x };
    const f = normFmt(x.format);
    if (!webm   && f === "webm")    webm   = { format:"webm",    url:x.url };
    if (!mp4sbs && f === "mp4_sbs") mp4sbs = { format:"mp4_sbs", url:x.url };
    if (!mp4    && f === "mp4")     mp4    = { format:"mp4",     url:x.url };
  });

  const sources = [mp4sbs, webm, mp4].filter(Boolean); // эрэмбэ: iOS-д тохиромжтойг түрүүлж тавьсан
  return sources.length ? { ...base, sources } : null;
}

// Дасгалууд: тухайн locationId-аар шигшээд, НЭР бүрээр форматуудаа нэгтгэнэ
export async function fetchExercisesByLocation(locationId){
  let qy;
  try {
    qy = query(
      collection(db, "videos"),
      where("locationId","==", locationId),
      // name == "intro" бишийг дараа нь кодоор шүүнэ
      orderBy("uploadedAt", "desc")
    );
  } catch {
    qy = query(collection(db, "videos"), where("locationId","==", locationId));
  }

  const snap = await getDocs(qy);
  if (snap.empty) return [];

  const map = new Map(); // key = name
  snap.docs.forEach(d=>{
    const x = d.data();
    if ((x.name||"").toLowerCase() === "intro") return; // интро-г алгас
    const key = x.name || d.id;
    if (!map.has(key)){
      map.set(key, { id:d.id, name:x.name||key, locationId:x.locationId, sources: [], ...x });
    }
    const f = normFmt(x.format);
    const arr = map.get(key).sources;
    if (x.url && f && !arr.find(s=>s.format===f)){
      arr.push({ format:f, url:x.url });
    }
  });

  // Хоосон sources-тойг хас
  return Array.from(map.values()).filter(it => (it.sources?.length||0) > 0);
}

// Байршлын код/ID-г шийдэгч хэвээр үлдээнэ
export async function resolveLocationId(locParam){
  if (!locParam) return "";
  const direct = await getDoc(doc(db, "locations", locParam));
  if (direct.exists()) return direct.id;

  const qq = query(collection(db, "locations"), where("code","==", locParam), limit(1));
  const ss = await getDocs(qq);
  return ss.empty ? "" : ss.docs[0].id;
}
