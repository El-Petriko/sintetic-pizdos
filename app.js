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
function save() {
  state.updated = Date.now();
  store.sessions[state.id] = state;
  store.current = state.id;
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { alert('Nu am putut salva: spațiul din browser e plin.'); }
}

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
  $('#s-name').textContent = state.name;
  $('#s-meta').textContent = [when(state), state.venue].filter(Boolean).join(' · ');
  document.title = `${state.name} · Sintetic`;
  document.querySelectorAll('#size button').forEach(b => b.classList.toggle('on', +b.dataset.size === state.size));

  // teren: playing[0] în stânga, playing[1] în dreapta, a treia echipă pe margine
  const [L, R] = state.playing.map(team);
  const wait = state.teams.find(t => !state.playing.includes(t.id));
  $('#halves').innerHTML = half(L, 'L') + half(R, 'R');
  const side = (t, cls) => `<span class="side ${cls}" style="--team:${t.color}"><i></i>${esc(t.name)}<small>${formationOf(t)}</small></span>`;
  $('#matchup').innerHTML = side(L, 'l') + '<span class="vs">VS</span>' + side(R, 'r');
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
  if (!c || e.button !== 0) return;
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
  if (c) { sel = null; render(); openEditor(c.dataset.id); }
});

/* ---------- header, teren, echipe ---------- */
$('#size').addEventListener('click', e => {
  const n = +e.target.dataset.size;
  if (n && n !== state.size) commit(() => { state.size = n; state.teams.forEach(t => { fit(t, n); t.custom = {}; }); });
});
$('#bench').addEventListener('click', e => {
  const out = e.target.dataset.swap;
  if (!out) return;
  const wait = state.teams.find(t => !state.playing.includes(t.id));
  commit(() => { state.playing[state.playing.indexOf(out)] = wait.id; });
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
    if (editing) Object.assign(editing, { name, pos, photo, role });
    else state.players.push({ id: uid(), name, pos, photo, role });
  });
  const id = editing?.id;
  if (action === 'delete' && id && confirm(`Ștergi pe ${editing.name}?`)) commit(() => {
    move(id, null);
    state.players = state.players.filter(p => p.id !== id);
  });
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
});

function sessionToFile(s) {
  return {
    format: SESSION_FORMAT, version: 1,
    name: s.name, date: s.date, start: s.start, end: s.end, venue: s.venue, size: s.size,
    players: s.players.map(exportPlayer),
    teams: s.teams.map(t => ({ name: t.name, color: t.color, formation: t.formation || FORMATIONS[s.size][0], slots: t.slots, custom: t.custom })),
    playing: s.playing.map(id => s.teams.findIndex(t => t.id === id)),
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
  return s;
}

function useSession(s, replace) {
  if (replace && state) delete store.sessions[state.id];
  state = s;
  sel = null;
  save();
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
  for (const k of ['name', 'date', 'start', 'end', 'venue']) f.elements[k].value = state[k] || '';
  const h = handles[state.id];
  $('#sm-file').textContent = h ? `Fișier: ${h.name}` : state.fileName ? `Fișier: ${state.fileName} (pe acest dispozitiv salvarea descarcă o copie nouă)` : 'Sesiunea nu a fost salvată încă într-un fișier.';
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
  if (!['name', 'date', 'start', 'end', 'venue'].includes(k)) return;
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

if (state) render(); else openNew('start');
