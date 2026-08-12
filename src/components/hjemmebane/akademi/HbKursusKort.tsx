import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
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
  const erGennemfoert = total > 0 && done >= total;
  // Metalinjens faste led — det sidste led (fremdrift/Gennemført) har
  // sin egen klasse og renderes separat nedenfor.
  const metaDele = [
    `${antalLektioner} ${antalLektioner === 1 ? "lektion" : "lektioner"}`,
    tid,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link to={`/akademiet/${areaKey}/${slug}`} className="group block h-full">
      {/* Naturlig højde — ingen mt-auto/h-full-udfyldning indeni: et
          kort uden beskrivelse skal være LAVT, ikke strakt med tomrum.
          Grid'ets items-stretch (default) sørger for at rækkerne
          flugter. Set i produktion 12/8: ingen af de 13 samlinger har
          en beskrivelse, så strakte kort var titel → tomrum → bund. */}
      <HbCard
        className={cn(
          "p-6",
          /* Evergreen-venstrekanten er den ENESTE farveflade på et
             gennemført kort — ingen badge, ingen farvet baggrund, i
             tråd med HbProgressBars "ingen procenter, ingen badges".
             Titel, luft og hairline er uændrede: kortet ser ud som de
             øvrige, bare tydeligvis lukket. */
          erGennemfoert && "border-l-2 border-l-hb-evergreen",
        )}
      >
        <h3 className="font-editorial text-[26px] font-medium leading-tight text-hb-ink transition-colors group-hover:text-hb-evergreen">
          {titel}
        </h3>
        {beskrivelse && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-hb-ink-soft">
            {beskrivelse}
          </p>
        )}
        <p className="mt-4 border-t border-hb-line pt-3 text-xs text-hb-ink-soft">
          {metaDele}
          {erGennemfoert ? (
            <>
              {" · "}
              <span className="font-medium text-hb-evergreen">Gennemført</span>
            </>
          ) : done > 0 ? (
            <>
              {" · "}
              {done} af {total} gennemført
            </>
          ) : null}
        </p>
        {/* En bjælke på nul er støj, ikke information — den dukker op i
            det øjeblik der er noget at vise. Og ved GENNEMFØRT udelades
            den igen: "Gennemført" i metalinjen siger det hele, og en
            fuld bjælke oven i er gentagelse. */}
        {done > 0 && !erGennemfoert && (
          <div className="mt-3">
            <HbProgressBar done={done} total={total} />
          </div>
        )}
      </HbCard>
    </Link>
  );
};
