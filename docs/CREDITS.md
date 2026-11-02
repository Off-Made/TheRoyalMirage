# The Royal Mirage — Crediti e licenze degli asset

Tutte le immagini raster stanno in `public/assets/` e sono prodotte da
`tools/build-assets.mjs` (conversione in WebP, ridimensionamento) a partire
dagli originali elencati qui. Nessuna immagine e' generata da AI ne' disegnata
a mano nel codice.

## Icone 3D — `public/assets/icons/*.webp`

**Microsoft Fluent Emoji (3D)** — © Microsoft Corporation, licenza **MIT**.
Sorgente: <https://github.com/microsoft/fluentui-emoji> (`assets/<Nome>/3D/<nome>_3d.png`).
Usate come simboli delle slot, copertine dei giochi e icone di interfaccia.
(La fiche del Golden Chip e della transizione e' disegnata nel codice, `src/art/houseChip.ts`.)

## Fotografie — `public/assets/bg/*.webp`

Da Wikimedia Commons. Le licenze CC BY / CC BY-SA richiedono l'attribuzione
qui riportata; le versioni sfocate (`*-blur`, `lights`) sono opere derivate
distribuite con la stessa licenza dell'originale.

| File | Originale | Autore | Licenza |
|---|---|---|---|
| `strip.webp`, `strip-m.webp`, `strip-blur.webp` | [1 Las vegas strip.jpg](https://commons.wikimedia.org/wiki/File:1_Las_vegas_strip.jpg) | chensiyuan | CC BY-SA 4.0 |
| `bellagio.webp` | [Bellagio (15378753127).jpg](https://commons.wikimedia.org/wiki/File:Bellagio_(15378753127).jpg) | Tony Hisgett | CC BY 2.0 |
| `skyline.webp` | [2007-12-24 Night in Las Vegas.jpg](https://commons.wikimedia.org/wiki/File:2007-12-24_Night_in_Las_Vegas.jpg) | Michael Rehfeldt | CC BY 2.0 |
| `lights.webp` | [2020 New Years Eve on the Las Vegas Strip.jpg](https://commons.wikimedia.org/wiki/File:2020_New_Years_Eve_on_the_Las_Vegas_Strip.jpg) | Tydence Davis | CC BY 2.0 |

## Caratteri — Google Fonts, SIL Open Font License 1.1

- **Big Shoulders Display** e **Big Shoulders Inline Display** — Patric King
- **Manrope** — Mikhail Sharanda

## Rigenerare gli asset

```
node tools/build-assets.mjs <cartella-con-photos/-e-fluent/>
```

La cartella sorgente sta FUORI dal progetto (gli originali non vanno nel
bundle). Nomi dei file attesi: vedi le tabelle `PHOTOS` e `ICONS` nello script.
