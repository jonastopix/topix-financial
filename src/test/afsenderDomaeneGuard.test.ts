/**
 * Kildeværn: de gamle afsenderdomæner må ikke stå i koden.
 *
 * Lovables opdatering 8/9-2026 flyttede afsenderen til ÉN kilde,
 * supabase/functions/_shared/managedEmail.ts (FROM_DOMAIN = theboardroom.dk,
 * VERIFIED_FROM_EMAIL = noreply@theboardroom.dk). Tre literaler med de gamle
 * domæner blev stående (send-welcome-message:10, EmailTemplatesView:288 og
 * :892) og skrev det gamle domæne ind i nye email_templates-rækker. Ingen af
 * dem var en levende afsender — resolveSenderFromTemplate erstatter alt uden
 * for theboardroom.dk ved afsendelse — men de løj om hvad der sendes, og de
 * fjorten prod-rækker bar dem indtil 8/9 kl. 09:31.
 *
 * Tre ting låses:
 *  1) Ingen KODE under src/ eller supabase/functions/ nævner domænerne
 *     «boardroom.topix.dk» eller «mail.topix.dk». Kommentarer fjernes først
 *     (factsDataBasisGuard-mønstret: kun rigtig kode tæller) — en kommentar
 *     der bogfører historikken kan ikke sende en mail. Kun de to DOMÆNER
 *     rammes: jonas@topix.dk (kontaktvej i fladen, mailto) og
 *     kontakt@topix.dk har domænet topix.dk og matcher ikke.
 *  2) VERIFIED_FROM_EMAIL tildeles kun i managedEmail.ts — ingen anden fil
 *     har sin egen udgave af konstanten.
 *  3) Frontendens standardafsender (EmailTemplatesView, som ikke kan importere
 *     fra functions) er lig med managedEmail.ts' VERIFIED_FROM_EMAIL —
 *     paritet læst ud af kilden, som husets øvrige *Paritet-tests.
 *
 * UNDTAGET med vilje: supabase/migrations/ — 20260226223456 bærer kolonnens
 * DEFAULT 'noreply@boardroom.topix.dk' som historik og må ikke redigeres.
 * Om prod-kolonnens default er ændret, måles i SQL, ikke her.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const GAMLE_DOMAENER = /\b(?:boardroom|mail)\.topix\.dk\b/;
const MANAGED_EMAIL = join(ROOT, "supabase", "functions", "_shared", "managedEmail.ts");
const EDITOR = join(ROOT, "src", "components", "hjemmebane", "admin", "views", "EmailTemplatesView.tsx");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "_test_fixtures") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Alle kildefiler i de to træer — tests undtaget (denne fil nævner selv
    domænerne i sit filhoved). */
function kildefiler(): string[] {
  return [...walk(join(ROOT, "supabase", "functions")), ...walk(join(ROOT, "src"))].filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !/[._]test\.tsx?$/.test(f) &&
      !f.includes(join("src", "test")),
  );
}

/** VERIFIED_FROM_EMAIL som managedEmail.ts definerer den: `noreply@${FROM_DOMAIN}`
    med FROM_DOMAIN slået op i samme fil. Læses fra kilden, så testen følger
    med hvis domænet skifter igen. */
function afsenderFraManagedEmail(): string {
  const src = readFileSync(MANAGED_EMAIL, "utf8");
  const fromDomain = src.match(/export const FROM_DOMAIN\s*=\s*"([^"]+)"/)?.[1];
  const verified = src.match(/export const VERIFIED_FROM_EMAIL\s*=\s*`([^`]+)`/)?.[1];
  expect(fromDomain, "FROM_DOMAIN ikke fundet i managedEmail.ts").toBeTruthy();
  expect(verified, "VERIFIED_FROM_EMAIL ikke fundet i managedEmail.ts").toBeTruthy();
  return verified!.replace("${FROM_DOMAIN}", fromDomain!);
}

describe("afsenderdomæne-kildeværn", () => {
  it("ingen fil i src/ eller supabase/functions/ nævner boardroom.topix.dk eller mail.topix.dk", () => {
    const offenders: string[] = [];
    for (const file of kildefiler()) {
      // Kommentarer strippes, men linjenumrene bevares: blokkommentarer
      // erstattes af lige så mange linjeskift som de fyldte. `//` fjernes kun
      // når det ikke følger et kolon, så «https://…»-strenge overlever —
      // ellers ville et domæne i en URL forsvinde før matchet (falsk negativ).
      const raa = readFileSync(file, "utf8");
      const uden = raa
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      uden.split("\n").forEach((line, i) => {
        if (GAMLE_DOMAENER.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}`);
      });
    }
    expect(
      offenders,
      `Gamle afsenderdomæner i koden (afsenderen er managedEmail.ts' VERIFIED_FROM_EMAIL): ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("kun managedEmail.ts tildeler VERIFIED_FROM_EMAIL", () => {
    const offenders = kildefiler()
      .filter((f) => f !== MANAGED_EMAIL)
      .filter((f) => /\bVERIFIED_FROM_EMAIL\s*=/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(
      offenders,
      `Egen udgave af VERIFIED_FROM_EMAIL uden for managedEmail.ts: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("editorens standardafsender er lig managedEmail.ts' VERIFIED_FROM_EMAIL", () => {
    const editor = readFileSync(EDITOR, "utf8");
    const standard = editor.match(/const STANDARD_AFSENDER_EMAIL\s*=\s*"([^"]+)"/)?.[1];
    expect(standard, "STANDARD_AFSENDER_EMAIL ikke fundet i EmailTemplatesView.tsx").toBeTruthy();
    expect(standard).toBe(afsenderFraManagedEmail());
    // Og begge brugssteder bruger konstanten, ikke en literal.
    expect((editor.match(/sender_email:\s*STANDARD_AFSENDER_EMAIL/g) ?? []).length).toBe(2);
    expect(/sender_email:\s*"[^"]*@/.test(editor)).toBe(false);
  });
});
