// Inside the Android app (Capacitor WebView) browser-style downloads
// (blob:/data: links, jsPDF.save, XLSX.writeFile) silently do nothing.
// This routes them to the native FileSaver plugin, which saves the file to
// Downloads and opens it. On the regular website this module does nothing.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface FileSaverPlugin {
  save(options: { data: string; fileName: string; mimeType: string }): Promise<{ uri: string }>;
}

const FileSaver = registerPlugin<FileSaverPlugin>("FileSaver");

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function guessMime(fileName: string, fallback: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (fallback && fallback !== "application/octet-stream") return fallback.split(";")[0];
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  try {
    const data = await blobToBase64(blob);
    await FileSaver.save({ data, fileName, mimeType: guessMime(fileName, blob.type) });
  } catch (err) {
    console.error("[nativeDownloads] save failed", err);
    alert("تعذّر حفظ الملف على الجهاز.");
  }
}

async function saveDataUrl(dataUrl: string, fileName: string): Promise<void> {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma);
  const isBase64 = meta.endsWith(";base64");
  const payload = dataUrl.slice(comma + 1);
  const data = isBase64 ? payload : btoa(unescape(encodeURIComponent(decodeURIComponent(payload))));
  try {
    await FileSaver.save({ data, fileName, mimeType: guessMime(fileName, meta.replace(";base64", "")) });
  } catch (err) {
    console.error("[nativeDownloads] save failed", err);
    alert("تعذّر حفظ الملف على الجهاز.");
  }
}

function install(): void {
  // Keep a handle on every Blob behind a blob: URL so a later link click can read it.
  const blobs = new Map<string, Blob>();
  const createObjectURL = URL.createObjectURL.bind(URL);
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = createObjectURL(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    blobs.delete(url);
    revokeObjectURL(url);
  };

  // Returns true when the anchor was a file download we handled natively.
  const handleAnchor = (a: HTMLAnchorElement): boolean => {
    if (!a.hasAttribute("download")) return false;
    const href = a.href;
    const fileName = a.getAttribute("download") || "download";
    if (href.startsWith("blob:")) {
      const blob = blobs.get(href);
      if (!blob) return false;
      void saveBlob(blob, fileName);
      return true;
    }
    if (href.startsWith("data:")) {
      void saveDataUrl(href, fileName);
      return true;
    }
    return false;
  };

  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (handleAnchor(this)) return;
    nativeClick.call(this);
  };

  const nativeDispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (this: HTMLAnchorElement, event: Event) {
    if (event.type === "click" && handleAnchor(this)) return false;
    return nativeDispatch.call(this, event);
  };

  document.addEventListener(
    "click",
    (event) => {
      const a = (event.target as Element | null)?.closest?.("a[download]");
      if (a instanceof HTMLAnchorElement && handleAnchor(a)) event.preventDefault();
    },
    true,
  );

  // jsPDF and SheetJS both prefer a global saveAs when one exists.
  (window as unknown as { saveAs: (blob: Blob, name?: string) => void }).saveAs = (blob, name) => {
    void saveBlob(blob, name || (blob as File).name || "download");
  };
}

if (Capacitor.isNativePlatform()) {
  try {
    install();
  } catch (err) {
    console.error("[nativeDownloads] install failed", err);
  }
}
