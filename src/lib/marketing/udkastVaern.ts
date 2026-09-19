/**
 * src/lib/marketing/udkastVaern.ts
 *
 * DOMMEN: bygger dette udkast på grundlaget, eller på en antagelse?
 *
 * ── HVAD VÆRNET KAN, OG HVAD DET IKKE KAN ───────────────────────────────────
 * Et værn, der påstår mere end det kan, er værre end intet — så her står
 * grænsen først, og den er skrevet, før reglerne er:
 *
 * DET KAN AFGØRES MASKINELT (`fejl` — sikkert, ingen skønssag):
 *   · et beløb, der ikke findes i grundlaget
 *   · et citat, ingen har sagt
 *   · et link, vi ikke ejer
 *   · en forbudt vending (udråbstegn, superlativ, «regnskab og nøgletal» om
 *     webinaret, 52.500 som årspris)
 *   · et citat tillagt en person, hvis ordlyd står som MANGLER
 *   · en Morten-udtalelse sat i samme sætning som medlemskabet (R9): navnet
 *     står enten i sætningen eller ikke — der er intet skøn i det opslag
 * Fælles for dem: de er OPSLAG. Enten står strengen i grundlaget, eller også
 * gør den ikke. Der er intet skøn, og derfor kan de blokere.
 *
 * DET KAN KUN ANTYDES (`tjek` — et menneske skal se på det):
 *   · et navn brugt i en sammenhæng, det måske ikke hører til
 *   · et ukendt tal, der ikke ligner et beløb (datoer, klokkeslæt, optællinger)
 *   · et webinarudkast, der ikke nævner de to områder eller de fem spørgsmål
 *   · økonomiord i nærheden af webinaret (R10): medlemskabet leverer struktur,
 *     budgetter og likviditet, men webinaret er stadig vækststrategi
 *
 * **DET KAN IKKE AFGØRES — OG DET ER PRÆCIS DEN FEJL, DER SKETE:**
 * Værnet kan ikke se, om en PRÆMIS er forkert. Et udkast kan bestå udelukkende
 * af godkendte fakta, indeholde nul fejl efter alle reglerne nedenfor, og
 * stadig tage fejl af, hvad webinaret handler om — hvis det blot udelader det.
 * De seks mails 19/9 indeholdt ingen opdigtede tal og ingen falske citater. De
 * var bare om noget andet, end webinaret er om.
 *
 * Regel R7 er det nærmeste, vi kommer: den spørger, om et webinarudkast
 * overhovedet nævner rammen. Den er en heuristik og har `tjek`, ikke `fejl` —
 * fordi en mail godt kan handle om webinaret uden at citere emnelisten.
 * **Et grønt værn betyder «ingen påviselig fejl», ikke «rigtigt».**
 * Et menneske skal stadig læse udkastet mod tilmeldingssiden.
 */

import {
  GRUNDLAG, TESTIMONIALS, WEBINAR, PRODUKT, harVi,
  type Grundlag,
} from "./grundlag";

export type Alvor = "fejl" | "tjek";

export interface Fund {
  regel: string;
  alvor: Alvor;
  fundet: string;
  besked: string;
}

export interface Dom {
  fejl: Fund[];
  tjek: Fund[];
  /** Sand kun når der ikke er ÉN påviselig fejl. Ikke det samme som «rigtigt». */
  ingenPaaviseligFejl: boolean;
}

// ── Hjælpere ────────────────────────────────────────────────────────────────

/** Tal i dansk skrivemåde: 50.000, 4.375, 2.000, 250, 12, 1,5. */
const TAL = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;

/** Citater i «» eller "" — begge former bruges i huset. */
const CITAT = /«([^»]{8,})»|"([^"]{8,})"/g;

const LINK = /https?:\/\/[^\s)»"',]+/g;

const SUPERLATIVER = [
  "fantastisk", "enestående", "unik", "banebrydende", "revolutionerende",
  "verdensklasse", "det bedste", "markedets bedste", "uovertruffen", "eksklusiv mulighed",
];

const SALGSKLICHEER = [
  "vi er glade for", "vi er stolte af", "vi tilbyder", "grib chancen",
  "gå ikke glip af", "sidste chance", "skynd dig",
];

