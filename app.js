const KEY = 'fotbal-sintetic-v1';
const POS_ORDER = 'PFMA';
const ROLE = { P: 'Portar', F: 'Fundaș', M: 'Mijlocaș', A: 'Atacant' };
// Poziții exacte (opționale pe jucător) și categoria în care intră
const CODES = {
  GK: 'P', CB: 'F', LB: 'F', RB: 'F', LWB: 'F', RWB: 'F', SW: 'F',
  CM: 'M', CDM: 'M', DM: 'M', CAM: 'M', AM: 'M', LM: 'M', RM: 'M',
  ST: 'A', CF: 'A', LW: 'A', RW: 'A', FW: 'A',
};
const code = v => { const u = typeof v === 'string' ? v.trim().toUpperCase() : ''; return CODES[u] ? u : ''; };
// P/F/M/A, un cod (LW, GK…) sau cuvântul întreg („Fundaș”) → P/F/M/A
function posOf(v) {
  const u = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (CODES[u]) return CODES[u];
  if (u.length === 1 || u.length > 3) return POS_ORDER.includes(u[0]) ? u[0] : null;
  return null;
}
const badge = p => `<span class="pos pos-${p.pos}">${p.role || p.pos}</span>`;
const FORMATIONS = { 5: ['2-2', '1-2-1', '2-1-1', '3-1'], 6: ['2-2-1', '2-1-2', '3-1-1', '1-3-1'] };
const uid = () => Math.random().toString(36).slice(2, 10); // randomUUID cere HTTPS, pe telefon în LAN nu avem
const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const COLORS = ['#e63946', '#3a86ff', '#ffbe0b'];
// Cronometrul: acc = ms scurși înainte de ultimul start; pauseUntil = pauza se termină singură atunci;
// at = ultima apăsare (pentru cooldown). Toate în ora serverului.
const timer0 = (o = {}) => ({ startedAt: null, acc: 0, pauseUntil: null, at: null, ...o });
const WIN = 2;              // cine dă 2 goluri câștigă meciul pe loc
const COOLDOWN = 5000;      // după o apăsare, cronometrul nu mai poate fi atins 5 s (de nimeni)
const PAUSES = [15, 30, 45, 60];
const today = () => new Date().toISOString().slice(0, 10);

// O sesiune de sintetic = un meci (dată, oră, teren) cu jucătorii și echipele lui.
const blankSession = (meta = {}, size = 5) => normalize({
  id: uid(), name: 'Sintetic', date: today(), start: '', end: '', venue: '', ...meta,
  size, players: [], playing: ['t1', 't2'],
  teams: COLORS.map((color, i) => ({ id: `t${i + 1}`, name: `Echipa ${i + 1}`, color })),
});

// Echipa are `size` locuri fixe (slots[i] = id jucător sau null); locul i = poziția i din formație (0 = portar).
// custom[i] = poziție mutată de mână, {x, y} în jumătatea proprie (x: 0 = poarta proprie, 1 = mijlocul terenului).
const fit = (t, n) => { t.slots.length = n; t.slots = Array.from(t.slots, x => x ?? null); };

function normalize(s) {
  s.playing ||= ['t1', 't2'];
  // meciul curent: număr, golurile înregistrate și cronometrul (acc = ms scurși înainte de ultimul start)
  s.game ||= 1;
  s.goals ||= [];
  s.timer = timer0(s.timer);
  s.matchMin ||= 7;
  for (const t of s.teams) {
    t.slots ||= t.members || []; delete t.members; // migrare din prima versiune
    t.custom ||= {};
    fit(t, s.size);
  }
  return s;
}

// Toate sesiunile de pe dispozitiv: { current: id, sessions: { id: sesiune } }
const STORE = 'sintetic-v2';
let store = loadStore();
let state = store.sessions[store.current] || null;

function loadStore() {
  let st;
  try { st = JSON.parse(localStorage.getItem(STORE)); } catch {}
  if (!st) {
    st = { current: null, sessions: {} };
    let old; // datele din versiunea fără sesiuni devin o sesiune
    try { old = JSON.parse(localStorage.getItem(KEY)); } catch {}
    if (old) {
      const s = normalize({ id: uid(), name: 'Sesiune salvată', date: today(), start: '', end: '', venue: '', ...old });
      st.sessions[s.id] = s;
      st.current = s.id;
    }
  }
  Object.values(st.sessions).forEach(normalize);
  return st;
}
function persist() {
  state.updated = Date.now();
  store.sessions[state.id] = state;
  store.current = state.id;
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { alert('Nu am putut salva: spațiul din browser e plin.'); }
}
// push: trimite schimbarea în sesiunea live, dacă e cazul. Spectatorul poate schimba doar golurile și cronometrul.
const save = () => { if (forbidden()) return revert(); record('tu'); persist(); push(); };

const player = id => state.players.find(p => p.id === id);
const team = id => state.teams.find(t => t.id === id);
const teamOf = id => state.teams.find(t => t.slots.includes(id));
const formationOf = t => FORMATIONS[state.size].includes(t.formation) ? t.formation : FORMATIONS[state.size][0];

// "2-1-1" → portarul + liniile, de la apărare la atac
function spots(f) {
  const lines = f.split('-').map(Number), out = [{ x: .08, y: .5, role: 'P' }];
  lines.forEach((n, i) => {
    const x = .33 + i * (.49 / (lines.length - 1));
    const role = i === lines.length - 1 ? 'A' : i === 0 ? 'F' : 'M';
    for (let j = 0; j < n; j++) out.push({ x, y: (j + 1) / (n + 1), role });
  });
  return out;
}

// Orice schimbare trece pe aici: mutația + render, animate de View Transitions dacă browserul le are.
function commit(mutate) {
  const run = () => { mutate(); save(); render(); };
  if (!document.startViewTransition) return run();
  document.startViewTransition(run).ready.catch(() => {}); // „skipped” la click-uri rapide: inofensiv
}

/* ---------- render ---------- */
function avatar(p, cls = 'av') {
  if (p.photo) return `<img class="${cls}" src="${p.photo}" alt="" draggable="false">`;
  const ini = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `<span class="${cls}">${esc(ini)}</span>`;
}

// Pe teren apare doar prenumele; dacă doi au același prenume, se adaugă inițiala numelui.
function short(p) {
  const w = p.name.split(/\s+/), dup = state.players.some(q => q !== p && q.name.split(/\s+/)[0] === w[0]);
  return dup && w.length > 1 ? `${w[0]} ${w.at(-1)[0]}.` : w[0];
}

// role = postul locului din echipă (în carduri); lipsă în lista generală
function chip(p, slot = '', role = '') {
  return `<div class="chip" tabindex="0" data-id="${p.id}" ${slot !== '' ? `data-slot="${slot}"` : ''} style="view-transition-name:p-${p.id}">
    ${role ? `<span class="role${role !== p.pos ? ' off' : ''}" title="Joacă ${ROLE[role].toLowerCase()}">${role}</span>` : ''}${avatar(p)}<span class="name">${esc(p.name)}</span>${badge(p)}
  </div>`;
}

function half(t, side) {
  const sp = spots(formationOf(t));
  const tokens = t.slots.map((id, i) => {
    const { x, y } = t.custom[i] || sp[i];
    const at = `--x:${x};--y:${y}`;
    const p = id && player(id);
    return p
      ? `<div class="token" data-id="${p.id}" data-slot="${i}" title="${esc(p.name)} · ${ROLE[p.pos]}" style="${at};view-transition-name:k-${p.id}">
          <div class="disc">${avatar(p)}${badge(p)}</div><span class="tname">${esc(short(p))}</span></div>`
      : `<div class="token empty" data-slot="${i}" style="${at}">
          <div class="disc"></div><span class="tname">${ROLE[sp[i].role]}</span></div>`;
  }).join('');
  return `<div class="half" data-zone="${t.id}" data-pitch="${side}" style="--team:${t.color}">${tokens}</div>`;
}

const fmtDate = d => d ? new Date(d + 'T12:00').toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const when = s => [fmtDate(s.date), [s.start, s.end].filter(Boolean).join('–')].filter(Boolean).join(', ');

