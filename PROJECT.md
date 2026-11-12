# sintetic-pizdos — manager de echipe pentru fotbal pe sintetic

Start: 2026-11-12 · Sesiuni: `sessions/2026-11-12_01_sintetic-pizdos/`

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
- Local: `python3 -m http.server 8080` în `projects/sintetic-pizdos/`, apoi http://localhost:8080
- Online: https://el-petriko.github.io/sintetic-pizdos/ (GitHub Pages din `main`, se actualizează la fiecare push)
- Repo: https://github.com/El-Petriko/sintetic-pizdos (public; redenumit din `sintetic` pe 2026-11-12, linkul vechi de Pages nu mai merge). Push-ul folosește un helper local cu tokenul contului El-Petriko.

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
- Meci (2026-11-12): bară cu cronometru (`matchMin`, implicit 7; `timer = {startedAt, acc}` salvat în sesiune, supraviețuiește reload-ului),
  alarmă Web Audio în 3 reprize + vibrație + clipire, Wake Lock cât merge; GOL → dialog cu jucătorii celor 2 echipe de pe teren,
  gol = `{player, team, vs, game, at, t}`; scorul meciului curent în locul lui „VS”; meci nou la „Meci nou” sau la intrarea echipei de pe margine.
- Firebase (2026-11-12): proiect `sintetic-pizdos` (plan Spark, fără card), Realtime Database europe-west1, Auth anonim activ,
  domeniu autorizat `el-petriko.github.io`. Reguli: citire/scriere doar în `live/$sid` cu `$sid.length >= 20` și `auth != null`;
  testate prin REST (8/8: scrie/citește în sesiune, refuză cod scurt, listare, altă cale, fără auth).
  Config web (publică, nu e secret): apiKey `AIzaSyDCospd_YB6tC24GdRMh58hOq8jCAsRVBo`, authDomain `sintetic-pizdos.firebaseapp.com`,
  databaseURL `https://sintetic-pizdos-default-rtdb.europe-west1.firebasedatabase.app`, projectId `sintetic-pizdos`, appId `1:448897182271:web:d4cf811e0171a52f3aa68a`.
- Live (2026-11-12): meniul sesiunii → „📡 Pune online” → link `#live=<32 caractere>`; deschis pe alt telefon creează/reia sesiunea
  și o umple de pe server. Firebase 10.12.2 din gstatic, încărcat doar pentru sesiuni live. Pe server `live/<sid>/d`: fiecare bucată e text JSON
  cu chei sortate (`players/<id>`, `goals/<id>`, `teams/t0..t2`, restul câmpurilor direct); se trimite doar diferența față de `synced`.
  Datele primite trec prin `fromLive()` (validare ca la import). Înainte de primul răspuns de la server nu se trimite nimic (altfel o copie veche
  ar suprascrie). Cronometrul folosește ora serverului (`now()` = `Date.now() + serverTimeOffset`). Fără semnal: SDK-ul ține scrierile până revine.
  Randarea din live așteaptă cât tragi un jucător sau scrii într-un câmp.
- Lacăt la gol (2026-11-12): `live/<sid>/lock = {by: uid anonim, until}`, luat prin tranzacție, 45 s. Ceilalți au butonul dezactivat
  („⏳ Gol în curs · 0:38”); cel care îl ține vede „Mai ai 0:38”, iar la expirare dialogul se închide. Se eliberează la închiderea dialogului.
  Fără semnal golul se înregistrează local, fără lacăt.
- Organizator (2026-11-12): doar contul El-Petriko (email/parolă Firebase, UID `rYXL1ZGGjdhs39mDCvVXd1IIzKs1`) pornește sesiuni live;
  username-ul devine `<username>@sintetic-pizdos.app`. Ceilalți sunt anonimi și spectatori: pot doar goluri, cronometru și lacăt
  (regulile din `database.rules.json`, lipite de mână în consolă). În aplicație: `state.mine` (local), `forbidden()`/`revert()` în `save()`,
  clasa `viewer` ascunde butoanele de editare. Sesiunile live mai vechi, fără `owner`, nu mai pot fi scrise.
- Meci (2026-11-12, v2): cine ajunge la 2 goluri câștigă pe loc (`WIN`), învinsa iese, intră echipa de pe margine, meci nou.
  Calculul e în mutația din `commit()` (rulează amânat, după animație). Spectatorii pot scrie și `game`/`playing` pentru rotație.
  Cronometru: `timer = {startedAt, acc, pauseUntil, at}`; pauza se alege din 15/30/45/60 s și se termină singură
  (`resumeAt()`, fără scriere); cooldown 5 s după orice apăsare, pentru toți (`at`). Pe telefon GOL și cronometrul sunt mari, unul lângă altul.
- Încheiere live (organizator): „Încheie live pentru toți” șterge `live/<sid>`; ceilalți văd nodul gol și rămân cu copia locală.
- Panou organizator (🛡 în antet, ascuns spectatorilor): istoric local (`state.history`, ultimele 25 de „poze” ale meciului:
  goluri, meci, cine joacă, locuri, cronometru) cu „Readu aici”; timp rămas ±10 s / ±1 min; permisiuni `live/<sid>/perm`
  (`goals`, `timer`, aplicate și în reguli); „Link nou” mută sesiunea pe alt `sid` și o șterge pe cea veche.
  Spectatorii doar adaugă goluri (nu șterg), iar cooldown-ul de 5 s e doar pentru ei.
- Test live: două origini (`localhost:8080` și `:8081`, configurația `sintetic-pizdos-2` din `.claude/launch.json`) = două „telefoane”.
- Model: `team.slots[i]` = loc fix (0 = portar), `team.custom[i]` = poziție mutată de mână. Datele vechi (`members`) se migrează la încărcare.

## Pași rămași
- Feedback utilizator pe v1 desktop.
- PWA (manifest, offline), dacă e nevoie.
- **Următorul:** test pe telefon: login organizator, spectator (goluri, cronometru, fără mutări), lacătul; test live pe 2 telefoane reale, pe Pages (după push). De urmărit: lacătul, cronometrul pe ora serverului, revenirea după fără semnal.
- Live, mai târziu: link de organizator vs. link de bancă; ștergerea automată a sesiunilor vechi de pe server (acum rămân în `live/`).
- Apoi: buton „Distribuie” cu link static/imagine (opțional, live-ul îl acoperă).
- Idei: oră/teren deja în sesiune; rotația echipelor; scor.
- Mai târziu: layout de telefon, rotație automată (câștigătoarea rămâne, la egal iese echipa veche), scor/cronometru.
