# Sintetic

Manager de echipe pentru fotbal pe sintetic: 3 echipe de 5 sau 6 jucători, teren cu formații, drag & drop sau atingere.
Online: https://el-petriko.github.io/sintetic/

Totul rulează în browser, fără server. Sesiunile stau în browserul dispozitivului (localStorage) și se pot salva în fișiere `.json`.

## Rulare locală

```bash
python3 -m http.server 8080
```

## Format sesiune

```json
{
  "format": "sintetic-sesiune",
  "version": 1,
  "name": "Sintetic de joi",
  "date": "2026-11-12",
  "start": "18:00",
  "end": "20:00",
  "venue": "Terenul Verde",
  "size": 5,
  "players": [
    { "name": "Ion Popescu", "pos": "GK" },
    { "name": "Mihai Ionescu", "pos": "LB" }
  ],
  "teams": [
    { "name": "Echipa 1", "color": "#e63946", "formation": "1-2-1", "slots": ["Ion Popescu", "Mihai Ionescu", null, null, null] }
  ],
  "playing": [0, 1]
}
```

- `size`: 5 sau 6. `date`: `AAAA-LL-ZZ`. `start` / `end`: `HH:MM`. Toate câmpurile în afară de `format` și `players` sunt opționale.
- `pos`: `P` / `F` / `M` / `A`, cuvântul întreg („Fundaș”) sau o poziție exactă: `GK`, `CB`, `LB`, `RB`, `LWB`, `RWB`, `SW`,
  `CM`, `CDM`, `DM`, `CAM`, `AM`, `LM`, `RM`, `ST`, `CF`, `LW`, `RW`, `FW`. Poziția exactă se păstrează și se afișează pe jucător.
- `photo` (opțional): imagine `data:image/jpeg;base64,...`.
- `teams`: până la 3 echipe. `slots[i]` = jucătorul de pe locul `i` al formației (0 = portar), dat prin nume sau prin `id`; `null` = loc liber.
- Formații: 5×5 `2-2`, `1-2-1`, `2-1-1`, `3-1`; 6×6 `2-2-1`, `2-1-2`, `3-1-1`, `1-3-1`.
- `playing`: indicii celor 2 echipe de pe teren; a treia stă pe margine.
- Fișierele salvate de aplicație au în plus `id` pe jucători și `custom` pe echipe (pozițiile mutate de mână).

## Format listă de jucători

Butoanele Import / Export de lângă listă folosesc doar jucătorii: `{"format": "sintetic-jucatori", "version": 1, "players": [...]}`,
cu aceleași câmpuri ca mai sus. La import, jucătorii cu același nume sunt actualizați, ceilalți sunt adăugați.
