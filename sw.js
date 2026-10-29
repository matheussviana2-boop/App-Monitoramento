/* Service worker — Checagem de Câmeras (PWA)
 * - Guarda o app no aparelho: abre rápido e funciona mesmo com sinal fraco.
 * - A página é buscada na rede primeiro (para pegar atualizações) e cai no cache se a rede falhar.
 * - Chamadas à API (Google Apps Script) nunca passam pelo cache.
 * Ao publicar uma versão nova do index.html, aumente VERSAO para forçar a atualização nos aparelhos.
 */
const VERSAO = 'cameras-v3';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO && k.startsWith('cameras-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;                                            // API (POST) direto na rede
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;         // nunca cachear a API

  // página do app: rede primeiro (até 4 s), depois cache
  if (req.mode === 'navigate' && url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSAO);
      try {
        const rede = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 4000))]);
        if (rede && rede.ok) await cache.put('./index.html', rede.clone());
        return rede;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // fontes do Google: usa o cache e atualiza por trás
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSAO).then(async c => {
      const em = await c.match(req);
      const busca = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => em);
      return em || busca;
    }));
    return;
  }

  // demais arquivos do app (ícones, manifest): cache primeiro. cadastro.html e dashboard.html seguem direto na rede.
  if (url.origin === location.origin && !/\.html$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(em => em || fetch(req).then(r => {
      if (r.ok){ const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
      return r;
    })));
  }
});