function render() {
  stale = false;
  $('#session').classList.toggle('live', !!state.live);
  $('#session').classList.toggle('offline', !!state.live && !online);
  document.body.classList.toggle('viewer', viewer());
  $('#s-name').textContent = state.name;
  $('#s-meta').textContent = [when(state), state.venue].filter(Boolean).join(' · ');
  document.title = `${state.name} · sintetic-pizdos`;
  document.querySelectorAll('#size button').forEach(b => b.classList.toggle('on', +b.dataset.size === state.size));

  // teren: playing[0] în stânga, playing[1] în dreapta, a treia echipă pe margine
  const [L, R] = state.playing.map(team);
  const wait = state.teams.find(t => !state.playing.includes(t.id));
  $('#halves').innerHTML = half(L, 'L') + half(R, 'R');
  const side = (t, cls) => `<span class="side ${cls}" style="--team:${t.color}"><i></i>${esc(t.name)}<small>${formationOf(t)}</small></span>`;
  const score = t => state.goals.filter(g => g.game === state.game && g.team === t.id).length;
  $('#matchup').innerHTML = side(L, 'l') + `<span class="vs score" title="Meciul ${state.game}">${score(L)} – ${score(R)}</span>` + side(R, 'r');
  $('#game-no').textContent = `Meci ${state.game}`;
  renderGoals();
  tick();
  $('#bench').innerHTML = `<i style="background:${wait.color}"></i>Pe margine: <b>${esc(wait.name)}</b>
    ${[L, R].map(t => `<button class="ghost-btn sm" data-swap="${t.id}">intră în locul ${esc(t.name)}</button>`).join('')}`;

  const free = state.players
    .filter(p => !teamOf(p.id))
    .sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || a.name.localeCompare(b.name, 'ro'));
  $('#pool-count').textContent = state.players.length ? `${free.length} / ${state.players.length}` : '';
  const GROUP = { P: 'Portari', F: 'Fundași', M: 'Mijlocași', A: 'Atacanți' };
  $('#pool').innerHTML = [...POS_ORDER].map(k => {
    const g = free.filter(p => p.pos === k);
    return g.length ? `<div class="group">${GROUP[k]} <span>${g.length}</span></div>` + g.map(p => chip(p)).join('') : '';
  }).join('') || `<div class="empty">${
    state.players.length ? 'Toți jucătorii sunt în echipe.' : 'Niciun jucător încă.<br>Apasă „+ Adaugă”.'
  }</div>`;

  $('#teams').innerHTML = state.teams.map(t => {
    const sp = spots(formationOf(t));
    const n = t.slots.filter(Boolean).length;
    const slots = t.slots.map((id, i) => id ? chip(player(id), i, sp[i].role) : `<div class="slot-empty" data-slot="${i}">Loc liber · ${ROLE[sp[i].role]}</div>`);
    return `<section class="panel team${n === state.size ? ' full' : ''}${t === wait ? ' waiting' : ''}" data-zone="${t.id}" style="--team:${t.color}">
      <div class="panel-head">
        <input type="color" class="swatch" value="${t.color}" data-team="${t.id}" aria-label="Culoarea echipei">
        <input class="team-name" value="${esc(t.name)}" maxlength="20" data-team="${t.id}" aria-label="Numele echipei">
        <span class="count">${t === wait ? 'pe margine · ' : ''}${n}/${state.size}</span>
      </div>
      <div class="forms">${FORMATIONS[state.size].map(f => `<button data-form="${f}" data-team="${t.id}" class="${f === formationOf(t) ? 'on' : ''}"
        title="${f === formationOf(t) ? 'Apasă din nou ca să resetezi pozițiile' : 'Formația ' + f}">${f}</button>`).join('')}</div>
      <div class="list">${slots.join('')}</div>
    </section>`;
  }).join('');

  const sp = sel && player(sel);
  if (!sp) sel = null;
  document.body.classList.toggle('selecting', !!sel);
  document.querySelectorAll(`[data-id="${sel}"]`).forEach(el => el.classList.add('sel'));
  $('#selbar').innerHTML = sp ? `${avatar(sp)}<span class="name">${esc(sp.name)}<small>Atinge un loc sau alt jucător</small></span>
    <button class="ghost-btn sm" data-act="edit">Editează</button>
    ${teamOf(sel) ? '<button class="ghost-btn sm" data-act="out">Scoate</button>' : ''}
    <button class="ghost-btn sm" data-act="close" aria-label="Renunță">✕</button>` : '';
}

/* ---------- drop logic ---------- */
// Mută jucătorul în locul `slot` al echipei `zone` (fără slot: primul loc liber). Dacă locul e ocupat,
// cei doi fac schimb (cel înlocuit ia locul vechi sau iese în listă). Întoarce false dacă nu e loc.
function move(id, zone, slot) {
  const src = teamOf(id), si = src?.slots.indexOf(id);
  const dst = team(zone);
  if (!dst) { if (src) src.slots[si] = null; return true; }
  if (slot == null) {
    if (dst === src) return true;
    slot = dst.slots.indexOf(null);
    if (slot < 0) return false;
  }
  const other = dst.slots[slot];
  if (src) src.slots[si] = other;
  dst.slots[slot] = id;
  return true;
}

/* ---------- drag & drop (Pointer Events: merge și cu mouse, și cu degetul) ---------- */
let drag = null;
const vtName = (el, name) => (el.style.viewTransitionName = name);

// Cu degetul, drag-ul pornește doar după o apăsare scurtă ținută; o mișcare înainte de asta e scroll.
const HOLD_MS = 250;

document.addEventListener('pointerdown', e => {
  const c = e.target.closest('.chip, .token[data-id]');
  if (!c || e.button !== 0 || viewer()) return;
  const touch = e.pointerType === 'touch';
  if (!touch) e.preventDefault();
  drag = { id: c.dataset.id, src: c, x0: e.clientX, y0: e.clientY, ghost: null, zone: null, over: null, armed: !touch };
  if (touch) drag.timer = setTimeout(() => {
    if (!drag || drag.src !== c) return;
    drag.armed = true;
    c.classList.add('lifted');
    navigator.vibrate?.(15);
  }, HOLD_MS);
});

// după ce jucătorul s-a „ridicat”, oprim scroll-ul cât timp e tras
document.addEventListener('touchmove', e => { if (drag?.armed) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (e.target.closest('.chip, .token')) e.preventDefault(); });

document.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.armed) { // încă nu e ținut destul: dacă degetul se mișcă, e scroll
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) { clearTimeout(drag.timer); drag = null; }
    return;
  }
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
    const r = drag.src.getBoundingClientRect();
    Object.assign(drag, { dx: drag.x0 - r.left, dy: drag.y0 - r.top, w: r.width, h: r.height });
    drag.ghost = drag.src.cloneNode(true);
    drag.ghost.classList.add('ghost');
    Object.assign(drag.ghost.style, { width: r.width + 'px', left: 0, top: 0 });
    const t = teamOf(drag.id);
    if (t) drag.ghost.style.setProperty('--team', t.color);
    document.body.append(drag.ghost);
    // animația de la drop pornește din fantomă, deci jucătorul nu mai are nume de tranziție în altă parte
    document.querySelectorAll(`[data-id="${drag.id}"]`).forEach(el => vtName(el, 'none'));
    drag.src.classList.add('dragging');
  }
  drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const zone = under?.closest('[data-zone]') || null;
  let over = under?.closest('[data-slot]') || null;
  if (over === drag.src || (over && !zone?.contains(over))) over = null;
  if (zone !== drag.zone) { drag.zone?.classList.remove('over'); zone?.classList.add('over'); drag.zone = zone; }
  if (over !== drag.over) { drag.over?.classList.remove('target'); over?.classList.add('target'); drag.over = over; }
});

// Pe ecran îngust terenul e vertical: echipa din stânga jos, cea din dreapta sus (aceeași regulă ca în CSS).
const VERTICAL = matchMedia('(max-width: 700px)');

// Punct pe ecran → {x, y} în jumătatea echipei (inversul calculului din CSS).
function pitchPoint(zoneEl, cx, cy) {
  const r = zoneEl.getBoundingClientRect(), fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
  const L = zoneEl.dataset.pitch === 'L';
  const [px, y] = VERTICAL.matches ? (L ? [1 - fy, fx] : [fy, 1 - fx]) : (L ? [fx, fy] : [1 - fx, fy]);
  return { x: clamp((px - .11) / .86, 0, 1), y: clamp(y, .08, .92) }; // inversul lui --px din CSS
}

// Mută jucătorul acolo unde a fost lăsat (drag) sau unde s-a atins (selecție). Doar mută starea, fără render.
function place(id, zoneEl, slotEl, cx, cy) {
  const zone = zoneEl?.dataset.zone, slot = slotEl ? +slotEl.dataset.slot : null;
  const ok = zone && move(id, zone, slot);
  if (!ok && zoneEl) zoneEl.classList.add('reject'), setTimeout(() => zoneEl.classList.remove('reject'), 400);
  // lăsat pe teren, dar nu pe un loc anume: jucătorul rămâne exact unde l-ai pus
  if (ok && zoneEl.dataset.pitch && slot == null) {
    const t = team(zone), i = t.slots.indexOf(id);
    if (i >= 0) t.custom[i] = pitchPoint(zoneEl, cx, cy);
  }
  return ok;
}

document.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null;
  clearTimeout(d.timer);
  d.src.classList.remove('lifted');
  if (!d.ghost) return tapPlayer(d.id);

  d.zone?.classList.remove('over');
  d.over?.classList.remove('target');
  const cx = e.clientX - d.dx + d.w / 2, cy = e.clientY - d.dy + d.h / 2; // centrul jetonului tras
  const ok = place(d.id, d.zone, d.over, cx, cy);
  if (ok) sel = null;

  // jetonul „zboară” din fantomă spre locul nou (sau înapoi): pe teren spre jeton, altfel spre rândul din listă
  vtName(d.ghost, (d.zone?.dataset.pitch && ok ? 'k-' : 'p-') + d.id);
  commit(() => d.ghost.remove());
});

