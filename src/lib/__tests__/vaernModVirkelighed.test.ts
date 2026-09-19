import { describe, expect, it } from "vitest";
import { kontrollerUdkast } from "@/lib/marketing/udkastVaern";
import { MEDLEMSUDTALELSER } from "@/lib/marketing/grundlag";

/**
 * VÆRNET MOD DEN VIRKELIGE TEKST.
 *
 * Et værn, der kun er prøvet mod fixtures, jeg selv har skrevet, beviser
 * ingenting — jeg skriver dem jo, så de passer. Derfor står her ordlyden fra to
 * skabeloner, hentet fra Klaviyo 19/9-2026: den ene bærer fejlen, den anden er
 * godkendt og rigtig. Værnet skal skelne dem.
 *
 * Falder disse to prøver efter en rettelse i teksten i Klaviyo, er det ikke
 * nødvendigvis værnet, der er galt — så er ordlyden ændret, og fixturen skal
 * hentes igen.
 */

/** «Webinar — 7 dage før» (TVbT4b) SOM DEN SÅ UD kl. 18:16, da værnet fandt den.
    De ni øvrige blev rettet 19:06-19:49; denne blev ikke. Jonas rettede den
    20:09 — se SYV_DAGE_FOER_RETTET nedenfor. Den gamle ordlyd bliver stående
    her, fordi det er den eneste rigtige fejl, værnet har mødt. */
const SYV_DAGE_FOER = `Om en uge holder jeg webinaret, du har meldt dig til.

Indtil da vil jeg give dig ét spørgsmål at tænke over:

Hvad kostede din sidste store beslutning dig — og hvornår fandt du ud af det?

De fleste ejerledere, jeg taler med, kan svare på det første. Det er det andet, der gør ondt. Prisen står i regnskabet et halvt år senere, længe efter at den kunne være lavet om.

Det er dét, webinaret handler om: at se tallene, mens de stadig kan bruges til noget.

Vi ses om en uge. Du får et link i god tid.

Venlig hilsen
Morten`;

/** «Webinar — Efter 01: Tak fordi du var med» (TYDpbi, opdateret 19:08). Godkendt. */
const EFTER_01 = `Tak, fordi du brugte en time på det. Jeg håber, du tog mindst én ting med, du kan bruge på mandag.

Vil du se det igen, eller nåede du ikke det hele, ligger optagelsen her:
https://www.topix.dk/webinar/optagelse

Det spørgsmål, jeg håber du sidder med nu: hvem kigger på dine tal sammen med dig hver måned? For de fleste ejerledere er svaret én gang om året, med en revisor, om noget der allerede er sket.

THE BOARDROOM
Tolv måneder med Jonas Herlev og mig. Månedlig sparring, direkte adgang i hverdagen, og ét medlem pr. niche. 50.000 kr. ex moms for et år, eller 4.375 kr. om måneden. For ejerledere med to millioner i omsætning eller mere.

Send en ansøgning: https://app.theboardroom.dk/ansoeg?kilde=webinar

Venlig hilsen
Morten

---
Du får denne mail, fordi du har tilmeldt dig webinaret.`;

/** SAMME MAIL, efter Jonas' rettelse (TVbT4b, opdateret 19/9 kl. 20:09).
    Spørgsmålet er nyt, og rammen om «tallene» er væk. */
const SYV_DAGE_FOER_RETTET = `Om en uge holder jeg webinaret, du har meldt dig til.

Indtil da vil jeg give dig ét spørgsmål at tænke over:

Hvilken beslutning har du skubbet foran dig længst — og hvad venter du egentlig på?

De fleste ejerledere, jeg taler med, kan svare på det første med det samme. Det er det andet, der bliver stille. Som regel venter man ikke på noget bestemt — man mangler bare nogen at vende den med.

Jeg har lavet fejlene selv, i dba, i Just Eat, i Miinto og i Hungry. På webinaret giver jeg dig det, jeg lærte af dem.

Vi ses om en uge. Du får et link i god tid.

Venlig hilsen
Morten

---
Du får denne mail, fordi du har tilmeldt dig webinaret.`;

