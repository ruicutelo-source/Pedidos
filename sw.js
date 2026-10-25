// Service worker: guarda a app no tablet para funcionar sem internet.
// Ao publicar uma versão nova, aumente o número da versão abaixo.
const VERSAO = "bloco-pedidos-v1.1";
const FICHEIROS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png",
                   "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  const SDK = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"]
    .map((f) => "https://www.gstatic.com/firebasejs/10.14.1/" + f);
  e.waitUntil(caches.open(VERSAO)
    .then((c) => c.addAll(FICHEIROS).then(() => c.addAll(SDK).catch(() => {})))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (para receber atualizações); sem rede, usa a cópia guardada.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = e.request.url;
  // pedidos à base de dados e ao login passam sempre diretamente pela rede (o Firebase trata o modo offline)
  if (!url.startsWith(self.location.origin) && !url.includes("gstatic.com/firebasejs")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