// pe telefon browserul preia gestul ca scroll: renunțăm la drag
document.addEventListener('pointercancel', () => {
  if (!drag) return;
  clearTimeout(drag.timer);
  drag.ghost?.remove();
  drag.zone?.classList.remove('over');
  drag = null;
  render();
});

/* ---------- atingere: selectezi un jucător, apoi atingi unde să meargă ---------- */
let sel = null;

function tapPlayer(id) {
  if (!sel || sel === id) { sel = sel === id ? null : id; return render(); }
  const a = teamOf(sel), b = teamOf(id);
  if (!a && !b) { sel = id; return render(); } // amândoi în listă: schimbi selecția
  const from = sel;
  sel = null;
  // b în echipă: `from` îi ia locul; altfel cel din listă intră în locul lui `from`
  commit(() => b ? move(from, b.id, b.slots.indexOf(id)) : move(id, a.id, a.slots.indexOf(from)));
}

document.addEventListener('click', e => {
  if (!sel || e.target.closest('[data-id], #selbar, button, input, dialog')) return;
  const zoneEl = e.target.closest('[data-zone]');
  if (!zoneEl) return;
  const slotEl = e.target.closest('[data-slot]'), id = sel;
  if (place(id, zoneEl, slotEl, e.clientX, e.clientY)) { sel = null; commit(() => {}); }
});

$('#selbar').addEventListener('click', e => {
  const act = e.target.dataset.act, id = sel;
  if (!act) return;
  sel = null;
  if (act === 'edit') { render(); openEditor(id); }
  else if (act === 'out') commit(() => move(id, null));
  else render();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('chip')) openEditor(e.target.dataset.id);
  if (e.key === 'Escape' && sel && !dlg.open) { sel = null; render(); }
});
document.addEventListener('dblclick', e => {
  const c = e.target.closest('[data-id]');
  if (c && !viewer()) { sel = null; render(); openEditor(c.dataset.id); }
});

/* ---------- header, teren, echipe ---------- */
$('#size').addEventListener('click', e => {
  const n = +e.target.dataset.size;
  if (n && n !== state.size) commit(() => { state.size = n; state.teams.forEach(t => { fit(t, n); t.custom = {}; }); });
});
$('#bench').addEventListener('click', e => {
  const out = e.target.dataset.swap;
  if (!out) return;
  commit(() => swapIn(out));
});
$('#teams').addEventListener('click', e => {
  const f = e.target.dataset.form;
  if (f) commit(() => { const t = team(e.target.dataset.team); t.formation = f; t.custom = {}; });
});
$('#teams').addEventListener('change', e => {
  const t = team(e.target.dataset.team);
  if (!t || e.target.dataset.form) return;
  if (e.target.type === 'color') t.color = e.target.value;
  else t.name = e.target.value.trim() || t.name;
  save(); render();
});
$('#teams').addEventListener('input', e => { // culoarea se vede live cât tragi de selector
  if (e.target.type !== 'color') return;
  document.querySelectorAll(`[data-zone="${e.target.dataset.team}"]`).forEach(z => z.style.setProperty('--team', e.target.value));
});

/* ---------- import / export jucători ---------- */
// Fișier: {"format": "sintetic-jucatori", "version": 1, "players": [{"name": "Andrei Pop", "pos": "P", "photo": "data:image/jpeg;base64,..."}]}
// La import se acceptă și o listă simplă; "pos" poate fi P/F/M/A sau cuvântul întreg („Fundaș”); "photo" e opțional.
const FORMAT = 'sintetic-jucatori';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Fișierul vine din afară: păstrăm doar câmpurile cunoscute, cu valori sigure.
function cleanPlayer(p) {
  const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 24) : '';
  if (!name) return null;
  const role = code(p.role) || code(p.pos);
  const pos = posOf(p.pos) || (role && CODES[role]) || 'M';
  const out = { name, pos };
  if (role && CODES[role] === pos) out.role = role;
  if (typeof p.photo === 'string' && p.photo.length < 300000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.photo)) out.photo = p.photo;
  return out;
}

const exportPlayer = ({ id, name, pos, role, photo }) => ({ id, name, pos, ...(role && { role }), ...(photo && { photo }) });

