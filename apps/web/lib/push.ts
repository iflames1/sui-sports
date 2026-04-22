import { apiFetch } from "@/lib/api";

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function bufferToBase64Url(buf: ArrayBuffer | null) {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = globalThis.btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function subscribeToPush(token: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported on this device.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied.");
  }
  const reg = await navigator.serviceWorker.ready;
  const cfg = await apiFetch<{ publicKey: string | null }>(
    `/config/vapid-public-key`,
    { method: "GET" },
  );
  if (!cfg.publicKey) {
    throw new Error(
      "Push is not configured on the server. Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.",
    );
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
  });
  const json = sub.toJSON();
  const keys = (json.keys ?? {}) as Record<string, string>;
  await apiFetch(
    `/notifications/push-subscribe`,
    {
      method: "POST",
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: keys.p256dh ?? bufferToBase64Url(sub.getKey("p256dh")),
        auth: keys.auth ?? bufferToBase64Url(sub.getKey("auth")),
      }),
    },
    token,
  );
  return true;
}
