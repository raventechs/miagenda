// sw-miagenda.js — MiAgenda v2.3
// Notificaciones locales sin FCM — Timezone: America/Argentina/Buenos_Aires
// Lógica de avisos por evento (examen, TP, compromiso):
//   - 3 días antes → 07:00
//   - 1 día antes  → a la hora del evento (o 07:00 si no tiene hora)
//   - Mismo día    → 07:00

const CACHE_NAME = 'miagenda-v2.3';
const SHELL = [
  '/miagenda/',
  '/miagenda/index.html',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 &&
            (url.origin === self.location.origin ||
             url.hostname.includes('googleapis.com') ||
             url.hostname.includes('gstatic.com'))) {
          const clon = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clon));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('/miagenda/index.html');
      });
    })
  );
});

// ── Estado interno ─────────────────────────────────────────────
let eventos       = [];
let yaNotificados = {};

// ── Helpers fecha/hora Argentina ──────────────────────────────
function ahoraAR() {
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value || '00';
  return {
    fecha: `${get('year')}-${get('month').padStart(2,'0')}-${get('day').padStart(2,'0')}`,
    hora:  `${get('hour').padStart(2,'0')}:${get('minute').padStart(2,'0')}`,
  };
}

function fechaEnDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const fmt = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}-${get('month').padStart(2,'0')}-${get('day').padStart(2,'0')}`;
}

function labelTipo(ev) {
  if (ev.tipo === 'otro' && ev.tipoOtro) return ev.tipoOtro;
  const MAP = { examen:'Examen', parcial:'Parcial', tp:'TP', coloquio:'Coloquio',
                final:'Final', entrega:'Entrega', otro:'Actividad' };
  return MAP[ev.tipo] || 'Evento';
}

// ── Notificador ───────────────────────────────────────────────
function notificar(tag, titulo, cuerpo) {
  if (yaNotificados[tag]) return;
  yaNotificados[tag] = true;
  self.registration.showNotification(titulo, {
    body: cuerpo,
    icon:  '/miagenda/icon-192.png',
    badge: '/miagenda/icon-192.png',
    tag,
    data:  { url: '/miagenda/' },
    requireInteraction: true,
    vibrate: [200, 100, 200],
  });
}

// ── Chequeo principal — cada 60 seg ───────────────────────────
function chequear() {
  if (!eventos.length) return;
  const { fecha, hora } = ahoraAR();
  const en3 = fechaEnDias(3);
  const en1 = fechaEnDias(1);

  eventos.forEach(ev => {
    const tipo  = labelTipo(ev);
    const horaEv = ev.hora || '07:00';
    const mat   = ev.materia ? ' · ' + ev.materia : '';
    const hor   = ev.hora   ? ' a las ' + ev.hora  : '';

    // 3 días antes → 07:00
    if (ev.fecha === en3 && hora === '07:00')
      notificar(`ev_3d_${ev.id}_${fecha}`, `📅 En 3 días — ${tipo}`,
        `${ev.titulo}${mat} — el ${ev.fecha}${hor}`);

    // 1 día antes → hora del evento
    if (ev.fecha === en1 && hora === horaEv)
      notificar(`ev_1d_${ev.id}_${fecha}`, `⚠️ Mañana — ${tipo}`,
        `${ev.titulo}${mat}${hor}`);

    // Mismo día → 07:00
    if (ev.fecha === fecha && hora === '07:00')
      notificar(`ev_hoy_${ev.id}_${fecha}`, `🔴 Hoy — ${tipo}`,
        `${ev.titulo}${mat}${hor}`);
  });
}

// ── Mensajes desde la app ──────────────────────────────────────
self.addEventListener('message', e => {
  switch (e.data?.type) {
    case 'SET_EVENTOS':
      eventos = e.data.eventos || [];
      break;
    case 'RESET_NOTIFICADOS':
      yaNotificados = {};
      break;
  }
});

setInterval(chequear, 60000);

// ── Tap → abrir app ───────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const url = e.notification.data?.url || '/miagenda/';
      const existing = cs.find(c => c.url.includes('/miagenda/'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ── Periodic Background Sync ───────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'miagenda-check') e.waitUntil(chequear());
});