$('#export').addEventListener('click', () => {
  if (!state.players.length) return toast('Nu ai jucători de exportat.');
  const data = { format: FORMAT, version: 1, players: state.players.map(exportPlayer) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `jucatori-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let list;
  try {
    const d = JSON.parse(await f.text());
    list = Array.isArray(d) ? d : d.players;
    if (!Array.isArray(list)) throw 0;
  } catch { return toast('Fișierul nu e o listă de jucători validă.'); }
  const clean = list.map(cleanPlayer).filter(Boolean);
  if (!clean.length) return toast('Nu am găsit niciun jucător în fișier.');

  // după nume: cine există deja e actualizat, ceilalți sunt adăugați; nimeni nu e șters
  const byName = n => state.players.find(q => q.name.toLowerCase() === n.toLowerCase());
  const updated = clean.filter(p => byName(p.name)).length;
  commit(() => {
    for (const p of clean) {
      const old = byName(p.name);
      if (old) Object.assign(old, p);
      else state.players.push({ id: uid(), photo: null, ...p });
    }
  });
  toast(`Import: ${clean.length - updated} adăugați, ${updated} actualizați.`);
});

/* ---------- editor ---------- */
const dlg = $('#editor');
let editing = null, photo = null;

function preview() {
  $('#photo-preview').outerHTML = avatar({ name: $('#name').value || '?', photo }, 'av big" id="photo-preview');
}

function openEditor(id) {
  editing = id ? player(id) : null;
  photo = editing?.photo || null;
  $('#editor-title').textContent = editing ? 'Editează jucător' : 'Jucător nou';
  $('#name').value = editing?.name || '';
  dlg.querySelector(`[name=pos][value=${editing?.pos || 'M'}]`).checked = true;
  $('#role').value = editing?.role || '';
  $('#delete').hidden = !editing;
  preview();
  dlg.showModal();
}

$('#add').addEventListener('click', () => openEditor(null));
$('#name').addEventListener('input', () => { if (!photo) preview(); });
$('#role').addEventListener('input', e => { // codul alege singur categoria (LW → Atacant)
  const c = code(e.target.value);
  if (c) dlg.querySelector(`[name=pos][value=${CODES[c]}]`).checked = true;
});
$('#photo').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try { photo = await shrink(f); preview(); } catch { alert('Nu am putut citi imaginea.'); }
});

// Decupează pătrat din centru și micșorează la 128px, ca să încapă multe poze în localStorage.
async function shrink(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(img.width, img.height), c = document.createElement('canvas');
  c.width = c.height = 128;
  c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
  return c.toDataURL('image/jpeg', 0.85);
}

dlg.addEventListener('close', () => {
  const action = dlg.returnValue;
  dlg.returnValue = '';
  const name = $('#name').value.trim();
  const pos = dlg.querySelector('[name=pos]:checked').value;
  const c = code($('#role').value), role = c && CODES[c] === pos ? c : undefined; // cod care nu se potrivește cu categoria: renunțăm la el

  if (action === 'ok' && name) commit(() => {
    if (editing) Object.assign(player(editing.id) || editing, { name, pos, photo, role }); // jucătorul poate fi reîncărcat din live între timp
    else state.players.push({ id: uid(), name, pos, photo, role });
  });
  const id = editing?.id;
  if (action === 'delete' && id && confirm(`Ștergi pe ${editing.name}?`)) commit(() => {
    move(id, null);
    state.players = state.players.filter(p => p.id !== id);
  });
});

/* ---------- meci: cronometru, goluri ---------- */
const mmss = ms => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hhmm = ts => new Date(ts).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
const dur = () => state.matchMin * 60000;
// după pauză cronometrul merge singur de la pauseUntil, fără să scrie nimeni nimic
const resumeAt = () => state.timer.pauseUntil && now() >= state.timer.pauseUntil ? state.timer.pauseUntil : null;
const elapsed = () => { const t = state.timer, from = t.startedAt ?? resumeAt(); return t.acc + (from ? now() - from : 0); };
const running = () => !!state && !!(state.timer.startedAt || resumeAt());
const paused = () => !!state && !running() && !!state.timer.pauseUntil;
const cooling = () => viewer() && !!state?.timer.at && now() - state.timer.at < COOLDOWN; // organizatorul nu are cooldown
const setTimer = o => (state.timer = timer0({ at: now(), ...o }));

// Echipa `out` iese, intră cea de pe margine, începe meciul următor (cronometrul așteaptă pornirea).
// since[echipă] = meciul de la care e pe teren, ca la egal să iasă cea venită mai demult.
function swapIn(out) {
  const wait = state.teams.find(t => !state.playing.includes(t.id));
  state.playing[state.playing.indexOf(out)] = wait.id;
  state.since = { ...state.since, [wait.id]: state.game + 1 };
  newGame();
  return wait;
}
const goalsOf = id => state.goals.filter(g => g.game === state.game && g.team === id).length;
// Timpul s-a terminat: pierde cine are mai puține goluri; la egal iese cine e pe teren de mai mult timp
// (la primul meci, când au intrat amândouă odată, iese prima echipă).
function endByTime() {
  const [a, b] = state.playing, ga = goalsOf(a), gb = goalsOf(b), since = state.since || {};
  const out = ga !== gb ? (ga < gb ? a : b) : (since[b] ?? 1) < (since[a] ?? 1) ? b : a;
  const win = out === a ? b : a, wn = team(win).name, on = team(out).name;
  const wait = swapIn(out);
  return ga !== gb ? `⏱ Timp! ${wn} câștigă ${Math.max(ga, gb)}–${Math.min(ga, gb)}. Intră ${wait.name} în locul ${on}.`
    : `⏱ Timp! Egal ${ga}–${gb}: iese ${on} (pe teren de mai mult timp), intră ${wait.name}.`;
}

function newGame() {
  state.game++;
  state.timer = timer0();
  ring(false);
}

function tick() {
  if (!state) return;
  const left = Math.max(0, dur() - elapsed());
  if (running() && left === 0) return finish();
  warnMinute(left);
  $('#clock').textContent = mmss(left);
  $('#timer').classList.toggle('on', running());
  $('#timer').classList.toggle('done', left === 0);
  $('#timer').classList.toggle('cool', cooling());
  $('#timer-reset').classList.toggle('cool', cooling());
  $('#pause-left').textContent = paused() ? `pauză ${mmss(state.timer.pauseUntil - now())}` : '';
  $('#timer').title = running() ? 'Pauză' : left === 0 ? 'Resetează cronometrul' : elapsed() ? 'Continuă' : 'Pornește cronometrul';
  // lacătul golului: ceilalți așteaptă, cel care îl ține vede cât mai are
  const other = lockedByOther(), btn = $('#goal-btn');
  btn.disabled = other || !can('goals');
  $('#timer').classList.toggle('locked', !can('timer'));
  if (orgDlg.open) $('#org-clock').textContent = mmss(left);
  btn.textContent = other ? `⏳ Gol în curs · ${mmss(goalLock.until - now())}` : '⚽ GOL';
  if (myLock && goalDlg.open) {
    if (now() >= myLock) { goalDlg.close(); toast('Au trecut 45 de secunde, golul nu s-a înregistrat.'); }
    else $('#goal-left').textContent = `Mai ai ${mmss(myLock - now())}`;
  }
}
setInterval(tick, 250);

// Sunetul se poate porni doar după o atingere: contextul audio se creează la Start.
let audio, lock, tones = [];
function tone(at, freq) {
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + at;
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(.35, t + .02);
  g.gain.exponentialRampToValueAtTime(.0001, t + .3);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + .35);
  tones.push(o);
}
// alarma: 3 reprize de câte 8 bipuri (~11 s); o atingere pe cronometru o oprește
// rounds = câte reprize de 8 bipuri: 3 la final, 1 la avertismentul de un minut
function ring(on, rounds = 3) {
  document.body.classList.toggle('alarm', on);
  tones.forEach(o => { try { o.stop(); } catch {} });
  tones = [];
  if (!on) return navigator.vibrate?.(0);
  navigator.vibrate?.([500, 200, 500, 200, 900, 1500, 500, 200, 500, 200, 900, 1500, 500, 200, 500, 200, 900].slice(0, rounds * 6 - 1));
  if (audio) for (let i = 0; i < rounds * 8; i++) tone(i * .4 + Math.floor(i / 8) * 1.2, i % 2 ? 660 : 880);
}
// Mai e un minut: o repriză de bipuri și clipire scurtă, o singură dată (doar când timpul trece de 1:00, nu la deschidere).
const WARN_MS = 60000;
let lastLeft = null;
function warnMinute(left) {
  const crossed = running() && lastLeft > WARN_MS && left <= WARN_MS && left > WARN_MS - 2000; // nu și la un salt peste prag
  lastLeft = left;
  if (!crossed) return;
  ring(true, 1);
  setTimeout(() => { if (running()) document.body.classList.remove('alarm'); }, 3500);
  toast('Mai e un minut!');
}
// ecranul rămâne aprins cât merge cronometrul (altfel telefonul se blochează și alarma întârzie)
async function keepAwake(on) {
  try {
    if (on && !lock && navigator.wakeLock) lock = await navigator.wakeLock.request('screen');
    if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}
document.addEventListener('visibilitychange', () => { lock = null; if (!document.hidden && running()) keepAwake(true); });

// Toate telefoanele ajung aici în aceeași secundă și calculează aceeași rotație, deci scrierile coincid.
// Spectatorul fără drept la goluri nu poate schimba echipele: oprește doar local și așteaptă rotația de la ceilalți.
function finish() {
  let msg = 'Timpul a expirat!';
  if (can('goals')) msg = endByTime() + ' Porniți cronometrul când sunteți gata.';
  else state.timer = timer0({ acc: dur() });
  if (can('goals')) save(); else persist();
  render();
  keepAwake(false);
  ring(true);
  toast(msg);
}

$('#timer').addEventListener('click', () => {
  audio ||= window.AudioContext && new AudioContext();
  audio?.resume();
  if (document.body.classList.contains('alarm')) return ring(false); // atingerea doar oprește alarma, nu pornește meciul următor
  if (!can('timer')) return toast('Organizatorul a blocat cronometrul.');
  if (cooling()) return toast('Așteaptă câteva secunde: cronometrul tocmai a fost atins.');
  if (running()) return pauseDlg.showModal();                              // pauza are mereu o durată
  if (elapsed() >= dur()) setTimer({ acc: 0 });                            // gata: înapoi la 7:00
  else setTimer({ startedAt: now(), acc: elapsed() });                     // start / continuă (și oprirea pauzei)
  keepAwake(running());
  save();
  tick();
});
const pauseDlg = $('#pause');
$('#pause-opts').innerHTML = PAUSES.map(n => `<button value="${n}" class="ghost-btn">${n} s</button>`).join('');
pauseDlg.addEventListener('close', () => {
  const n = +pauseDlg.returnValue;
  pauseDlg.returnValue = '';
  if (!PAUSES.includes(n) || !running() || cooling()) return;
  setTimer({ acc: elapsed(), pauseUntil: now() + n * 1000 });
  save(); tick();
});
$('#timer-reset').addEventListener('click', () => {
  if (!can('timer')) return toast('Organizatorul a blocat cronometrul.');
  if (cooling()) return toast('Așteaptă câteva secunde: cronometrul tocmai a fost atins.');
  if ((running() || paused()) && !confirm('Oprești și resetezi cronometrul?')) return;
  setTimer({});
  ring(false); keepAwake(false); save(); tick();
});
$('#new-game').addEventListener('click', () => {
  if (!confirm(`Începi meciul ${state.game + 1}? Scorul pornește de la 0–0.`)) return;
  keepAwake(false);
  commit(newGame);
});

const goalDlg = $('#goal');
$('#goal-btn').addEventListener('click', async () => {
  if (!can('goals')) return toast('Organizatorul a blocat golurile.');
  if (!(await takeLock())) return toast('Altcineva înregistrează deja un gol.');
  $('#goal-left').textContent = '';
  const cols = state.playing.map(team).map(t => {
    const ps = t.slots.filter(Boolean).map(player);
    return `<div class="goal-col" style="--team:${t.color}"><h3><i></i>${esc(t.name)}</h3>${ps.length
      ? ps.map(p => `<button type="button" class="scorer" data-scorer="${p.id}" data-team="${t.id}">${avatar(p)}<span>${esc(p.name)}</span></button>`).join('')
      : '<p class="hint">Niciun jucător în echipă.</p>'}</div>`;
  });
  $('#goal-cols').innerHTML = cols.join('');
  $('#goal-time').textContent = `${hhmm(Date.now())}${elapsed() ? ` · minutul ${mmss(elapsed())}` : ''} · meciul ${state.game}`;
  goalDlg.showModal();
});
goalDlg.addEventListener('close', releaseLock);
goalDlg.addEventListener('click', e => {
  const b = e.target.closest('[data-scorer]');
  if (!b) return;
  const p = player(b.dataset.scorer), t = team(b.dataset.team);
  goalDlg.close();
  commit(() => {
    state.goals.push({
      id: uid(), player: p.id, team: t.id, vs: [...state.playing], game: state.game,
      at: now(), t: elapsed() ? Math.round(elapsed()) : null,
    });
    // al doilea gol câștigă meciul: învinsa iese, intră echipa de pe margine, începe meciul următor.
    // Se calculează aici, pe starea de la momentul salvării (commit poate rula după un alt gol).
    const loser = team(state.playing.find(id => id !== t.id));
    if (!state.playing.includes(t.id) || goalsOf(t.id) < WIN) return toast(`⚽ Gol! ${p.name} (${t.name})`), navigator.vibrate?.(60);
    const score = `${goalsOf(t.id)}–${goalsOf(loser.id)}`, wait = swapIn(loser.id);
    toast(`🏆 ${t.name} câștigă ${score}! Intră ${wait.name} în locul ${loser.name}. Porniți cronometrul când sunteți gata.`);
    navigator.vibrate?.([80, 60, 80, 60, 200]);
    keepAwake(false);
  });
});

function renderGoals() {
  const box = $('#goals');
  box.hidden = !state.goals.length;
  if (!state.goals.length) return;
  const name = id => player(id)?.name || 'jucător șters';
  const tally = {};
  state.goals.forEach(g => (tally[g.player] = (tally[g.player] || 0) + 1));
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${esc(name(id))} ${n}`).join(' · ');
  const games = [...new Set(state.goals.map(g => g.game))].sort((a, b) => b - a);
  box.innerHTML = `<div class="panel-head"><h2>Goluri <span class="count">${state.goals.length}</span></h2><small class="top">Golgheteri: ${top}</small></div>
    <div class="list">${games.map(n => {
      const gs = state.goals.filter(g => g.game === n), [a, b] = gs[0].vs.map(team);
      const sc = t => gs.filter(g => g.team === t.id).length;
      return `<div class="game"><b>Meci ${n}</b> <span>${esc(a.name)} ${sc(a)} – ${sc(b)} ${esc(b.name)}</span></div>` +
        gs.slice().reverse().map(g => `<div class="goal-row" style="--team:${team(g.team).color}">
          <i></i><span class="gt">${hhmm(g.at)}${g.t != null ? `<small>min ${mmss(g.t)}</small>` : ''}</span>
          <span class="gn">${esc(name(g.player))}</span>
          <button class="ghost-btn sm danger-x" data-del-goal="${g.id}" aria-label="Șterge golul">✕</button></div>`).join('');
    }).join('')}</div>`;
}
$('#goals').addEventListener('click', e => {
  const id = e.target.closest('[data-del-goal]')?.dataset.delGoal;
  if (id && confirm('Ștergi golul?')) commit(() => { state.goals = state.goals.filter(g => g.id !== id); });
});

/* ---------- sesiuni ---------- */
// Fișier de sesiune: vezi README.md („Format sesiune”). Jucătorii din echipe se pot da prin id sau prin nume.
const SESSION_FORMAT = 'sintetic-sesiune';
const handles = {}; // id sesiune → fișierul din care a venit (doar Chrome desktop, cât e deschisă pagina)
const nsDlg = $('#new-session'), smDlg = $('#session-menu');
let nsMode = 'new'; // 'start' (nicio sesiune), 'new' (o păstrează pe cea curentă), 'replace'

const str = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const cleanMeta = d => ({
  name: str(d.name, 40) || 'Sintetic',
  date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : today(),
  start: /^\d{2}:\d{2}$/.test(d.start) ? d.start : '',
  end: /^\d{2}:\d{2}$/.test(d.end) ? d.end : '',
  venue: str(d.venue, 40),
  matchMin: Number.isInteger(+d.matchMin) && +d.matchMin >= 1 && +d.matchMin <= 60 ? +d.matchMin : 7,
});

const idx = (s, tid) => s.teams.findIndex(t => t.id === tid);
function sessionToFile(s) {
  return {
    format: SESSION_FORMAT, version: 1,
    name: s.name, date: s.date, start: s.start, end: s.end, venue: s.venue, size: s.size,
    players: s.players.map(exportPlayer),
    teams: s.teams.map(t => ({ name: t.name, color: t.color, formation: t.formation || FORMATIONS[s.size][0], slots: t.slots, custom: t.custom })),
    playing: s.playing.map(id => s.teams.findIndex(t => t.id === id)),
    matchMin: s.matchMin, game: s.game,
    goals: s.goals.map(g => ({ player: g.player, team: idx(s, g.team), vs: g.vs.map(v => idx(s, v)), game: g.game, at: g.at, t: g.t })),
  };
}

// Fișierul vine din afară: fiecare câmp e verificat, ce nu se potrivește se ignoră.
function sessionFromFile(d) {
  if (d?.format !== SESSION_FORMAT || !Array.isArray(d.players)) throw new Error('format');
  const s = blankSession(cleanMeta(d), d.size === 6 ? 6 : 5);
  const ref = new Map(); // id sau nume din fișier → id nou
  for (const raw of d.players) {
    const p = cleanPlayer(raw);
    if (!p) continue;
    p.id = uid();
    s.players.push(p);
    if (typeof raw.id === 'string') ref.set(raw.id, p.id);
    ref.set(p.name.toLowerCase(), p.id);
  }
  const used = new Set();
  (Array.isArray(d.teams) ? d.teams : []).slice(0, 3).forEach((t, i) => {
    const dst = s.teams[i];
    if (str(t?.name, 20)) dst.name = str(t.name, 20);
    if (/^#[0-9a-f]{6}$/i.test(t?.color)) dst.color = t.color;
    if (FORMATIONS[s.size].includes(t?.formation)) dst.formation = t.formation;
    (Array.isArray(t?.slots) ? t.slots : []).slice(0, s.size).forEach((r, j) => {
      const id = typeof r === 'string' && (ref.get(r) || ref.get(r.trim().toLowerCase()));
      if (id && !used.has(id)) { dst.slots[j] = id; used.add(id); }
    });
    for (const [k, v] of Object.entries(t?.custom && typeof t.custom === 'object' ? t.custom : {}))
      if (+k >= 0 && +k < s.size && Number.isFinite(v?.x) && Number.isFinite(v?.y)) dst.custom[+k] = { x: clamp(v.x, 0, 1), y: clamp(v.y, 0, 1) };
  });
  const pl = Array.isArray(d.playing) ? d.playing.map(i => s.teams[i]?.id) : [];
  if (pl.length === 2 && pl[0] && pl[1] && pl[0] !== pl[1]) s.playing = pl;
  const tid = i => s.teams[i]?.id;
  for (const g of Array.isArray(d.goals) ? d.goals : []) {
    const pid = typeof g?.player === 'string' && (ref.get(g.player) || ref.get(g.player.trim().toLowerCase()));
    const vs = Array.isArray(g.vs) ? g.vs.map(tid) : [];
    if (!pid || !tid(g.team) || !Number.isInteger(g.game) || g.game < 1 || !Number.isFinite(g.at)) continue;
    s.goals.push({ id: uid(), player: pid, team: tid(g.team), vs: vs.length === 2 && vs[0] && vs[1] ? vs : [...s.playing],
      game: g.game, at: g.at, t: Number.isFinite(g.t) && g.t >= 0 ? g.t : null });
  }
  if (Number.isInteger(d.game) && d.game >= 1) s.game = Math.max(d.game, ...s.goals.map(g => g.game));
  return s;
}

function useSession(s, replace) {
  if (replace && state) delete store.sessions[state.id];
  state = s;
  sel = null;
  persist();
  goLive();
  if (document.startViewTransition) document.startViewTransition(render).ready.catch(() => {});
  else render();
}

const slug = s => (s.name + '-' + s.date).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Deschide un fișier: pe Chrome desktop cu acces la el (ca să-l putem suprascrie), altfel prin input.
async function pickFile() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await showOpenFilePicker({ types: [{ description: 'Sesiune sintetic', accept: { 'application/json': ['.json'] } }] });
      return { file: await h.getFile(), handle: h };
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  return new Promise(res => {
    const i = $('#session-file');
    i.onchange = () => { const f = i.files[0]; i.value = ''; res(f && { file: f, handle: null }); };
    i.oncancel = () => res(null);
    i.click();
  });
}

async function importSession(replace) {
  const picked = await pickFile();
  if (!picked) return false;
  let s;
  try { s = sessionFromFile(JSON.parse(await picked.file.text())); }
  catch { toast('Fișierul nu e o sesiune de sintetic validă.'); return false; }
  s.fileName = picked.file.name;
  if (picked.handle) handles[s.id] = picked.handle;
  useSession(s, replace);
  toast(`Sesiune importată: ${s.name} (${s.players.length} jucători).`);
  return true;
}

async function writeFile(handle, text) {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// asNew: fișier nou (alegi unde, sau descărcare); altfel suprascrie fișierul din care a venit sesiunea
async function saveSession(asNew) {
  const text = JSON.stringify(sessionToFile(state), null, 2);
  const h = handles[state.id];
  try {
    if (!asNew && h) { await writeFile(h, text); return toast(`Salvat în ${h.name}.`); }
    if (asNew && window.showSaveFilePicker) {
      const nh = await showSaveFilePicker({ suggestedName: `${slug(state)}.json`, types: [{ description: 'Sesiune sintetic', accept: { 'application/json': ['.json'] } }] });
      await writeFile(nh, text);
      handles[state.id] = nh;
      state.fileName = nh.name;
    } else {
      // fără acces direct la fișiere (ex. telefon): descărcare cu același nume
      if (asNew || !state.fileName) state.fileName = `${slug(state)}.json`;
      download(state.fileName, text);
    }
    save();
    toast(`Salvat: ${state.fileName}.`);
  } catch (e) { if (e.name !== 'AbortError') toast('Nu am putut salva fișierul.'); }
}

function openNew(mode) {
  nsMode = mode;
  const f = nsDlg.querySelector('form');
  f.reset();
  f.elements.date.value = today();
  f.elements.name.value = `Sintetic ${fmtDate(today())}`;
  $('#ns-title').textContent = mode === 'replace' ? 'Înlocuiește sesiunea' : 'Sesiune nouă de sintetic';
  $('#ns-hint').textContent = mode === 'start' ? 'Nu ai nicio sesiune pe acest dispozitiv. Creează una sau importă un fișier.'
    : mode === 'replace' ? `„${state.name}” va fi ștearsă de pe dispozitiv.` : '';
  $('#ns-keep').hidden = mode === 'start';
  $('#ns-cancel').hidden = mode === 'start';
  nsDlg.showModal();
}

nsDlg.addEventListener('cancel', e => { if (nsMode === 'start') e.preventDefault(); }); // fără sesiune nu ai ce afișa
nsDlg.addEventListener('close', async () => {
  const act = nsDlg.returnValue, f = nsDlg.querySelector('form');
  nsDlg.returnValue = '';
  const replace = nsMode === 'replace';
  if (act === 'import') { if (!(await importSession(replace)) && nsMode === 'start') nsDlg.showModal(); return; }
  if (act !== 'ok') return;
  const s = blankSession(cleanMeta(Object.fromEntries(new FormData(f))), +f.elements.size.value);
  if (state && nsMode !== 'start' && f.elements.keep.checked) s.players = structuredClone(state.players);
  useSession(s, replace);
});

function fillMenu() {
  const f = smDlg.querySelector('form');
  for (const k of ['name', 'date', 'start', 'end', 'venue', 'matchMin']) f.elements[k].value = state[k] || '';
  const h = handles[state.id];
  $('#sm-file').textContent = h ? `Fișier: ${h.name}` : state.fileName ? `Fișier: ${state.fileName} (pe acest dispozitiv salvarea descarcă o copie nouă)` : 'Sesiunea nu a fost salvată încă într-un fișier.';
  const org = fb?.au.currentUser && !fb.au.currentUser.isAnonymous;
  $('#sm-live').innerHTML = (state.live
    ? `<p><b class="live-dot${online ? '' : ' off'}">LIVE</b> ${!online ? 'Fără semnal: modificările se trimit când revine.'
        : viewer() ? 'Ești spectator: poți înregistra goluri și porni cronometrul.' : 'Ești organizatorul. Colegii cu linkul pot înregistra goluri și porni cronometrul.'}</p>
       <div class="actions"><button type="button" class="primary" data-act="live-share">Trimite linkul</button>
       ${state.mine ? '<button type="button" class="ghost-btn danger" data-act="live-end">Încheie live pentru toți</button>'
         : '<button type="button" class="ghost-btn" data-act="live-off">Ieși din live</button>'}</div>`
    : `<button type="button" class="primary" data-act="live-on">📡 Pune online${org ? '' : ' (organizator)'}</button>
       <p class="hint">Primești un link: colegii văd live echipele și pot înregistra goluri și porni cronometrul.</p>`)
    + (org ? `<button type="button" class="ghost-btn sm" data-act="logout">Ieși din contul de organizator</button>` : '');
  f.querySelectorAll('[name=name], [name=date], [name=start], [name=end], [name=venue], [name=matchMin]').forEach(i => (i.disabled = viewer()));
  $('#sm-save').textContent = h ? `Salvează în ${h.name}` : 'Salvează în fișier';
  $('#sm-list').innerHTML = Object.values(store.sessions).sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(s => `
    <div class="sess${s.id === state.id ? ' on' : ''}">
      <span><b>${esc(s.name)}</b><small>${esc([when(s), s.venue, `${s.players.length} jucători`].filter(Boolean).join(' · '))}</small></span>
      ${s.id === state.id ? '<em>deschisă</em>' : `<button type="button" class="ghost-btn sm" data-open="${s.id}">Deschide</button>`}
      <button type="button" class="ghost-btn sm danger-x" data-del="${s.id}" aria-label="Șterge sesiunea">✕</button>
    </div>`).join('');
}
const openMenu = () => { fillMenu(); smDlg.showModal(); };

$('#session').addEventListener('click', openMenu);
smDlg.addEventListener('change', e => { // detaliile se salvează pe loc
  const k = e.target.name;
  if (!['name', 'date', 'start', 'end', 'venue', 'matchMin'].includes(k)) return;
  Object.assign(state, { [k]: cleanMeta({ ...state, [k]: e.target.value })[k] });
  save(); render();
});
smDlg.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.open) { smDlg.close(); return useSession(store.sessions[b.dataset.open]); }
  if (b.dataset.del) {
    const s = store.sessions[b.dataset.del];
    if (!confirm(`Ștergi sesiunea „${s.name}” de pe acest dispozitiv?`)) return;
    delete store.sessions[s.id];
    if (s.id === state.id) {
      smDlg.close();
      const next = Object.values(store.sessions).sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
      if (next) return useSession(next);
      state = null;
      localStorage.setItem(STORE, JSON.stringify({ current: null, sessions: {} }));
      return openNew('start');
    }
    save();
    return fillMenu();
  }
  const act = b.dataset.act;
  if (!act) return;
  if (act === 'save' || act === 'save-as') { await saveSession(act === 'save-as'); return fillMenu(); }
  if (act === 'live-on') {
    if (!(await ensureOrganizer())) return fillMenu();
    const sid = newSid();
    // întâi proprietarul: regulile lasă doar contul organizatorului să creeze sesiunea și apoi să-i scrie echipele
    try { await fb.set(fb.ref(fb.db, `live/${sid}/owner`), fb.me); }
    catch { toast('Contul acesta nu poate porni sesiuni live.'); return fillMenu(); }
    Object.assign(state, { live: sid, mine: true });
    persist();
    if (await connect(sid, true)) shareLink();
    else { state.live = null; persist(); }
    return fillMenu();
  }
  if (act === 'logout') { await fb.auth.signOut(fb.au); fb.me = null; toast('Ai ieșit din contul de organizator.'); return fillMenu(); }
  if (act === 'live-share') return shareLink();
  if (act === 'live-end') {
    if (!confirm('Închei sesiunea live? Fiecare rămâne cu copia locală, iar sesiunea se șterge de pe server.')) return;
    const sid = state.live;
    // întâi ne dezabonăm, ca ștergerea să nu apară aici ca „încheiată de organizator”
    Object.assign(state, { live: null, mine: false }); persist(); goLive(); render();
    try { await fb.remove(fb.ref(fb.db, `live/${sid}`)); toast('Sesiunea live s-a încheiat. Acum e locală.'); }
    catch { toast('Nu am putut șterge sesiunea de pe server.'); }
    return fillMenu();
  }
  if (act === 'live-off') {
    if (!confirm('Sesiunea rămâne pe acest dispozitiv, dar nu se mai sincronizează. Continui?')) return;
    state.live = null; persist(); goLive(); render();
    return fillMenu();
  }
  smDlg.close();
  if (act === 'import') importSession(false);
  if (act === 'new') openNew('new');
  if (act === 'replace') openNew('replace');
  if (act === 'clear' && confirm('Toți jucătorii revin în listă. Continui?')) commit(() => state.teams.forEach(t => { t.slots.fill(null); t.custom = {}; }));
});

