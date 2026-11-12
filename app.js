const KEY = 'fotbal-sintetic-v1';
const POS_ORDER = 'PFMA';
const ROLE = { P: 'Portar', F: 'Fundaș', M: 'Mijlocaș', A: 'Atacant' };
const FORMATIONS = { 5: ['2-2', '1-2-1', '2-1-1', '3-1'], 6: ['2-2-1', '2-1-2', '3-1-1', '1-3-1'] };
const uid = () => Math.random().toString(36).slice(2, 10); // randomUUID cere HTTPS, pe telefon în LAN nu avem
const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const defaultState = () => ({
  size: 5,
  players: [],
  playing: ['t1', 't2'],
  teams: [
    { id: 't1', name: 'Echipa 1', color: '#e63946' },
    { id: 't2', name: 'Echipa 2', color: '#3a86ff' },
    { id: 't3', name: 'Echipa 3', color: '#ffbe0b' },
  ],
});

// Echipa are `size` locuri fixe (slots[i] = id jucător sau null); locul i = poziția i din formație (0 = portar).
// custom[i] = poziție mutată de mână, {x, y} în jumătatea proprie (x: 0 = poarta proprie, 1 = mijlocul terenului).
const fit = (t, n) => { t.slots.length = n; t.slots = Array.from(t.slots, x => x ?? null); };

let state = load();
function load() {
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  s ||= defaultState();
  s.playing ||= ['t1', 't2'];
  for (const t of s.teams) {
    t.slots ||= t.members || []; delete t.members; // migrare din prima versiune
    t.custom ||= {};
    fit(t, s.size);
  }
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { alert('Nu am putut salva: spațiul din browser e plin.'); }
}

const player = id => state.players.find(p => p.id === id);
const team = id => state.teams.find(t => t.id === id);
const teamOf = id => state.teams.find(t => t.slots.includes(id));
const formationOf = t => FORMATIONS[state.size].includes(t.formation) ? t.formation : FORMATIONS[state.size][0];

// "2-1-1" → portarul + liniile, de la apărare la atac
function spots(f) {
  const lines = f.split('-').map(Number), out = [{ x: .08, y: .5, role: 'P' }];
  lines.forEach((n, i) => {
    const x = .3 + i * (.52 / (lines.length - 1));
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
    ${role ? `<span class="role${role !== p.pos ? ' off' : ''}" title="Joacă ${ROLE[role].toLowerCase()}">${role}</span>` : ''}${avatar(p)}<span class="name">${esc(p.name)}</span><span class="pos pos-${p.pos}">${p.pos}</span>
  </div>`;
}

function half(t, side) {
  const sp = spots(formationOf(t));
  const tokens = t.slots.map((id, i) => {
    const { x, y } = t.custom[i] || sp[i];
    const left = (side === 'L' ? x : 1 - x) * 100, top = y * 100;
    const p = id && player(id);
    return p
      ? `<div class="token" data-id="${p.id}" data-slot="${i}" title="${esc(p.name)} · ${ROLE[p.pos]}" style="left:${left}%;top:${top}%;view-transition-name:k-${p.id}">
          <div class="disc">${avatar(p)}<span class="pos pos-${p.pos}">${p.pos}</span></div><span class="tname">${esc(short(p))}</span></div>`
      : `<div class="token empty" data-slot="${i}" style="left:${left}%;top:${top}%">
          <div class="disc"></div><span class="tname">${ROLE[sp[i].role]}</span></div>`;
  }).join('');
  return `<div class="half" data-zone="${t.id}" data-pitch="${side}" style="--team:${t.color}">${tokens}</div>`;
}

function render() {
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

document.addEventListener('pointerdown', e => {
  const c = e.target.closest('.chip, .token[data-id]');
  if (!c || e.button !== 0) return;
  e.preventDefault();
  drag = { id: c.dataset.id, src: c, x0: e.clientX, y0: e.clientY, ghost: null, zone: null, over: null };
});

document.addEventListener('pointermove', e => {
  if (!drag) return;
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

document.addEventListener('pointerup', e => {
  if (!drag) return;
  const d = drag; drag = null;
  if (!d.ghost) return openEditor(d.id); // click simplu = editare

  d.zone?.classList.remove('over');
  d.over?.classList.remove('target');
  const zone = d.zone?.dataset.zone;
  const pitch = d.zone?.dataset.pitch;
  const slot = d.over ? +d.over.dataset.slot : null;
  const r = d.zone?.getBoundingClientRect();
  const cx = e.clientX - d.dx + d.w / 2, cy = e.clientY - d.dy + d.h / 2; // centrul jetonului tras

  const ok = zone && move(d.id, zone, slot);
  if (!ok && d.zone) d.zone.classList.add('reject'), setTimeout(() => d.zone.classList.remove('reject'), 400);

  // lăsat pe teren, dar nu pe un loc anume: jucătorul rămâne exact unde l-ai pus
  if (ok && pitch && slot == null) {
    const t = team(zone), i = t.slots.indexOf(d.id);
    const lx = (cx - r.left) / r.width;
    if (i >= 0) t.custom[i] = {
      x: clamp(pitch === 'L' ? lx : 1 - lx, .05, .95),
      y: clamp((cy - r.top) / r.height, .08, .92),
    };
  }

  // jetonul „zboară” din fantomă spre locul nou (sau înapoi): pe teren spre jeton, altfel spre rândul din listă
  vtName(d.ghost, (pitch && ok ? 'k-' : 'p-') + d.id);
  commit(() => d.ghost.remove());
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('chip')) openEditor(e.target.dataset.id);
});

/* ---------- header, teren, echipe ---------- */
$('#size').addEventListener('click', e => {
  const n = +e.target.dataset.size;
  if (n && n !== state.size) commit(() => { state.size = n; state.teams.forEach(t => { fit(t, n); t.custom = {}; }); });
});
$('#clear').addEventListener('click', () => {
  if (confirm('Toți jucătorii revin în listă. Continui?')) commit(() => state.teams.forEach(t => { t.slots.fill(null); t.custom = {}; }));
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
  $('#delete').hidden = !editing;
  preview();
  dlg.showModal();
}

$('#add').addEventListener('click', () => openEditor(null));
$('#name').addEventListener('input', () => { if (!photo) preview(); });
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

  if (action === 'ok' && name) commit(() => {
    if (editing) Object.assign(editing, { name, pos, photo });
    else state.players.push({ id: uid(), name, pos, photo });
  });
  const id = editing?.id;
  if (action === 'delete' && id && confirm(`Ștergi pe ${editing.name}?`)) commit(() => {
    move(id, null);
    state.players = state.players.filter(p => p.id !== id);
  });
});

render();
