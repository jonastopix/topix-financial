import { useEffect, type RefObject } from "react";

/**
 * Dokument-grunden bag en Hjemmebane-flade (4/9, mobilens bundstykke).
 *
 * index.html er hardkodet <html class="dark">, så body under ENHVER flade
 * er .dark's mørkegrønne --background (170 30% 9%) — .theme-hjemmebane maler
 * kun sit eget subtræ. Alt uden for fladens egen boks (iOS' rubber-band,
 * glimtet mellem to sider, en rod der ikke når helt ned) viser derfor
 * lærredet, og lærredet er grønt. Hooket maler html-elementet papir-farvet
 * mens fladen er mountet, og lægger den tidligere inline-værdi tilbage ved
 * unmount, så en gammel-verdens-flade (AppLayout) ikke arver papir.
 *
 * Effekten stod i HbMemberShell (:49-76) og er flyttet hertil ordret, så
 * de standalone Hb-flader uden skal — Auth/ResetPassword/NotFound
 * (HB_RAMME), Betal og HbAdminShell — kan gøre det samme frem for at
 * kopiere den. Skallen giver sin rodRef; uden ref læses tokenet fra det
 * første .theme-hjemmebane-element i dokumentet (effekter kører efter
 * mount, så fladens rod findes). Findes intet, gælder fallback-værdien,
 * som SKAL følge --hb-paper i src/styles/hjemmebane.css.
 *
 * Bevidst IKKE :has() (støtte-forbehold gør et knækket layout værre end
 * problemet) og ikke en global regel (:root/.dark i index.css er fredet —
 * PDF-eksporten læser --background-VARIABLEN, som denne inline-stil ikke
 * rører).
 */
export const useHbDokumentGrund = (rodRef?: RefObject<HTMLElement>) => {
  useEffect(() => {
    const el = document.documentElement;
    const forrige = el.style.backgroundColor;
    const kilde = rodRef?.current ?? document.querySelector<HTMLElement>(".theme-hjemmebane");
    const token = kilde ? getComputedStyle(kilde).getPropertyValue("--hb-paper").trim() : "";
    el.style.backgroundColor = token ? `hsl(${token})` : "hsl(40 33% 97%)";
    return () => {
      el.style.backgroundColor = forrige;
    };
    // Kører én gang pr. mount — rodRef er en stabil ref-boks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