/* ---------- versiune nouă pe server ---------- */
// GitHub Pages lasă browserul să țină fișierele ~10 min. Comparăm copia din cache cu cea de pe server
// și, dacă diferă, oferim actualizarea: cache: 'reload' rescrie cache-ul, apoi reîncărcăm pagina.
const FILES = ['./', 'style.css', 'app.js'];
async function checkUpdate() {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  try {
    const changed = await Promise.all(FILES.map(async f => {
      const [old, now] = await Promise.all([
        fetch(f, { cache: 'force-cache' }).then(r => r.text()),
        fetch(f, { cache: 'no-store' }).then(r => r.text()),
      ]);
      return old !== now;
    }));
    if (changed.some(Boolean)) $('#update').hidden = false;
  } catch {} // fără internet: rămâne versiunea curentă
}
$('#update').addEventListener('click', async () => {
  await Promise.all(FILES.map(f => fetch(f, { cache: 'reload' }).catch(() => {})));
  location.reload();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
checkUpdate();

/* ---------- sesiune live (Firebase Realtime Database) ---------- */
// Pe server, sub live/<sid>/d, fiecare bucată e un text JSON: câmpurile simple direct, iar jucătorii, golurile
// și echipele câte unul pe cale (players/<id>, goals/<id>, teams/t0), ca două telefoane să poată modifica
// lucruri diferite în același timp. Se trimite doar ce s-a schimbat față de ultima versiune știută (`synced`).
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
const FB_CONFIG = {
  apiKey: 'AIzaSyDCospd_YB6tC24GdRMh58hOq8jCAsRVBo', authDomain: 'sintetic-pizdos.firebaseapp.com',
  databaseURL: 'https://sintetic-pizdos-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'sintetic-pizdos', appId: '1:448897182271:web:d4cf811e0171a52f3aa68a',
};
const LOCAL = ['id', 'updated', 'fileName', 'live', 'mine', 'history']; // mine = sesiunea live e pornită de mine
const LOCK_MS = 45000;
let fb = null, subs = [], synced = {}, ready = false, online = false, offset = 0, stale = false;
let perm = { goals: true, timer: true }; // ce pot face spectatorii (le alege organizatorul)
const can = k => !viewer() || perm[k] !== false;
let goalLock = null, myLock = 0; // lacătul de pe server; până când îl țin eu (ora serverului)
const now = () => Date.now() + offset; // ora serverului, ca cronometrul să arate la fel pe toate telefoanele
const viewer = () => !!state?.live && !state.mine;
// Spectatorul a schimbat ceva în afară de goluri, cronometru și rotație? Serverul ar refuza, deci revenim la ce e pe server.
function forbidden() {
  if (!viewer() || !ready) return false;
  const next = flat(state);
  return Object.keys({ ...next, ...synced }).some(k => {
    if (next[k] === synced[k]) return false;
    if (k.startsWith('goals/')) return !can('goals') || synced[k] !== undefined; // spectatorul doar adaugă goluri
    if (['game', 'playing', 'since'].includes(k)) return !can('goals');                   // rotația vine din goluri
    return k !== 'timer' || !can('timer');
  });
}
function revert() {
  Object.assign(state, fromLive(synced));
  normalize(state);
  toast('Doar organizatorul poate face asta.');
}
const lockedByOther = () => !!(state?.live && goalLock && goalLock.by !== fb?.me && goalLock.until > now());

// chei sortate: același conținut dă același text pe orice telefon, deci diferența arată doar schimbările reale
const json = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x);
function flat(st) {
  const o = {};
  for (const [k, v] of Object.entries(st)) {
    if (LOCAL.includes(k)) continue;
    if (k === 'players' || k === 'goals') v.forEach(x => (o[`${k}/${x.id}`] = json(x)));
    else if (k === 'teams') v.forEach((t, i) => (o[`teams/t${i}`] = json(t)));
    else o[k] = json(v);
  }
  return o;
}
const flatVal = v => Object.fromEntries(Object.entries(v).flatMap(([k, x]) =>
  typeof x === 'string' ? [[k, x]] : Object.entries(x).map(([c, y]) => [`${k}/${c}`, y])));

// Oricine are linkul poate scrie: datele de pe server trec prin aceleași verificări ca un fișier importat.
const ID = /^[a-z0-9]{1,16}$/;
function fromLive(f) {
  const raw = { players: [], goals: [], teams: [] };
  for (const [path, v] of Object.entries(f).sort()) {
    const [k, c] = path.split('/');
    let x; try { x = JSON.parse(v); } catch { continue; }
    if (c && raw[k]) raw[k].push(x); else if (!c) raw[k] = x;
  }
  const size = raw.size === 6 ? 6 : 5, ok = id => typeof id === 'string' && ID.test(id);
  const players = raw.players.filter(p => ok(p?.id)).map(p => ({ photo: null, ...cleanPlayer(p), id: p.id })).filter(p => p.name);
  const has = new Set(players.map(p => p.id));
  const teams = COLORS.map((color, i) => {
    const t = raw.teams[i] || {}, custom = {};
    for (const [k, v] of Object.entries(t.custom && typeof t.custom === 'object' ? t.custom : {}))
      if (+k >= 0 && +k < size && Number.isFinite(v?.x) && Number.isFinite(v?.y)) custom[+k] = { x: clamp(v.x, 0, 1), y: clamp(v.y, 0, 1) };
    return {
      id: `t${i + 1}`, name: str(t.name, 20) || `Echipa ${i + 1}`, color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : color,
      formation: FORMATIONS[size].includes(t.formation) ? t.formation : undefined,
      slots: Array.from({ length: size }, (_, j) => has.has(t.slots?.[j]) ? t.slots[j] : null), custom,
    };
  });
  const tid = new Set(teams.map(t => t.id)), num = v => Number.isFinite(v) ? v : null;
  const playing = Array.isArray(raw.playing) && raw.playing.length === 2 && raw.playing.every(x => tid.has(x)) && raw.playing[0] !== raw.playing[1] ? raw.playing : ['t1', 't2'];
  const goals = raw.goals.filter(g => ok(g?.id) && ok(g.player) && tid.has(g.team) && Number.isInteger(g.game) && g.game >= 1 && Number.isFinite(g.at))
    .map(g => ({ id: g.id, player: g.player, team: g.team, game: g.game, at: g.at, t: num(g.t),
      vs: Array.isArray(g.vs) && g.vs.length === 2 && g.vs.every(x => tid.has(x)) ? g.vs : [...playing] }))
    .sort((a, b) => a.at - b.at);
  const tm = raw.timer || {};
  return {
    ...cleanMeta(raw), size, players, teams, playing, goals,
    game: Number.isInteger(raw.game) && raw.game >= 1 ? raw.game : 1,
    since: Object.fromEntries(Object.entries(raw.since && typeof raw.since === 'object' ? raw.since : {}).filter(([k, v]) => tid.has(k) && Number.isInteger(v) && v >= 1)),
    timer: timer0({ startedAt: num(tm.startedAt), acc: Math.max(0, num(tm.acc) || 0), pauseUntil: num(tm.pauseUntil), at: num(tm.at) }),
  };
}

function push() {
  if (!fb || !state?.live || !ready) return;
  const next = flat(state), upd = {};
  for (const k in next) if (next[k] !== synced[k]) upd[k] = next[k];
  for (const k in synced) if (!(k in next)) upd[k] = null;
  synced = next;
  // fără semnal, SDK-ul ține scrierile și le trimite când revine conexiunea
  if (Object.keys(upd).length) fb.update(fb.ref(fb.db, `live/${state.live}/d`), upd).catch(() => toast('Serverul a refuzat modificarea.'));
}

function pull(sid, val) {
  if (state?.live !== sid) return;
  if (!val) { // nimic pe server: linkul e greșit sau organizatorul a încheiat live-ul
    toast(ready ? 'Sesiunea live s-a încheiat sau are alt link. A rămas pe telefonul tău.' : 'Sesiunea live nu mai există.');
    Object.assign(state, { live: null, mine: false }); persist(); goLive(); render();
    return;
  }
  const remote = flatVal(val), first = !ready;
  ready = true;
  const same = Object.keys(remote).length === Object.keys(synced).length && Object.keys(remote).every(k => remote[k] === synced[k]);
  if (same) return; // ecoul propriei scrieri
  synced = remote;
  const prevGame = state.game, wasRunning = running();
  Object.assign(state, fromLive(remote));
  normalize(state);
  // meciul s-a încheiat pe alt telefon (timp sau 2 goluri) cât mergea cronometrul aici: sună și aici
  if (!first && state.game > prevGame && wasRunning) {
    ring(true); keepAwake(false);
    toast(`Meciul ${prevGame} s-a terminat. Pe teren: ${state.playing.map(id => team(id).name).join(' vs ')}. Porniți cronometrul când sunteți gata.`);
  }
  if (!first) record('alt telefon');
  persist();
  if (first) toast(`Conectat la „${state.name}”.`);
  // cât tragi un jucător sau scrii într-un câmp, randarea așteaptă (altfel ți-ar fugi elementul de sub deget)
  if (drag || document.activeElement?.matches('input')) stale = true; else render();
}
['focusout', 'pointerup'].forEach(ev => document.addEventListener(ev, () => { if (stale && !drag) render(); }));

// Firebase se încarcă doar pentru sesiunile live. fresh = sesiunea abia a fost pusă online (serverul e gol).
async function loadFb() {
  if (fb) return true;
  try {
    const [app, auth, db] = await Promise.all(['app', 'auth', 'database'].map(m => import(`${FB}${m}.js`)));
    const a = app.initializeApp(FB_CONFIG), au = auth.getAuth(a);
    await au.authStateReady(); // organizatorul rămâne logat pe dispozitiv; ceilalți primesc un cont anonim
    if (!au.currentUser) await auth.signInAnonymously(au);
    fb = { ...db, db: db.getDatabase(a), auth, au, me: au.currentUser.uid };
    fb.onValue(fb.ref(fb.db, '.info/serverTimeOffset'), s => (offset = s.val() || 0));
    fb.onValue(fb.ref(fb.db, '.info/connected'), s => { online = !!s.val(); if (state) render(); if (smDlg.open) fillMenu(); });
    return true;
  } catch { toast('Nu m-am putut conecta la serverul live.'); return false; }
}

// Doar organizatorul pornește sesiuni live: username + parolă (contul e făcut în consola Firebase).
// Username-ul devine o adresă internă, care nu trebuie să existe.
const loginDlg = $('#login');
async function ensureOrganizer() {
  if (!(await loadFb())) return false;
  if (!fb.au.currentUser?.isAnonymous && fb.au.currentUser) return true;
  const f = loginDlg.querySelector('form');
  f.reset();
  loginDlg.showModal();
  await new Promise(r => loginDlg.addEventListener('close', r, { once: true }));
  if (loginDlg.returnValue !== 'ok') return false;
  const u = f.elements.user.value.trim().toLowerCase(), email = u.includes('@') ? u : `${u}@sintetic-pizdos.app`;
  try {
    const { user } = await fb.auth.signInWithEmailAndPassword(fb.au, email, f.elements.pass.value);
    fb.me = user.uid;
    return true;
  } catch { toast('Username sau parolă greșite.'); return false; }
  finally { f.elements.pass.value = ''; }
}

async function connect(sid, fresh = false) {
  if (!(await loadFb())) return false;
  if (!fb.au.currentUser) { await fb.auth.signInAnonymously(fb.au); fb.me = fb.au.currentUser.uid; } // după „Ieși din cont”
  if (state?.live !== sid) return false;
  subs.forEach(u => u());
  synced = {}; ready = fresh; goalLock = null;
  if (fresh) push(); // înainte de abonare, ca primul răspuns să conțină deja sesiunea
  subs = [
    fb.onValue(fb.ref(fb.db, `live/${sid}/d`), s => pull(sid, s.val())),
    fb.onValue(fb.ref(fb.db, `live/${sid}/lock`), s => { goalLock = s.val(); tick(); }),
    fb.onValue(fb.ref(fb.db, `live/${sid}/perm`), s => { perm = { goals: true, timer: true, ...s.val() }; render(); if (orgDlg.open) fillOrg(); }),
    fb.onValue(fb.ref(fb.db, `live/${sid}/owner`), s => { // cine e organizatorul o spune serverul
      if (state?.live !== sid || !s.exists()) return;
      const mine = s.val() === fb.me;
      if (mine !== !!state.mine) { state.mine = mine; persist(); render(); }
    }),
  ];
  return true;
}
// La schimbarea sesiunii: ne abonăm la cea nouă, dacă e live, sau ne dezabonăm.
function goLive() {
  if (state?.live) return connect(state.live);
  subs.forEach(u => u());
  subs = []; ready = false; goalLock = null; perm = { goals: true, timer: true };
}

const newSid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(36).padStart(2, '0')).join('');
const liveUrl = () => `${location.origin}${location.pathname}#live=${state.live}`;
function shareLink() {
  const url = liveUrl();
  if (navigator.share) return navigator.share({ title: state.name, url }).catch(() => {});
  navigator.clipboard?.writeText(url).then(() => toast('Link copiat.'), () => prompt('Linkul sesiunii:', url)) ?? prompt('Linkul sesiunii:', url);
}

