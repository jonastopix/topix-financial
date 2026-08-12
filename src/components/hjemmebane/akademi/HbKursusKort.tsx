import { Link } from "react-router-dom";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbProgressBar } from "./HbProgressBar";

/** Kursuskort til områdesiden — hele kortet linker til kursussiden.

    Bevidst UDEN cover: ingen samling har et cover_path i dag (målt 12.
    august: 0 af 13), og et tomt billedfelt ville gøre kortet svagere
    end det er uden — typografi og struktur bærer. */

interface HbKursusKortProps {
  areaKey: string;
  slug: string;
  titel: string;
  beskrivelse?: string | null;
  antalLektioner: number;
  samletMinutter: number;
  done: number;
  total: number;
}

/** "1 t 24 min" over en time, ellers "24 min"; null ved 0. */
const formatTid = (minutter: number): string | null => {
  if (minutter <= 0) return null;
  if (minutter >= 60) {
    const timer = Math.floor(minutter / 60);
    const rest = minutter % 60;
    return rest > 0 ? `${timer} t ${rest} min` : `${timer} t`;
  }
  return `${minutter} min`;
};

export const HbKursusKort = ({
  areaKey,
  slug,
  titel,
  beskrivelse,
  antalLektioner,
  samletMinutter,
  done,
  total,
}: HbKursusKortProps) => {
  const tid = formatTid(samletMinutter);
  const meta = [
    `${antalLektioner} ${antalLektioner === 1 ? "lektion" : "lektioner"}`,
    tid,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link to={`/akademiet/${areaKey}/${slug}`} className="group block h-full">
      <HbCard className="flex h-full flex-col p-6">
        <h3 className="font-editorial text-2xl font-medium leading-tight text-hb-ink transition-colors group-hover:text-hb-evergreen">
          {titel}
        </h3>
        {beskrivelse && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-hb-ink-soft">
            {beskrivelse}
          </p>
        )}
        <div className="mt-auto pt-5">
          <p className="border-t border-hb-line pt-3 text-xs text-hb-ink-soft">{meta}</p>
          {total > 0 && (
            <div className="mt-3">
              <HbProgressBar done={done} total={total} />
            </div>
          )}
        </div>
      </HbCard>
    </Link>
  );
};
