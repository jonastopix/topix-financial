/**
 * raadgiverBesked — én besked til alle rådgivere i klokken, i VAGTENS form
 * (10/9, recon-penge-og-roller.md §3).
 *
 * Vagten (vagt_cron, migration 20260910140000:267-279) skriver i plpgsql og
 * kan ikke kaldes fra Deno — men dens FORM genbruges her, ordret i logik:
 *   - rådgiverne er SELECT DISTINCT user_id FROM user_roles WHERE role IN
 *     ('advisor','admin');
 *   - ÉN række pr. rådgiver med advisor_id sat (RLS 20260421061016 viser
 *     advisor_id = auth.uid() OR advisor_id IS NULL), så «læst» er den
 *     enkeltes — læser Jonas beskeden, står den stadig hos Morten;
 *   - dedup med NOT EXISTS før insert: samme advisor_id + type + reference
 *     (reference_id, eller titlen når referencen mangler) giver ikke to.
 * De fem ældre edge-writere (send-slack-*, run-company-agent) skriver én
 * fælles række uden advisor_id; den form deles ikke her, netop pga. «læst».
 *
 * advisor_notifications.member_id er NOT NULL: sendes ingen member_id, står
 * rådgiveren selv dér — som vagten gør det.
 *
 * KASTER ALDRIG. En besked må aldrig koste den handling der udløste den
 * (en betaling, en periode). Fejl logges og tælles i svaret.
 *
 * Teksterne er rene funktioner nederst — testet i
 * src/lib/__tests__/raadgiverBesked.test.ts.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { raadgivereUdenRaekke, type EksisterendeRaekke } from "./raadgiverBeskedTekst.ts";

// Teksterne og dedup-dommen er rene og bor i raadgiverBeskedTekst.ts (så
// vitest kan importere dem uden Supabase-klienten). Genudstilles her, så
// kalderne har ét sted at importere fra.
export {
  dubletBeskedTekst,
  fornyelsesBeskedTekst,
  raadgivereUdenRaekke,
  TYPE_FORNYELSE_BETALT,
  TYPE_FORNYELSE_DUBLET,
} from "./raadgiverBeskedTekst.ts";

export interface RaadgiverBesked {
  type: string;
  title: string;
  body?: string | null;
  company_id?: string | null;
  /** Hvem udløste den. Mangler den, står rådgiveren selv (kolonnen er NOT NULL). */
  member_id?: string | null;
  reference_type?: string | null;
  /** UUID — kolonnen er uuid. Et Stripe-id kan IKKE stå her. */
  reference_id?: string | null;
}

export interface RaadgiverBeskedResultat {
  raadgivere: number;
  skrevet: number;
  fandtes: number;
  fejl: string[];
}

export async function skrivRaadgiverBesked(
  admin: SupabaseClient,
  besked: RaadgiverBesked,
): Promise<RaadgiverBeskedResultat> {
  const resultat: RaadgiverBeskedResultat = { raadgivere: 0, skrevet: 0, fandtes: 0, fejl: [] };
  const log = `[raadgiverBesked] ${besked.type}`;
  try {
    const { data: roller, error: rolleFejl } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["advisor", "admin"]);
    if (rolleFejl) {
      resultat.fejl.push(`user_roles: ${rolleFejl.message}`);
      console.error(`${log}: rådgiveropslag fejlede — ingen besked skrevet:`, rolleFejl.message);
      return resultat;
    }
    const raadgivere: string[] = [...new Set(((roller ?? []) as { user_id: string }[]).map((r) => r.user_id))];
    resultat.raadgivere = raadgivere.length;
    if (raadgivere.length === 0) return resultat;

    let q = admin
      .from("advisor_notifications")
      .select("advisor_id, reference_id, title")
      .eq("type", besked.type)
      .in("advisor_id", raadgivere);
    q = besked.reference_id ? q.eq("reference_id", besked.reference_id) : q.eq("title", besked.title);
    const { data: eksisterende, error: eksFejl } = await q;
    if (eksFejl) {
      // Kan vi ikke se om den findes, skriver vi ikke — hellere én besked
      // for lidt end en dublet i klokken. Det står i loggen.
      resultat.fejl.push(`advisor_notifications-opslag: ${eksFejl.message}`);
      console.error(`${log}: dedup-opslag fejlede — ingen besked skrevet:`, eksFejl.message);
      return resultat;
    }

    const mangler = raadgivereUdenRaekke(raadgivere, (eksisterende ?? []) as EksisterendeRaekke[], besked);
    resultat.fandtes = raadgivere.length - mangler.length;
    if (mangler.length === 0) return resultat;

    const raekker = mangler.map((advisorId) => ({
      type: besked.type,
      title: besked.title,
      body: besked.body ?? null,
      company_id: besked.company_id ?? null,
      member_id: besked.member_id ?? advisorId,
      advisor_id: advisorId,
      reference_type: besked.reference_type ?? null,
      reference_id: besked.reference_id ?? null,
    }));
    const { error: insertFejl } = await admin.from("advisor_notifications").insert(raekker);
    if (insertFejl) {
      resultat.fejl.push(`insert: ${insertFejl.message}`);
      console.error(`${log}: insert fejlede:`, insertFejl.message);
      return resultat;
    }
    resultat.skrevet = raekker.length;
    return resultat;
  } catch (err) {
    resultat.fejl.push(err instanceof Error ? err.message : String(err));
    console.error(`${log}: uventet fejl:`, err);
    return resultat;
  }
}
