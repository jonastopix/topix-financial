import { Link } from "react-router-dom";
import type { MemberProfile } from "@/lib/hjemmebane/memberProfile";
import {
  EGET_KORT_LINKTEKST,
  EGET_KORT_LINK_TO,
  EGET_KORT_NAVN,
  EGET_KORT_TOM_TEKST,
  HJAELPERE_EYEBROW,
  HJAELPERE_LINK_LABEL,
  HJAELPERE_LINK_TO,
  SPOERG_MIG_OM_PRAEFIKS,
  hjaelperLinje,
  vaelgHjaelpere,
  visHjaelpere,
} from "@/lib/hjemmebane/communityHjaelpere";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";

/** «Hvem kan hjælpe med …» (2/10-2026): højst tre «Spørg mig om»-kort
    under feedet plus læserens eget kort. Hvem og i hvilken orden dømmes i
    lib/hjemmebane/communityHjaelpere; data er Netværkets egne rækker
    (samme query-nøgle som medlemssporet, "member-directory" — intet nyt
    kald). Rådgivere ser kun de andres kort (eget kort kun for et medlem).
    Fail-soft: uden data (henter/fejlet) tegnes intet — sektionen er et
    tilbud, ikke en tilstand. */

const Avatar = ({ profile }: { profile: Pick<MemberProfile, "full_name" | "avatar_url"> }) =>
  profile.avatar_url ? (
    <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full border border-hb-line object-cover" />
  ) : (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft"
    >
      {profile.full_name.charAt(0)}
    </span>
  );

export const HvemKanHjaelpe = ({
  profiler,
  mitUserId,
  nu,
}: {
  profiler: readonly MemberProfile[] | undefined;
  mitUserId: string | null | undefined;
  nu: Date;
}) => {
  if (!profiler) return null;
  const h = vaelgHjaelpere(profiler, mitUserId, nu);
  if (!visHjaelpere(h)) return null;
  const minLinje = h.mig ? hjaelperLinje(h.mig) : null;
  return (
    <HbSection eyebrow={HJAELPERE_EYEBROW} linkLabel={HJAELPERE_LINK_LABEL} linkTo={HJAELPERE_LINK_TO} hairline className="mt-14">
      <ul className="grid list-none gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {h.andre.map((p) => (
          <li key={p.user_id}>
            <Link to={`/medlemmer/${p.user_id}`} className="block h-full">
              <HbCard className="flex h-full items-start gap-3 p-4">
                <Avatar profile={p} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-snug text-hb-ink">{p.full_name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-hb-ink-soft">
                    {SPOERG_MIG_OM_PRAEFIKS} <span className="font-medium text-hb-ink">{hjaelperLinje(p)}</span>
                  </p>
                </div>
              </HbCard>
            </Link>
          </li>
        ))}
        {h.mig && (
          <li data-hjaelper="mig">
            <HbCard className="flex h-full items-start gap-3 border-dashed p-4">
              <Avatar profile={h.mig} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-snug text-hb-ink">{EGET_KORT_NAVN}</p>
                {minLinje ? (
                  <p className="mt-1 text-xs leading-relaxed text-hb-ink-soft">
                    {SPOERG_MIG_OM_PRAEFIKS} <span className="font-medium text-hb-ink">{minLinje}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-hb-ink-soft">
                    {EGET_KORT_TOM_TEKST}{" "}
                    <Link to={EGET_KORT_LINK_TO} className="text-hb-rust underline-offset-4 hover:underline">
                      {EGET_KORT_LINKTEKST} →
                    </Link>
                  </p>
                )}
              </div>
            </HbCard>
          </li>
        )}
      </ul>
    </HbSection>
  );
};
