# Rainbow Blast

Blokjespuzzel in de stijl van Block Blast voor Wyne (8) en Viggo, met Katrien (Rainbow Island) of Kit Nugget (Kit Nugget Eiland). Geen advertenties, geen aankopen, geen netwerk nodig: PWA die volledig offline werkt, gemaakt voor de iPad (staand en liggend).

## Spel
- 8x8 bord, steeds 3 blokjes in de bak. Slepen naar het bord; bij aanraken zweeft het blokje boven de vinger. Volle rijen en kolommen verdwijnen.
- Een set van 3 is altijd neer te zetten als dat kan (`dealPieces` zoekt een oplosbare set; bij een vol bord kleinere stukken).
- Punten: 1 per blokje + rijbonus (1 rij 10, 2 rijen 30, 3 rijen 60, 4 rijen 100) × combo. De som staat in beeld ("30 × 3 = 90").
- Combo: elke zet met een rij erbij telt op; na 3 zetten zonder rij is de combo weg. Elke 3e combostap 1 💎, bord helemaal leeg: +300 en 3 💎.
- Schatten: ongeveer 1 op 3 stukken heeft een 🌸, 🐚, ⭐ of (zelden) 💎 op een blokje. Ruim je dat blokje op, dan vliegt het naar de teller.
- Geen plek meer: één keer per potje een som (plus en min tot 100, tafels, dubbel/helft, 4 keuzes). Goed: Katrien veegt de 3 volste rijen weg en geeft nieuwe blokjes. Fout: knop wordt lichter, na 2 keer mis gloeit het goede antwoord. Daarna de eindkaart.
- Het potje wordt na elke zet bewaard; de app hervat waar ze was.

## Eiland (3D, uit Rainbow Island)
- `src/scene/` is letterlijk overgenomen uit Rainbow Island (`IslandScene`, Three.js), met Katrien als GLB (`public/models/katrien.glb`). Valt terug op sprites of een figuurtje uit code.
- De scene staat vast achter alle schermen (`#stage`); menu en eiland zijn doorzichtig (`.see-through`), het speelscherm dekt alles af en pauzeert de scene.
- Bouwen zoals in Rainbow Island: blokken (stapelen tot 6 hoog) en meubels (tik om te draaien), gum legt het terug in de tas, vegen draait het eiland, knijpen zoomt, tik op Katrien en dan een tegel om haar te verplaatsen. Visje kopen en op Katrien tikken: ze spint.
- Kopen met schatten (`src/game/island.ts`), "Meer land" kost schelpen (5, 7, 9, ...), eiland groeit van 4x4 tot 12x12.
- Niet genoeg: "Nog 2 🌸 nodig" (rekenen zonder dat het een som is).
- Het oude platte emoji-eiland (eerste versie) wordt bij laden terugbetaald in schatten.

## Papa
- Af en toe (eerst na 25 tot 45 s, daarna elke 1 tot 2 minuten) vliegt Papa in zijn helikopter over het bord (`src/ui/papa.ts`, doorzichtige WebGL-laag die alleen tijdens de vlucht rendert). Builders uit Kit Nugget Eiland (`src/scene/visitors.ts`), gescande kop `public/papa/papa.glb`.
- Tik op Papa: hij ontploft in een stortvloed van hartjes en laat een 💎 achter.

## Katten
- Per speler een kat (`src/pets.ts`): Katrien (zij/haar, Rainbow Island) of Kit Nugget (hij/hem, Kit Nugget Eiland). Elk in `public/pets/<id>/`: `model.glb`, pose-sprites (`beg`, `jump`, `confetti`, `sleep`) en `meow-1`, `meow-2`, `purr`. Kit Nugget heeft geen confetti-sprite: dat is zijn `happy`.
- Teksten gebruiken `pet.name`, `pet.zij`, `pet.haar`. Wisselen naar een speler met een andere kat herlaadt de pagina (de scene laadt het model maar één keer).

## Spelers
- Profielen (`rainbow-blast.profiles` + `rainbow-blast.p.<id>`): elke speler eigen naam, eiland, schatten, record en potje. Standaard "Wyne"; een save van voor de profielen gaat naar Wyne.
- Menu linksboven: wie speelt er, nieuwe speler, naam veranderen, weghalen (met bevestiging). Katrien gebruikt overal `player.name`.

## Huisregels (van Rainbow Island)
- Teksten zonder hij/zij over de speler: alleen de naam (Wyne of Viggo spelen allebei).
- Teksten in simpel Nederlands, korte zinnen, grote letters. De kat heet altijd bij naam (Katrien zij/haar, Kit Nugget hij/hem).
- Geen em-dashes in spelteksten. Code en comments in het Engels.
- Nooit straffend: geen rood, geen buzzer, geen levens, geen tijdsdruk.
- Geen extra runtime-dependencies behalve Three.js (zelfde versie als Rainbow Island).

## Stack
- Vite + TS vanilla, canvas 2D, vite-plugin-pwa (`registerType: 'prompt'`, update pas op het startscherm), `base: './'`.
- Assets uit Rainbow Island en Kit Nugget Eiland: `public/pets/`, `public/papa/`, `public/sounds` (goed, overwinning, start). De rest is WebAudio-synth (`src/audio.ts`).
- Opslag: localStorage `rainbow-blast.v1`.
- Logica in `src/game/` (met Vitest-tests), schermen in `src/ui/` (menu, play, island).
- Icoon (Katrien en Kit Nugget op regenboogblokjes): `node scripts/icon.mjs`. Controle: `npm run build && node scripts/screenshots.mjs` (Chromium uit `~/Library/Caches/ms-playwright/chromium-1033`, playwright-core uit kit-nugget-klimt). Sleept met echte touch-events (CDP `Input.dispatchTouchEvent`, pointerType touch), speelt een heel potje, bouwt op het 3D-eiland en test profielen. "Couldn't load texture blob" van GLTFLoader is een headless-beperking (ook in Rainbow Island).
- Emoji op canvas nemen de alpha van `fillStyle` over: altijd `fillStyle = '#000'` vlak voor `fillText` met emoji.
