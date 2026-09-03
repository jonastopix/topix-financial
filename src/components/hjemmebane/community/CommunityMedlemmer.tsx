import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listMemberDirectory, type MemberProfile } from "@/lib/hjemmebane/memberProfile";
import {
  harProfiltekst,
  medlemMetaLinje,
  medlemTeaser,
  ordnMedlemsSpor,
} from "@/lib/hjemmebane/communityMedlemmer";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";

/** Medlemssporet i Community (3/9): Netværket til stede ved siden af
    feedet, så man kan finde tilbage til hinanden. Dommene (hvem, i
    hvilken orden, hvilken tekst) bor i lib/hjemmebane/communityMedlemmer.

    FORMEN er en kompakt række — ikke ProfileCard fra /medlemmer.
    ProfileCard er et grid-kort med teaser og kompetence-chips, bygget
    til tre kolonner i fuld bredde; 26 af dem i en 288 px kolonne ville
    blive højere end feedet og en kopi af /medlemmer. Sporet er en
    LISTE man finder folk i; kortet er der stadig — ét klik væk på
    /medlemmer/{id}. Avataren følger feedets ForfatterAvatar (36 px,
    sage-initial), så de to spor taler samme sprog.

    Data: samme query-nøgle som /medlemmer ("member-directory"), så
    cachen deles og der ikke hentes noget nyt. */

const MedlemAvatar = ({ profile }: { profile: MemberProfile }) =>
  profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full border border-hb-line object-cover"
    />
  ) : (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 font-editorial text-sm text-hb-ink-soft"
    >
      {profile.full_name.charAt(0)}
    </span>
  );

const MedlemRaekke = ({ profile }: { profile: MemberProfile }) => {
  const meta = medlemMetaLinje(profile);
  const teaser = medlemTeaser(profile);
  return (
    <li>
      <Link
        to={`/medlemmer/${profile.user_id}`}
        className="flex items-start gap-3 border-t border-hb-line py-3 transition-colors last:border-b hover:bg-hb-sage/20"
      >
        <MedlemAvatar profile={profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-snug text-hb-ink">{profile.full_name}</p>
          {meta && <p className="truncate text-xs text-hb-ink-soft">{meta}</p>}
          {teaser && <p className="mt-1 text-xs leading-relaxed text-hb-ink-soft">{teaser}</p>}
        </div>
      </Link>
    </li>
  );
};

/** Dit eget kort øverst: din tekst — eller opfordringen til at skrive
    den (MemberProfileViews formulering, samme link til /settings).
    Rolig, aldrig en fejltilstand. */
const MitKort = ({ profile }: { profile: MemberProfile }) => {
  const teaser = medlemTeaser(profile);
  return (
    <HbCard className="mb-4 p-4">
      <div className="flex items-center gap-3">
        <MedlemAvatar profile={profile} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-snug text-hb-ink">{profile.full_name}</p>
          <p className="text-xs text-hb-ink-soft">Sådan ser de andre dig</p>
        </div>
      </div>
      {harProfiltekst(profile) ? (
        <p className="mt-3 text-xs leading-relaxed text-hb-ink-soft">{teaser}</p>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-hb-ink-soft">
          Fortæl de andre hvad du er god til —{" "}
          <Link to="/settings" className="text-hb-evergreen underline-offset-4 hover:underline">
            udfyld din profil
          </Link>
        </p>
      )}
    </HbCard>
  );
};

const RaekkeSkeleton = () => (
  <li className="flex items-center gap-3 border-t border-hb-line py-3 last:border-b" aria-hidden>
    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-hb-line/40" />
    <div className="min-w-0 flex-1">
      <div className="h-3.5 w-1/2 animate-pulse rounded bg-hb-line/60" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-hb-line/40" />
    </div>
  </li>
);

export const CommunityMedlemmer = ({ mitUserId }: { mitUserId: string | null | undefined }) => {
  const directoryQuery = useQuery({
    queryKey: ["member-directory"],
    queryFn: listMemberDirectory,
    staleTime: 5 * 60_000,
  });

  const spor = ordnMedlemsSpor(directoryQuery.data ?? [], mitUserId);

  return (
    <HbSection eyebrow="Medlemmer" linkLabel="Hele netværket" linkTo="/medlemmer" hairline>
      {directoryQuery.isLoading ? (
        <ul className="list-none">
          <RaekkeSkeleton />
          <RaekkeSkeleton />
          <RaekkeSkeleton />
        </ul>
      ) : directoryQuery.isError ? (
        <p className="text-sm text-hb-ink-soft">
          Medlemmerne kunne ikke hentes lige nu.{" "}
          <Link to="/medlemmer" className="text-hb-evergreen underline-offset-4 hover:underline">
            Gå til netværket
          </Link>
        </p>
      ) : (
        <>
          {spor.mig && <MitKort profile={spor.mig} />}
          {spor.andre.length === 0 ? (
            <p className="text-sm text-hb-ink-soft">Der er ikke andre medlemmer endnu.</p>
          ) : (
            <ul className="list-none">
              {spor.andre.map((p) => (
                <MedlemRaekke key={p.user_id} profile={p} />
              ))}
            </ul>
          )}
        </>
      )}
    </HbSection>
  );
};