// Lacătul golului: un singur telefon înregistrează un gol odată, cel mult 45 s. Tranzacția îl dă unuia singur.
async function takeLock() {
  if (!state.live || !fb) return true;
  if (lockedByOther()) return false;
  if (!online) return true; // fără semnal nu putem întreba serverul: golul se înregistrează local
  const until = now() + LOCK_MS;
  try {
    const r = await fb.runTransaction(fb.ref(fb.db, `live/${state.live}/lock`),
      cur => cur && cur.by !== fb.me && cur.until > now() ? undefined : { by: fb.me, until });
    if (!r.committed) return false;
  } catch { return true; }
  myLock = until;
  return true;
}
function releaseLock() {
  if (!myLock || !fb || !state.live) return;
  myLock = 0;
  fb.runTransaction(fb.ref(fb.db, `live/${state.live}/lock`), cur => cur?.by === fb.me ? null : undefined).catch(() => {});
}

/* ---------- panoul organizatorului ---------- */
// Istoricul stă doar pe dispozitivul organizatorului (sau local): fiecare schimbare de scor, meci, echipe sau cronometru
// e o poză a meciului. „Readu aici” pune totul înapoi cum era atunci, deci repară orice abuz dintr-o atingere.
const HIST = 25;
const core = x => json({ goals: x.goals, game: x.game, playing: x.playing, slots: x.slots, timer: x.timer });
let nextLabel = null;
function describe(a, b) {
  if (!a) return 'început';
  const out = [], name = id => player(id)?.name || 'jucător', had = new Set(a.goals.map(g => g.id)), has = new Set(b.goals.map(g => g.id));
  b.goals.filter(g => !had.has(g.id)).forEach(g => out.push(`⚽ ${name(g.player)}`));
  a.goals.filter(g => !has.has(g.id)).forEach(g => out.push(`✕ gol ${name(g.player)}`));
  if (b.game !== a.game) out.push(`meciul ${b.game}`);
  const inn = b.playing.find(x => !a.playing.includes(x));
  if (inn) out.push(`intră ${team(inn)?.name}`);
  if (json(b.slots) !== json(a.slots)) out.push('echipe schimbate');
  if (b.game === a.game && json(b.timer) !== json(a.timer)) {
    const t = b.timer;
    out.push(t.pauseUntil ? `⏸ pauză ${Math.round((t.pauseUntil - (t.at || t.pauseUntil)) / 1000)} s` : t.startedAt ? '▶ cronometru pornit'
      : !t.acc ? '↺ cronometru resetat' : t.acc >= dur() ? 'timp expirat' : '⏱ cronometru setat');
  }
  return out.join(' · ') || 'modificare';
}
function record(by) {
  if (viewer()) return;
  const h = (state.history ||= []), last = h.at(-1);
  const snap = JSON.parse(json({ goals: state.goals, game: state.game, playing: state.playing, slots: state.teams.map(t => t.slots), timer: state.timer }));
  if (last && core(last) === core(snap)) return;
  h.push({ ...snap, at: now(), by, label: nextLabel || describe(last, snap), el: elapsed(), run: running() });
  nextLabel = null;
  if (h.length > HIST) h.splice(0, h.length - HIST);
}

