import "@/styles/hjemmebane.css";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HbMemberShell } from "@/components/hjemmebane/HbMemberShell";
import { HbSpinner } from "@/components/hjemmebane/HbSpinner";

/**
 * /members/:userId → /virksomhed/:companyId — VIDERESTILLINGEN (swappet,
 * raadgiverfladen-design.md §11 pkt. 4, formen afgjort 4/9).
 *
 * Ruten kan ikke forsvinde: målt i prod 4/9 kl. 09:54 bærer 978
 * notifikationer et deep_link til /members/… (604 med ?reportId, 40 med
 * ?handout, 6 med ?section, 328 uden parameter; 150 sendt de sidste 30
 * dage), og to Slack-beskeder sender ABSOLUTTE URL'er ud af huset. Derfor
 * bliver ruten stående og slår virksomheden op ud fra user_id, så alle
 * gamle links og alle fremtidige beskeder virker uden at én edge
 * function ændres. Virksomhedssiden forstår ?reportId, ?handout og
 * ?section (#619, #624), så `search` sendes videre UÆNDRET — siden rydder
 * selv URL'en efter brug (VirksomhedView, deep-link-blokken). `hash`
 * følger også med, som husets øvrige redirects (App.tsx
 * RapporteringRedirect m.fl.: useLocation → Navigate med bevaret
 * search/hash, replace).
 *
 * FORSKELLEN til de fem redirects i App.tsx: de mapper sti til sti uden
 * opslag. Denne skal først slå company_members op — derfor en side med
 * en query, ikke en inline-komponent. `replace`, så tilbageknappen ikke
 * går i ring mellem de to adresser.
 *
 * FLERE VIRKSOMHEDER PR. BRUGER: company_members har kun
 * UNIQUE(company_id, user_id), så en bruger KAN stå i flere. Resten af
 * huset vælger «første række» uden ORDER BY: SQL-funktionen
 * user_company_id() gør `SELECT company_id … WHERE user_id = … LIMIT 1`
 * (migration 20260224222456:36-37), og useAuth.tsx:182-187, MemberDetail
 * (:262-266, :388-392), AppSidebar:175-179 og Settings:140-144 gør alle
 * `.eq("user_id", …).limit(1).maybeSingle()`. VALGT: det samme — samme
 * dom som den gamle side gav for samme URL, så et gammelt link lander
 * hvor det altid har landet. Om nogen i prod faktisk har to rækker, er
 * ikke målt.
 *
 * MemberDetail.tsx står uden aftager efter dette og kan slettes, når
 * viderestillingen er bevist i drift (ét klik fra en gammel
 * notifikation). Ruten kan rulles tilbage med én linje i App.tsx.
 */
const MedlemTilVirksomhed = () => {
  const { userId } = useParams<{ userId: string }>();
  const { search, hash } = useLocation();

  const opslag = useQuery({
    queryKey: ["medlem-til-virksomhed", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.company_id ?? null;
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  if (opslag.isSuccess && opslag.data) {
    return <Navigate to={{ pathname: `/virksomhed/${opslag.data}`, search, hash }} replace />;
  }

  // Ingen virksomhed (ukendt user_id, eller et medlem uden company_members-
  // række) er en TILSTAND, ikke en fejl — som §3.3: virksomheden er
  // aftalen, medlemmet en adgang. Rolig sætning og vejen til listen.
  const ingen = opslag.isSuccess && !opslag.data;

  return (
    <HbMemberShell active="virksomheder">
      {opslag.isError ? (
        <section className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Virksomhed</p>
          <h1 className="mt-3 font-editorial text-3xl font-medium leading-tight text-hb-ink">Opslaget kunne ikke gennemføres.</h1>
          <p className="mt-3 text-sm text-hb-ink-soft">
            Prøv igen om lidt, eller <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">find virksomheden i listen</Link>.
          </p>
        </section>
      ) : ingen ? (
        <section className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Virksomhed</p>
          <h1 className="mt-3 font-editorial text-3xl font-medium leading-tight text-hb-ink">Dette link peger på et medlem uden virksomhed.</h1>
          <p className="mt-3 text-sm text-hb-ink-soft">
            Brugeren findes ikke længere, eller er ikke medlem af nogen virksomhed.{" "}
            <Link to="/virksomheder" className="text-hb-evergreen underline-offset-4 hover:underline">Gå til virksomhederne</Link>
          </p>
        </section>
      ) : (
        <div className="flex items-center gap-3 text-sm text-hb-ink-soft">
          <HbSpinner />
          Finder virksomheden…
        </div>
      )}
    </HbMemberShell>
  );
};

export default MedlemTilVirksomhed;
