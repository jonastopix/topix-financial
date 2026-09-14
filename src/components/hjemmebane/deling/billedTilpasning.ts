/**
 * billedTilpasning — cover/contain regnet i px, i stedet for object-fit.
 *
 * MÅLT 14/9 (Jonas kl. 17:20, og i headless Chrome med motoren): html2canvas
 * 1.4.1 kender ikke object-fit — ordet findes ikke i pakken — og tegner et
 * <img> med drawImage(hele billedet → hele content-boksen)
 * (html2canvas.js:6805-6815). Så et logo med fit=contain blev strukket ud i
 * slot'en, og et portræt med fit=cover blev klemt i stedet for beskåret.
 * border-radius og overflow:hidden virker (klip med afrundede kurver,
 * :6141-6149, :6808-6811) — det er kun tilpasningen der mangler.
 *
 * Derfor regnes det tegnede rektangel her, rent, ud fra rammens og billedets
 * naturlige mål, og <img> får præcis det som width/height/left/top. Så er
 * boksen lig med det viste — i browseren OG i html2canvas, som bare fylder
 * boksen. Skærmen bliver ikke anderledes: det er samme geometri som
 * object-fit ville give (centreret, CSS Images 3 §4.5).
 */

export type Tilpasning = "cover" | "contain";

export interface Maal {
  bredde: number;
  hoejde: number;
}

export interface Rektangel {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Det rektangel billedet skal tegnes i, i rammens koordinater, centreret.
 * contain: hele billedet inde i rammen (letterbox). cover: rammen fyldt,
 * overskud uden for (rammen klipper). Ugyldige mål (0, NaN) giver hele
 * rammen — aldrig et 0×0-billede.
 */
export function tilpasBillede(tilpasning: Tilpasning, ramme: Maal, natur: Maal): Rektangel {
  const gyldig = (m: Maal) => Number.isFinite(m.bredde) && Number.isFinite(m.hoejde) && m.bredde > 0 && m.hoejde > 0;
  if (!gyldig(ramme) || !gyldig(natur)) return { left: 0, top: 0, width: ramme.bredde, height: ramme.hoejde };
  const sb = ramme.bredde / natur.bredde;
  const sh = ramme.hoejde / natur.hoejde;
  const s = tilpasning === "contain" ? Math.min(sb, sh) : Math.max(sb, sh);
  const width = natur.bredde * s;
  const height = natur.hoejde * s;
  return { left: (ramme.bredde - width) / 2, top: (ramme.hoejde - height) / 2, width, height };
}
