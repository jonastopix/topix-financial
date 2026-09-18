/** Tynd linje + «Spørgsmål 3 af 11». Fremdriften er skema.ts' dom, ikke skærmindekset alene. */
export const AnsoegFremdrift = ({ skaerm, ialt, procent }: { skaerm: number; ialt: number; procent: number }) => (
  <div className="space-y-2" aria-label={`Spørgsmål ${skaerm} af ${ialt}`}>
    <div className="flex items-baseline justify-between text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
      <span>
        Spørgsmål {skaerm} af {ialt}
      </span>
      <span aria-hidden="true">{procent} %</span>
    </div>
    <div className="h-1 w-full overflow-hidden rounded-full bg-hb-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={procent}>
      <div className="h-full rounded-full bg-hb-evergreen transition-[width] duration-500" style={{ width: `${procent}%` }} />
    </div>
  </div>
);
