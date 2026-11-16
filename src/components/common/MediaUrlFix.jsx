import { useEffect } from "react";

function toApiMedia(value) {
  if (!value || typeof value !== "string") return value;
  return value.replace(/^(https?:\/\/[^/]+)?\/uploads\//, "/api/uploads/file/");
}

function patch(el) {
  if (!(el instanceof Element)) return;
  const tag = el.tagName;
  if (tag !== "IMG" && tag !== "VIDEO" && tag !== "AUDIO" && tag !== "SOURCE") return;
  const src = el.getAttribute("src");
  const next = toApiMedia(src);
  if (src && next !== src) el.setAttribute("src", next);
  const poster = el.getAttribute("poster");
  const nextPoster = toApiMedia(poster);
  if (poster && nextPoster !== poster) el.setAttribute("poster", nextPoster);
}

export default function MediaUrlFix() {
  useEffect(() => {
    const scan = (node) => {
      if (!(node instanceof Element)) return;
      patch(node);
      node.querySelectorAll("img,video,audio,source").forEach(patch);
    };
    scan(document.body);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") patch(record.target);
        record.addedNodes.forEach(scan);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "poster"],
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