describe("værnet mod den virkelige tekst i Klaviyo (hentet 19/9-2026)", () => {
  it("«7 dage før» fanges — og der peges på den sætning, der er gal", () => {
    const dom = kontrollerUdkast(SYV_DAGE_FOER);
    expect(dom.ingenPaaviseligFejl).toBe(false);
    expect(dom.fejl).toHaveLength(1);
    expect(dom.fejl[0].regel).toBe("R7 forkert ramme");
    expect(dom.fejl[0].fundet).toBe("handler om: at se tallene");
  });

  it("den RETTEDE «7 dage før» har ingen fejl — rettelsen holder", () => {
    const dom = kontrollerUdkast(SYV_DAGE_FOER_RETTET);
    expect(dom.fejl).toEqual([]);
  });

  it("... men den får ét tjek, fordi den påstår noget om indholdet uden rammen", () => {
    // HULLET, VÆRNET SELV AFSLØREDE (19/9 kl. 22:10): porten så først kun efter
    // «handler om», «gennemgår» osv. og var derfor TAVS på «På webinaret giver
    // jeg dig det, jeg lærte af dem». Den var ikke tilfreds — den kiggede det
    // forkerte sted. Denne prøve holder porten åben på den formulering.
    const dom = kontrollerUdkast(SYV_DAGE_FOER_RETTET);
    expect(dom.tjek).toHaveLength(1);
    expect(dom.tjek[0].regel).toBe("R7 ramme ikke nævnt");
  });

  it("«Efter 01» går igennem HELT rent — hverken fejl eller tjek", () => {
    const dom = kontrollerUdkast(EFTER_01);
    // Prisen, begge links og «to millioner» må ikke give udslag. Larmer værnet
    // på godkendt tekst, holder ingen op med at læse det.
    expect(dom.fejl).toEqual([]);
    expect(dom.tjek).toEqual([]);
  });
});

describe("medlemscitaterne i brug (kom 19/9)", () => {
  it("Daniels ord, ordret og korrekt tilskrevet, går rent igennem", () => {
    const udkast = `Daniel Sand driver remm.dk og er medlem af The Boardroom.

«${MEDLEMSUDTALELSER[0].citat}»

Send en ansøgning: https://app.theboardroom.dk/ansoeg?kilde=webinar`;
    const dom = kontrollerUdkast(udkast);
    expect(dom.fejl).toEqual([]);
  });

  it("et uddrag af Daniels citat er også lovligt — vi må citere kortere, ikke længere", () => {
    const dom = kontrollerUdkast('Daniel Sand siger: «ro i maven, når jeg skal træffe større økonomiske beslutninger for remm».');
    expect(dom.fejl).toEqual([]);
  });

  it("men et citat, der er STRAMMET op, er ikke længere hans ord", () => {
    const dom = kontrollerUdkast('Daniel Sand siger: «The Boardroom gav mig fuld kontrol over min økonomi på tre måneder».');
    expect(dom.fejl.map((f) => f.regel)).toContain("R4 citat");
  });

  it("Carstens navn som medlemsbevis er en fejl — også når sætningen lyder pæn", () => {
    const dom = kontrollerUdkast("Spørg Carsten Guldhammer fra Mileage Book, hvad The Boardroom har betydet.");
    expect(dom.fejl.map((f) => f.regel)).toContain("R9 tilladelse");
  });

  it("broen: Daniels økonomiord sammen med webinaret giver et tjek, ikke en fejl", () => {
    const dom = kontrollerUdkast("Efter webinaret: Daniel fik styr på budgetter og likviditet som medlem.");
    expect(dom.fejl).toEqual([]);
    expect(dom.tjek.map((t) => t.regel)).toContain("R10 broen");
  });
});