const orgDlg = $('#org');
function fillOrg() {
  const live = !!(state.live && state.mine);
  $('#org-live').hidden = !live;
  orgDlg.querySelectorAll('[data-perm]').forEach(i => (i.checked = perm[i.dataset.perm] !== false));
  $('#org-clock').textContent = mmss(Math.max(0, dur() - elapsed()));
  const hs = (state.history || []).map((h, i) => [h, i]).reverse();
  $('#org-hist').innerHTML = hs.length ? hs.map(([h, i], n) => {
    const [a, b] = h.playing.map(team), sc = t => h.goals.filter(g => g.game === h.game && g.team === t?.id).length;
    return `<div class="hrow${n ? '' : ' now'}"><span class="ht">${hhmm(h.at)}</span>
      <span class="hl">${esc(h.label)}<small>${esc(h.by)} · meci ${h.game}: ${esc(a?.name || '')} ${sc(a)}–${sc(b)} ${esc(b?.name || '')} · ${mmss(Math.max(0, dur() - h.el))}</small></span>
      ${n ? `<button type="button" class="ghost-btn sm" data-restore="${i}">Readu aici</button>` : '<em>acum</em>'}</div>`;
  }).join('') : '<p class="hint">Nicio schimbare încă.</p>';
}
$('#org-btn').addEventListener('click', () => { fillOrg(); orgDlg.showModal(); });

