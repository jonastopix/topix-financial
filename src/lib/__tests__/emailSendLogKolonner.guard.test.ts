import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Driftværn for email_send_log-kolonnerne (rettet 7/9). Tabellen blev
// omdøbt 19/3 (20260319090354 → email_send_log_legacy) og genskabt med et
// nyt skema (20260319090407): tidspunktet hedder created_at, og skabelonen
// står som template_name direkte på rækken. sent_at og template_id hørte
// til den gamle tabel og findes ikke — målt i prod 7/9: ti kolonner, ingen
// af de to. To læsere spurgte alligevel efter dem i et halvt år: sendt-
// loggen i EmailTemplatesView (400/42703 → isError ikke læst → «Ingen
// afsendelser endnu») og invitationslisten i Members.tsx (fejlen tavs,
// fallback til invitationens created_at). Loggen så TOM ud, ikke ØDELAGT.
//
// Værnet læser kilden (agentforslagVenter.guard.test.ts-mønstret) for
// ALLE filer under src/ og låser to ting:
//   1) ingen query-kæde fra .from("email_send_log") nævner sent_at eller
//      template_id — hverken i select, order eller filter;
//   2) ingen fil der læser email_send_log nævner sent_at overhovedet
//      (heller ikke som felt på en type eller i renderingen).
// template_id kan ikke bandlyses på filniveau: EmailTemplatesView sender
// det legitimt til send-template-email. Derfor kun i kæden.
// email_send_log_legacy har sent_at og template_id med rette og er undtaget.

const ROD = resolve(process.cwd(), "src");
const UNDTAGET = new Set(["src/integrations/supabase/types.ts"]);

function alleKildefiler(dir: string, ud: string[] = []): string[] {
  for (const navn of readdirSync(dir)) {
    const sti = join(dir, navn);
    if (statSync(sti).isDirectory()) {
      if (navn === "__tests__" || navn === "node_modules") continue;
      alleKildefiler(sti, ud);
    } else if (/\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn)) {
      ud.push(sti);
    }
  }
  return ud;
}

const FROM_EMAIL_SEND_LOG = /\.from\(\s*["']email_send_log["']/g;

/** Query-kæderne fra .from("email_send_log"…) til næste .from( eller sætningens `;`. */
function emailSendLogKaeder(kilde: string): string[] {
  const kaeder: string[] = [];
  for (const m of kilde.matchAll(FROM_EMAIL_SEND_LOG)) {
    const rest = kilde.slice(m.index! + 1);
    const naesteFrom = rest.indexOf(".from(");
    const semikolon = rest.indexOf(";");
    const kandidater = [naesteFrom, semikolon].filter((i) => i !== -1);
    kaeder.push(rest.slice(0, kandidater.length ? Math.min(...kandidater) : undefined));
  }
  return kaeder;
}

// Bare `sent_at` — ikke email_sent_at, varsel_1_sendt_at, last_sent_at osv.
const BAR_SENT_AT = /(?<![A-Za-z0-9_])sent_at\b/;

const laesere = alleKildefiler(ROD)
  .map((sti) => ({ sti: relative(process.cwd(), sti), kilde: readFileSync(sti, "utf8") }))
  .filter(({ sti, kilde }) => !UNDTAGET.has(sti) && FROM_EMAIL_SEND_LOG.test(kilde) && (FROM_EMAIL_SEND_LOG.lastIndex = 0) === 0);

describe("email_send_log læses med de kolonner der findes — created_at og template_name", () => {
  it("finder mindst de tre kendte læsere (ellers måler værnet ingenting)", () => {
    const stier = laesere.map((l) => l.sti);
    expect(stier).toContain("src/components/hjemmebane/admin/views/EmailLogView.tsx");
    expect(stier).toContain("src/components/hjemmebane/admin/views/EmailTemplatesView.tsx");
    expect(stier).toContain("src/pages/Members.tsx");
  });

  for (const { sti, kilde } of laesere) {
    it(`${sti}: ingen query-kæde på email_send_log nævner sent_at eller template_id`, () => {
      const kaeder = emailSendLogKaeder(kilde);
      expect(kaeder.length, "hentningen af email_send_log mangler").toBeGreaterThan(0);
      for (const kaede of kaeder) {
        expect(kaede, "sent_at findes ikke i email_send_log — brug created_at").not.toMatch(BAR_SENT_AT);
        expect(kaede, "template_id findes ikke i email_send_log — brug template_name").not.toContain("template_id");
      }
    });

    it(`${sti}: nævner ikke sent_at nogen steder — heller ikke i typen eller renderingen`, () => {
      // Kommentarlinjer må gerne fortælle historien om sent_at; koden må ikke.
      const erKommentar = (l: string) => /^\s*(\/\/|\/\*|\*)/.test(l);
      const linjer = kilde
        .split("\n")
        .map((l, i) => ({ nr: i + 1, l }))
        .filter(({ l }) => !erKommentar(l) && BAR_SENT_AT.test(l));
      expect(linjer, `sent_at findes ikke i email_send_log (linje ${linjer.map((x) => x.nr).join(", ")})`).toEqual([]);
    });
  }
});