/** Datoer, klokkeslæt og små optællinger støjer ellers værnet til. */
const erHverdagstal = (t: string): boolean => {
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return (Number.isInteger(n) && n >= 1 && n <= 31) || (n >= 2000 && n <= 2100);
};

const normaliser = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ── Dommen ──────────────────────────────────────────────────────────────────

export function kontrollerUdkast(udkast: string, g: Grundlag = GRUNDLAG): Dom {
  const fund: Fund[] = [];
  const lav = normaliser(udkast);
  const sig = (regel: string, alvor: Alvor, fundet: string, besked: string) =>
    fund.push({ regel, alvor, fundet, besked });

  // R1 — BELØB. Et tal med kr. eller % skal stå i grundlaget. Fejl: sikkert.
  const belob = [...udkast.matchAll(/([\d.,]+)\s*(kr\.?|%|mio\.?|millioner)/gi)];
  for (const m of belob) {
    const tal = m[1].replace(/[.,]$/, "");
    if (!g.kendteTal.includes(tal)) {
      sig("R1 beløb", "fejl", m[0].trim(),
        `Beløbet «${m[0].trim()}» findes ikke i grundlaget. Opfind aldrig et tal.`);
    }
  }

  // R2 — ÅRSPRISFÆLDEN. 4.375 × 12 = 52.500. Egen regel, fordi den er
  // regnerigtig og alligevel forkert: ratetillægget er finansiering, ikke pris.
  if (/52[.,]?500/.test(udkast)) {
    sig("R2 årsprisfælden", "fejl", "52.500",
      "52.500 er 12 × månedsraten, ikke årsprisen. Årsprisen er 50.000 kr. ex moms. Månedsraten bærer 5 % ratetillæg.");
  }

  // R3 — ØVRIGE TAL. Uden enhed kan det være en dato. Derfor tjek, ikke fejl.
  for (const m of udkast.match(TAL) ?? []) {
    if (erHverdagstal(m) || g.kendteTal.includes(m)) continue;
    if (belob.some((b) => b[1].includes(m))) continue; // allerede fanget af R1
    sig("R3 ukendt tal", "tjek", m,
      `Tallet ${m} står ikke i grundlaget. Er det en dato eller et klokkeslæt, er det i orden — ellers skal det hentes.`);
  }

  // R4 — CITATER. Et citat uden ordlyd i grundlaget er opdigtet. Fejl: sikkert.
  for (const m of udkast.matchAll(CITAT)) {
    const tekst = (m[1] ?? m[2]).trim();
    const kendt = g.kendteCitater.some((c) => normaliser(c).includes(normaliser(tekst)));
    if (!kendt) {
      sig("R4 citat", "fejl", tekst,
        `Citatet «${tekst}» findes ikke i grundlaget. Et citat, ingen har skrevet ned, må ikke i en mail.`);
    }
  }

  // R5 — LINKS. Fejl: sikkert.
  for (const m of udkast.match(LINK) ?? []) {
    const rent = m.replace(/[.,]$/, "");
    if (!g.kendteLinks.includes(rent)) {
      sig("R5 link", "fejl", rent, `Linket ${rent} er ikke et af vores to kendte links.`);
    }
  }

  // R6 — FORBUDTE VENDINGER. Fejl: sikkert, det er strengopslag.
  if (udkast.includes("!")) {
    sig("R6 udråbstegn", "fejl", "!", "Huset bruger ikke udråbstegn. Målt: 0 i 597 ord godkendt tekst.");
  }
  for (const ord of [...SUPERLATIVER, ...SALGSKLICHEER]) {
    if (lav.includes(ord)) sig("R6 vending", "fejl", ord, `«${ord}» hører ikke til i husets sprog.`);
  }

  // R7 — RAMMEN. DEN FEJL, DER FAKTISK SKETE.
  // Halvdelen er sikker: skriver udkastet, at webinaret HANDLER OM regnskab
  // eller nøgletal, er det påviseligt forkert — det er en forbudt formulering.
  const omWebinaret = /webinar/i.test(udkast);
  if (omWebinaret) {
    // Ordlisten er udvidet 19/9 efter medlemscitaterne: at MEDLEMSKABET giver
    // budgetter og likviditet (Daniel Sand) gør ikke WEBINARET til et kursus i
    // det. Begge kortslutninger hører til her.
    const forkertRamme = /(handler om|går ud på|drejer sig om)[^.]{0,80}(regnskab|nøgletal|tallene|budgetter|likviditet|bogholderi|økonomistyring)/i.exec(udkast);
    if (forkertRamme) {
      sig("R7 forkert ramme", "fejl", forkertRamme[0].trim(),
        `Webinaret handler IKKE om regnskab, nøgletal, budgetter eller likviditet. Det handler om de to områder, der afgør vækst, og de fem spørgsmål, Morten stiller sine investeringer. ${g.broen.advarsel} ${g.broen.formulering}`);
    }
    // Den anden halvdel er kun en heuristik. PORTEN ER SNÆVER MED VILJE: den
    // åbner kun, når udkastet PÅSTÅR noget om webinarets indhold. En mail, der
    // blot nævner webinaret (en kvittering, et link til optagelsen, en
    // afmeldingsfod), gør ingen påstand om rammen, og et tjek dér er støj.
    // Målt 19/9 mod de virkelige skabeloner: uden porten fyrede reglen på
    // «Efter 01», som er godkendt og fejlfri.
    //
    // HUL FUNDET 19/9 kl. 22:10: ordlisten var for kort. Den omskrevne TVbT4b
    // siger «På webinaret giver jeg dig det, jeg lærte af dem» — en påstand om
    // indholdet — og porten åbnede ikke, fordi «giver jeg dig» ikke stod i
    // listen. Dommen var TAVS, ikke tilfreds, og en tavs dom ligner en grøn.
    // Derfor er der nu to veje ind: den faste ordliste, OG enhver aktiv
    // formulering knyttet til «på webinaret».
    const paastaarIndhold =
      /handler om|går ud på|drejer sig om|gennemgår|kommer (vi )?ind på|lærer du|får du at vide|viser jeg|deler jeg/i.test(udkast) ||
      /på webinaret[^.!?\n]{0,60}(giver|viser|fortæller|deler|gennemgår|lærer|får)/i.test(udkast);
    const naevnerRammen = /to områder|fem (faste )?spørgsmål/i.test(udkast);
    if (paastaarIndhold && !naevnerRammen) {
      sig("R7 ramme ikke nævnt", "tjek", "(mangler)",
        "Udkastet nævner webinaret uden at nævne de to områder eller de fem spørgsmål. Kontrollér mod tilmeldingssiden, at rammen er den rigtige.");
    }
  }

  // R8 — MANGLENDE FAKTA BRUGT ALLIGEVEL.
  // Nævnes en person, hvis citat står som MANGLER, og er der et citat i teksten,
  // er citatet nødvendigvis opdigtet. Fejl: sikkert.
  const harCitattegn = CITAT.test(udkast);
  CITAT.lastIndex = 0;
  for (const t of TESTIMONIALS) {
    if (!udkast.includes(t.navn)) continue;
    if (!harVi(t.citat) && harCitattegn) {
      sig("R8 citat uden ordlyd", "fejl", t.navn,
        `${t.navn} har ingen nedskrevet udtalelse i grundlaget (citat: MANGLER). Hent ordlyden, før navnet bruges med et citat.`);
    }
    // R9 — TILLADELSEN. `maa_bruges_som_medlemsbevis` står på hvert citat, og
    // her håndhæves den. To niveauer, fordi sikkerheden er forskellig:
    //
    //   SAMME SÆTNING som «medlem»/«The Boardroom» → FEJL. Der findes ingen
    //   legitim grund til at sætte Carstens navn i samme sætning som
    //   medlemskabet; gør man det, læses han som medlem. Det er ikke et skøn.
    //
    //   LØSERE NÆRHED (samme afsnit) → tjek. Dér kan der være en gyldig grund —
    //   en mail kan nævne Morten-citater ét sted og medlemskabet et andet.
    if (t.maa_bruges_som_medlemsbevis) continue;
    const navn = t.navn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sætningen = new RegExp(`[^.!?\\n]*${navn}[^.!?\\n]*`, "gi");
    const iSammeSaetning = (udkast.match(sætningen) ?? []).some((sæt) => /medlem|The Boardroom/i.test(sæt));
    if (iSammeSaetning) {
      sig("R9 tilladelse", "fejl", t.navn,
        `${t.navn} er IKKE medlem og udtaler sig om Morten, ikke om The Boardroom. Navnet må ikke stå i samme sætning som medlemskabet. Medlemsbeviset er ${g.medlemsudtalelser.map((m) => m.navn).join(" og ")}.`);
      continue;
    }
    const iNaerheden = new RegExp(`${navn}[\\s\\S]{0,200}(medlem|The Boardroom)|(medlem|The Boardroom)[\\s\\S]{0,200}${navn}`, "i").test(udkast);
    if (iNaerheden) {
      sig("R9 nærhed", "tjek", t.navn,
        `${t.navn}s udtalelse handler om Morten som bestyrelsesformand — ikke om medlemskabet. Kontrollér, at afsnittet ikke læses som et medlemsbevis.`);
    }
  }

  // R10 — BROEN. (Reglen er skrevet om 19/9: den påstod før, at der ingen
  // medlemsudtalelser fandtes. Det er ikke længere sandt — Daniel Sand og Peter
  // Holst Jacobsen er medlemmer, og deres ord er nedskrevet. En regel, hvis
  // præmis er blevet falsk, skal rettes, ikke stå og lyve grønt.)
  //
  // Den nye risiko er den modsatte: Daniels citat lover struktur, budgetter og
  // likviditet — om MEDLEMSKABET. Bruges de ord tæt på webinaret, er vi tilbage
  // ved regnskabskurset. Afstand er et skøn → tjek.
  if (omWebinaret && /budgetter|likviditet|bogholderi|økonomistyring|regnskab/i.test(udkast)) {
    sig("R10 broen", "tjek", "webinar + økonomiord",
      `${g.broen.advarsel} Broen går gennem ${g.broen.broen_gaar_gennem}. ${g.broen.formulering}`);
  }

  // R11 — JONAS' HISTORIK. Den er MANGLER; en præsentation ville være digtet.
  if (!harVi(g.jonas.historik) && new RegExp(`${g.jonas.navn}[^.]{0,60}(har (bygget|solgt|grundlagt|investeret)|står bag|tidligere)`, "i").test(udkast)) {
    sig("R11 ukendt historik", "fejl", g.jonas.navn,
      "Grundlaget har ingen historik for Jonas Herlev (MANGLER). Hent teksten, før han præsenteres.");
  }

  // R12 — WEBINARTITEL. MANGLER; et udkast må ikke opfinde den.
  if (omWebinaret && !harVi(WEBINAR.titel) && /webinaret ["«»]/i.test(udkast)) {
    sig("R12 ukendt titel", "fejl", "webinartitel",
      "Webinarets titel står som MANGLER i grundlaget. Hent den fra tilmeldingssiden.");
  }

  // R13 — VEJEN IND. Samtalen kommer FØR aftalen; bytter et udkast om på det,
  // lover vi noget, flowet ikke gør. Heuristik → tjek.
  if (new RegExp(PRODUKT.ansoegningslink.replace(/[?.]/g, "\\$&")).test(udkast) && /med det samme|straks (får|kommer) du (adgang|en aftale)/i.test(udkast)) {
    sig("R13 vejen ind", "tjek", "ansøgning → adgang",
      "En ansøgning giver ikke adgang. Rækkefølgen er ansøgning → vi læser → samtale med Jonas → først derefter en aftale.");
  }

  const fejl = fund.filter((f) => f.alvor === "fejl");
  const tjek = fund.filter((f) => f.alvor === "tjek");
  return { fejl, tjek, ingenPaaviseligFejl: fejl.length === 0 };
}

/** Til et menneske, ikke til en maskine. */
export function skrivDom(dom: Dom): string {
  const linjer: string[] = [];
  if (dom.fejl.length === 0 && dom.tjek.length === 0) {
    linjer.push("Ingen påviselig fejl og intet at kontrollere.");
  }
  for (const f of dom.fejl) linjer.push(`FEJL  [${f.regel}] ${f.fundet} — ${f.besked}`);
  for (const t of dom.tjek) linjer.push(`TJEK  [${t.regel}] ${t.fundet} — ${t.besked}`);
  linjer.push("");
  linjer.push("Værnet kan ikke afgøre, om præmissen er rigtig. Et grønt svar betyder «ingen påviselig fejl», ikke «rigtigt».");
  return linjer.join("\n");
}