// Timpul rămas, mutat cu ±; cronometrul își păstrează starea (pornit, pauză, oprit).
function adjust(sec) {
  const e = clamp(elapsed() - sec * 1000, 0, dur());
  nextLabel = `⏱ cronometru setat la ${mmss(dur() - e)}`;
  setTimer({ acc: e, startedAt: running() ? now() : null, pauseUntil: paused() ? state.timer.pauseUntil : null });
  ring(false);
  save(); tick(); fillOrg();
}
function restore(h) { // fără commit(): animația s-ar desena peste panoul deschis
  nextLabel = `↩ readus la ${hhmm(h.at)}`;
  Object.assign(state, JSON.parse(json({ goals: h.goals, game: h.game, playing: h.playing })));
  h.slots.forEach((sl, i) => { if (state.teams[i]) state.teams[i].slots = [...sl]; });
  state.timer = timer0({ acc: h.el, startedAt: h.run ? now() : null, at: now() });
  normalize(state);
  ring(false);
  save(); render();
}
async function newLink() {
  if (!confirm('Linkul vechi nu va mai merge. Îl trimiți din nou doar cui vrei. Continui?')) return;
  const old = state.live, sid = newSid(), keep = { ...perm };
  try { await fb.set(fb.ref(fb.db, `live/${sid}/owner`), fb.me); }
  catch { return toast('Nu am putut crea linkul nou.'); }
  state.live = sid;
  persist();
  if (!(await connect(sid, true))) { state.live = old; persist(); goLive(); return; }
  fb.set(fb.ref(fb.db, `live/${sid}/perm`), keep).catch(() => {});
  fb.remove(fb.ref(fb.db, `live/${old}`)).catch(() => {});
  fillOrg();
  shareLink();
}
orgDlg.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.adj) return adjust(+b.dataset.adj);
  if (b.dataset.restore) {
    const h = state.history[+b.dataset.restore];
    if (h && confirm(`Readuci meciul cum era la ${hhmm(h.at)}?`)) { restore(h); fillOrg(); }
  }
  if (b.dataset.act === 'new-link') newLink();
});
orgDlg.addEventListener('change', e => {
  const k = e.target.dataset.perm;
  if (k && state.live && state.mine) fb.set(fb.ref(fb.db, `live/${state.live}/perm/${k}`), e.target.checked).catch(() => toast('Nu am putut salva.'));
});

// Linkul #live=<sid>: deschide sesiunea (sau o creează pe dispozitiv), apoi o umple de pe server.
addEventListener('hashchange', () => { if (location.hash.includes('live=')) location.reload(); }); // linkul deschis peste aplicație
const joinId = location.hash.match(/live=([a-z0-9]{20,})/)?.[1];
if (joinId) {
  history.replaceState(null, '', location.pathname);
  let s = Object.values(store.sessions).find(x => x.live === joinId);
  if (!s) { s = blankSession({ name: 'Sesiune live' }); s.live = joinId; }
  useSession(s);
} else if (state) { render(); goLive(); } else openNew('start');
