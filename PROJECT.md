# Fotbal sintetic — manager de echipe

Start: 2026-11-12 · Sesiuni: `sessions/2026-11-12_01_fotbal-sintetic/`

## Descriere
Aplicație pentru meciuri de fotbal pe sintetic: 3 echipe de câte 5 sau 6 jucători.
Arată grafic echipele și permite modificarea lor dinamică (cine joacă unde, pe ce poziție).

## Done înseamnă (v1, desktop)
- Lista de jucători (nume, poză, poziție preferată), cu adăugare, editare și ștergere.
- 3 echipe colorate; jucătorii se mută prin drag & drop între listă și echipe.
- Teren desenat, cu 2 echipe față în față și a 3-a pe margine.
- Formații predefinite pentru 5 și 6 jucători; jucătorii se mută pe teren prin drag & drop, cu poziții libere.
- Arată bine, animații fluide, datele rămân salvate între sesiuni.

## Cerință
- Formatul cu 5 sau 6 jucători se alege global; toate echipele au aceeași mărime.
- 3 echipe: câștigătoarea rămâne pe teren. La egal iese echipa care era pe teren de mai mult timp. **Nu intră în v1**, vine după.
- V1 acoperă doar componența echipelor, pozițiile și formațiile. Restul (scor, rotație, istoric) se extinde după.
- Ordine: întâi desktop, apoi telefon. E aceeași aplicație web, cu alt layout pe telefon.
- Jucător: nume, poziție preferată (P / F / M / A), poză.

## Stack
Web vanilla: un `index.html` + `style.css` + `app.js`, fără build și fără dependențe.
Terenul e SVG, drag & drop-ul folosește Pointer Events (merg și pe touch, util pentru varianta de telefon), iar datele stau în `localStorage`.
Pozele se micșorează la ~128px în browser înainte de salvare.

## Cum se rulează
- Local: `python3 -m http.server 8080` în `projects/fotbal-sintetic/`, apoi http://localhost:8080
- Online: https://el-petriko.github.io/sintetic/ (GitHub Pages din `main`, se actualizează la fiecare push)
- Repo: https://github.com/El-Petriko/sintetic (public). Push-ul folosește un helper local cu tokenul contului El-Petriko.

## Plan
Lucrez direct, fără workeri: e muncă de design, iterativă cu utilizatorul, pe aceleași 3 fișiere.

| Val | Subtask | Agent | Gata când |
|---|---|---|---|
| 1 | Structură + listă jucători (CRUD, poză, poziție) + 3 coloane de echipe cu drag & drop + salvare | Opus | adaug jucători, îi mut între echipe, rămân după reload |
| 2 | Teren SVG, 2 echipe față în față, a 3-a pe margine, alegerea 5/6, formații predefinite, drag pe teren | Opus | aleg formația, jucătorii se așază, îi mut liber |
| 3 | Finisare vizuală (animații, temă, detalii), verificare în browser | Opus | screenshot-uri desktop arătate utilizatorului |
| — | Mai târziu: layout de telefon, rotația echipelor, scor/cronometru | — | — |

## Decizii
- Web în locul unei aplicații native: același cod servește și desktop, și telefon.
- Fără framework: stare mică, 3 fișiere. Se reevaluează dacă aplicația crește mult.

## Status
- Val 1 gata (2026-11-12): listă CRUD cu poză și poziție, 3 echipe, drag & drop, 5/6, salvare.
- Val 2 gata (2026-11-12): teren SVG cu 2 echipe față în față, a 3-a pe margine (buton „intră în locul X”),
  4 formații pentru fiecare mărime, drag pe teren (poziție liberă, schimb pe un jeton, loc liber, înapoi în listă).
- Val 3 gata (2026-11-12): bară „echipă VS echipă” cu formațiile, poziția preferată pe jetoane, postul locului în carduri
  (portocaliu dacă diferă de poziția preferată), lista grupată pe posturi, prenume diferențiate, teren cu colțuri și puncte de penalty, favicon.
- Telefon gata (2026-11-12): sub 700px teren vertical (dreapta sus, stânga jos), totul pe o coloană, lista în 2 coloane.
  Atingere: atingi jucătorul (bară jos cu Editează / Scoate / ✕), apoi un loc, alt jucător, teren sau listă. Merge și pe desktop;
  editarea pe desktop e prin dublu-click sau prin bară. Pozițiile sunt `--x/--y` în CSS, `pitchPoint()` e inversul.
- Reparații telefon + import/export (2026-11-12): scroll de oriunde (drag cu degetul după ~250 ms ținut apăsat),
  pe verticală margine de 7% la capete (portarul nu mai intră sub linie), eticheta echipei de jos deasupra discului.
  Import/export jucători în JSON (`{"format": "sintetic-jucatori", "version": 1, "players": [...]}`), import după nume:
  actualizează sau adaugă, nu șterge; câmpurile sunt validate (poza doar data:image base64).
- Portari în teren (2026-11-12): `--px = .11 + .86x` pe ambele orientări (CSS), inversul în `pitchPoint()`.
- Actualizare (2026-11-12): Pages ține fișierele ~10 min în cache; `checkUpdate()` compară cache cu serverul la deschidere
  și la revenirea în tab, apoi oferă butonul „Versiune nouă · Actualizează” (`fetch cache:'reload'` + reload).
- Sesiuni (2026-11-12): localStorage `sintetic-v2` = `{current, sessions}`; datele vechi (`fotbal-sintetic-v1`) devin „Sesiune salvată”.
  Fără sesiuni → ecran de start (nouă / import). Meniul din antet: detalii, salvare (suprascrie pe Chrome desktop prin
  File System Access, altfel descarcă), salvare ca fișier nou, import, nouă (opțional cu jucătorii), înlocuire, listă, ștergere.
  Formatul e în README.md. Poziții exacte (LW, ST…) pe jucători (`role`), încadrate automat în P/F/M/A.
- Fișierul pentru 2026-11-12 (Terenul Verde, 18–20, 15 jucători) e în `~/Desktop/sintetic-2026-11-12.json`, nu în repo (nume reale).
- Teste în pane-ul ascuns: și evenimentul `close` al dialogurilor așteaptă randarea; un screenshot mic între pași îl declanșează.
- Model: `team.slots[i]` = loc fix (0 = portar), `team.custom[i]` = poziție mutată de mână. Datele vechi (`members`) se migrează la încărcare.

## Pași rămași
- Feedback utilizator pe v1 desktop.
- Feedback pe telefonul real după reparații (drag ținut apăsat, scroll; captura din 12:33 era versiunea veche din cache).
- PWA (manifest, offline), dacă e nevoie.
- Apoi: buton „Distribuie” (link/imagine cu echipele, varianta A).
- Idei: oră/teren deja în sesiune; rotația echipelor; scor.
- Mai târziu: layout de telefon, rotație automată (câștigătoarea rămâne, la egal iese echipa veche), scor/cronometru.
