export function pickSource(sources) {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    return (sources.find(x => x.format === "hls")
         || sources.find(x => x.format === "mp4")
         || sources[0] || {}).url || "";
  }
  return (sources.find(x => x.format === "webm")
       || sources.find(x => x.format === "mp4")
       || sources.find(x => x.format === "hls")
       || sources[0] || {}).url || "";
}
