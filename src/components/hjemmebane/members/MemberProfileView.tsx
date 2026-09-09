import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { externalHref, getMemberProfile } from "@/lib/hjemmebane/memberProfile";
import { PROFIL_STI } from "@/lib/hjemmebane/profilUdfyldt";
import {
  PROFIL_FELTER,
  PROFIL_OPFORDRING_LINKTEKST,
  PROFIL_OPFORDRING_TEKST,
  faktalinje,
  manglerSaetning,
  profilensDele,
} from "@/lib/hjemmebane/netvaerksprofil";

/** Medlemsprofilens visningsflade (/medlemmer/:userId) — profilen forfra
    (Jonas 9/9). En side man LÆSER, ikke et skema: husets læse-mønstre
    (analyse-profilen-forfra.md §7) — EventDetails rubrik (eyebrow i rust,
    Fraunces-H1, metalinje), virksomhedssidens «Ord»-blokke (dæmpet
    mikrolabel, teksten i ink, «det er betroet, ikke data»), og portrættet i
    forsidens afsender-udtryk.

    FAKTALINJEN står altid: branche · by · stiftet · medlem siden — uden tal
    («Vi skal IKKE vise tal mellem medlemmer, som de ikke selv har valgt at
    skrive»). Den er automatisk, så en profil aldrig er tom.

    DE TRE FELTER kan være tomme. Andres tomme felter er TAVSE — ingen tomme
    etiketter, ingen tællere, ingen procenter (tom-tilstanden fra 10/8 er
    stadig bærende). Kun EGEN profil får sætningen «Du har ikke skrevet …»
    med link til felterne. Dommen om hvad der mangler bor i
    lib/hjemmebane/netvaerksprofil.ts. */

/** Tilbage-link efter EventDetailViews BackLink-mønster — oversigten
    (/medlemmer) er profilens naturlige "op". */
const BackLink = () => (
  <Link
    to="/medlemmer"
    className="inline-flex items-center gap-1.5 text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
  >
    <ArrowLeft className="h-4 w-4" /> Tilbage til netværket
  </Link>
);

/** Ét felt af medlemmets egne ord — virksomhedssidens «Ord»-form
    (VirksomhedView.tsx): label dæmpet, teksten i ink, linjeskift bevaret. */
const Ord = ({ label, children }: { label: string; children: string }) => (
  <div>
    <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</h2>
    <p className="mt-2 max-w-2xl whitespace-pre-line break-words text-[15px] leading-relaxed text-hb-ink">{children}</p>
  </div>
);

export const MemberProfileView = ({ userId }: { userId: string }) => {
  const { user } = useAuth();

  const profileQuery = useQuery({
    queryKey: ["member-profile", userId],
    queryFn: () => getMemberProfile(userId),
    staleTime: 60_000,
  });

  if (profileQuery.isLoading) {
    return <p className="text-sm text-hb-ink-soft">Henter…</p>;
  }

  if (profileQuery.isError) {
    return (
      <div>
        <BackLink />
        <p className="mt-8 text-sm text-hb-ink-soft">Profilen kunne ikke hentes lige nu.</p>
      </div>
    );
  }

  const profile = profileQuery.data;
  if (!profile) {
    return (
      <div>
        <BackLink />
        <p className="mt-8 text-sm text-hb-ink-soft">Profilen findes ikke.</p>
      </div>
    );
  }

  const isOwn = user?.id === profile.user_id;
  // Faktalinjen: automatisk, uden tal. city/stiftet_aar er undefined indtil
  // migration 20260909150000 er kørt — så står linjen uden de to led.
  const fakta = faktalinje({
    industry_label: profile.industry_label,
    city: profile.city ?? null,
    stiftet_aar: profile.stiftet_aar ?? null,
    member_since: profile.member_since,
  });
  const dele = profilensDele(profile);
  const mangler = isOwn ? manglerSaetning(profile) : null;
  const harNoget = PROFIL_FELTER.some((f) => dele[f.noegle] !== null);
  // externalHref: prod-data mangler ofte protokol (www.brroset.dk), og et
  // <a href="www.brroset.dk"> er en RELATIV sti — klikket ville blive på
  // app.theboardroom.dk i stedet for at føre ud af siden.
  const websiteHref = externalHref(profile.website);
  const linkedinHref = externalHref(profile.linkedin_url);
  const links = [
    websiteHref ? { label: "Website", href: websiteHref } : null,
    linkedinHref ? { label: "LinkedIn", href: linkedinHref } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <section className="max-w-3xl">
      <div className="mb-6">
        <BackLink />
      </div>

      {/* ── Rubrikken (Events-mønstret): eyebrow, portræt + navn, faktalinjen ── */}
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
        Netværket{profile.company_name ? ` · ${profile.company_name}` : ""}
      </p>
      <div className="mt-4 flex items-start gap-6">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.full_name}
            className="h-[72px] w-[72px] shrink-0 rounded-full border border-hb-line object-cover"
          />
        ) : (
          <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-2xl text-hb-ink-soft">
            {profile.full_name.charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
            {profile.full_name}
            {profile.is_advisor && (
              <span className="ml-3 align-middle font-body text-[11px] font-medium uppercase tracking-wide text-hb-ink-soft">
                Rådgiver
              </span>
            )}
          </h1>
          {/* Rådgiver-markeringen er et TILLÆG i rubrikken — aldrig en
              erstatning: en rådgiver der også er medlem beholder sin faktalinje. */}
          {fakta && <p className="mt-3 text-sm text-hb-ink-soft">{fakta}</p>}
        </div>
      </div>

      {/* ── De tre felter som «Ord»-blokke — kun de der er skrevet ── */}
      {harNoget && (
        <div className="mt-10 space-y-8">
          {PROFIL_FELTER.map((f) => {
            const tekst = dele[f.noegle];
            return tekst ? (
              <Ord key={f.noegle} label={f.label}>
                {tekst}
              </Ord>
            ) : null;
          })}
        </div>
      )}

      {/* Egen profil: det der mangler — én rolig sætning, aldrig en
          fejltilstand. Andres tomme felter siger ingenting. */}
      {mangler && (
        <p className={`${harNoget ? "mt-8" : "mt-10"} text-sm text-hb-ink-soft`}>
          {mangler}{" "}
          <Link to={PROFIL_STI} className="text-hb-evergreen underline-offset-4 hover:underline">
            {harNoget ? "Skriv resten" : `${PROFIL_OPFORDRING_TEKST} — ${PROFIL_OPFORDRING_LINKTEKST}`}
          </Link>
        </p>
      )}

      {profile.expertise.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5">
          {profile.expertise.map((tag) => (
            <span key={tag} className="rounded-full bg-hb-sage/30 px-3 py-1 text-xs text-hb-ink">
              {tag}
            </span>
          ))}
        </div>
      )}

      {links.length > 0 && (
        <p className="mt-8 text-sm">
          {links.map((link, i) => (
            <span key={link.label}>
              {i > 0 && <span className="text-hb-ink-soft"> · </span>}
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-hb-evergreen underline-offset-4 hover:underline"
              >
                {link.label}
              </a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
};
