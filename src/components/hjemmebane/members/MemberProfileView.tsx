import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { externalHref, getMemberProfile } from "@/lib/hjemmebane/memberProfile";

/** Medlemsprofilens visningsflade (/medlemmer/:userId). Tom-tilstanden
    er bærende: en uudfyldt profil må ALDRIG ligne en fejl — vis kun det
    der findes, ingen tomme etiketter, ingen tællere, ingen procenter.
    Navn + virksomhed er altid nok til en hel side. Egen tomme profil får
    en rolig opfordring med link til Indstillinger. */

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
  // Rådgiver-markeringen er et TILLÆG i rubrikken — aldrig en erstatning:
  // en rådgiver der også er medlem beholder virksomhed og branche.
  const metaLine = [profile.company_name, profile.industry_label].filter(Boolean).join(" · ");
  const hasPersonalContent =
    !!profile.bio || profile.expertise.length > 0 || !!profile.linkedin_url;
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

      {/* Portrættet: forsidens afsender-udtryk (BoardroomView) i fuld
          størrelse — samme ramme, samme sage-fallback med initial. */}
      <div className="flex items-start gap-6">
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
          {metaLine && <p className="mt-3 text-sm text-hb-ink-soft">{metaLine}</p>}
        </div>
      </div>

      {profile.bio && (
        <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-hb-ink">{profile.bio}</p>
      )}

      {profile.expertise.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5">
          {profile.expertise.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-hb-sage/30 px-3 py-1 text-xs text-hb-ink"
            >
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

      {/* Egen, tom profil: rolig opfordring — aldrig en fejltilstand. */}
      {isOwn && !hasPersonalContent && (
        <p className="mt-8 text-sm text-hb-ink-soft">
          Fortæl de andre hvad du er god til —{" "}
          <Link to="/settings" className="text-hb-evergreen underline-offset-4 hover:underline">
            udfyld din profil
          </Link>
        </p>
      )}
    </section>
  );
};
