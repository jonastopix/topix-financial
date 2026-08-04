import "@/styles/hjemmebane.css";
import { HbNav } from "@/components/hjemmebane/HbNav";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbVideoCard } from "@/components/hjemmebane/HbVideoCard";
import { HbEpisodeRow } from "@/components/hjemmebane/HbEpisodeRow";
import { HbEventCard } from "@/components/hjemmebane/HbEventCard";
import { HbTag } from "@/components/hjemmebane/HbTag";

/** V0 designprøve — "puls"-miljøet som statisk forside.
    Standalone route (ingen AppLayout): den lyse identitet vises isoleret,
    scoped via .theme-hjemmebane så resten af appen er upåvirket. */
const PreviewHjemmebane = () => (
  <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased">
    {/* 1. Nav */}
    <HbNav avatarSrc="/jonas-herlev.png" avatarAlt="Jonas Herlev" />

    <main className="mx-auto max-w-[1120px] space-y-16 px-6 py-12 md:space-y-24 md:py-16">
      {/* 2. Ugens puls — tekst-hero direkte på papiret */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Ugens puls · Uge 32</p>
        <h1 className="mt-4 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Halvåret er gjort op — nu handler det om likviditeten i efteråret.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-hb-ink-soft">
          Juli-tallene tikker ind, og mønsteret er tydeligt: dem der kender deres likviditet tre måneder frem, sover
          bedre og forhandler bedre. I denne uge sætter vi fokus på efterårets pengebinding — og på de to deadlines i
          august, som stadig overrasker alt for mange.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <img
            src="/jonas-herlev.png"
            alt="Jonas Herlev"
            className="h-10 w-10 rounded-full border border-hb-line object-cover"
          />
          <div className="text-sm">
            <span className="font-medium text-hb-ink">Jonas Herlev</span>
            <span className="text-hb-ink-soft"> · 4. august 2026</span>
          </div>
        </div>
      </section>

      {/* 3. Dit næste skridt — ét kort, én handling */}
      <HbSection eyebrow="Dit næste skridt">
        <HbCard className="flex flex-col items-start gap-5 p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-editorial text-2xl font-medium leading-snug text-hb-ink">Upload dine juli-tal</h3>
            <p className="mt-1 text-hb-ink-soft">
              Så er halvåret komplet, og din rådgiver kan se efteråret med dig — inden det starter.
            </p>
          </div>
          <HbButton className="shrink-0">Upload tallene</HbButton>
        </HbCard>
      </HbSection>

      {/* 4. Seneste episode — stor afspiller-flade + episode-liste */}
      <HbSection eyebrow="Seneste episode" linkLabel="Alle episoder" linkTo="#">
        <HbVideoCard
          image="/morten-larsen.jpg"
          imageAlt="Episode 12 — still"
          title="Episode 12 — Sådan læser du din likviditet tre måneder frem"
          duration="24 min"
        />
        <div className="mt-8 border-b border-hb-line">
          <HbEpisodeRow number={11} title="Moms, skat og de skjulte deadlines" duration="19 min" />
          <HbEpisodeRow number={10} title="Budgettet som styringsværktøj — ikke et gæt" duration="22 min" />
        </div>
      </HbSection>

      {/* 5. LinkedIn-highlight — citat-kort */}
      <HbSection eyebrow="Fra LinkedIn">
        <HbCard className="p-8 md:p-10">
          <blockquote className="font-editorial text-2xl font-medium leading-snug text-hb-ink md:text-3xl">
            “De fleste SMV’er styrer ikke efter tallene — de styrer efter fornemmelsen og håber, tallene er enige.”
          </blockquote>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/morten-larsen.jpg"
                alt="Morten Larsen"
                className="h-10 w-10 rounded-full border border-hb-line object-cover"
              />
              <div className="text-sm">
                <span className="font-medium text-hb-ink">Morten Larsen</span>
                <span className="text-hb-ink-soft"> · The Boardroom</span>
              </div>
            </div>
            <HbButton variant="link">Se opslaget</HbButton>
          </div>
        </HbCard>
      </HbSection>

      {/* 6. Kommende events — to kort side om side */}
      <HbSection eyebrow="Kommende events">
        <div className="grid gap-6 md:grid-cols-2">
          <HbEventCard
            day="27"
            month="Aug"
            title="Kvartalswebinar: Efterårets likviditet"
            meta="Online · 09.00–10.00 · Jonas & Morten"
          />
          <HbEventCard
            day="10"
            month="Sep"
            title="Boardroom-morgenmøde i Aarhus"
            meta="Fysisk · 08.00–10.00 · Begrænsede pladser"
          />
        </div>
      </HbSection>

      {/* 7. Community-glimt — én rolig række */}
      <HbSection eyebrow="Fra fællesskabet" linkLabel="Gå til community" linkTo="#">
        <div className="grid gap-6 md:grid-cols-3">
          <HbCard className="p-6">
            <HbTag>Likviditet</HbTag>
            <p className="mt-4 text-sm leading-relaxed text-hb-ink">
              “Rykkede min momsafregning til kvartal efter sidste webinar — det gav ro i juli.”
            </p>
          </HbCard>
          <HbCard className="p-6">
            <HbTag>Skat</HbTag>
            <p className="mt-4 text-sm leading-relaxed text-hb-ink">
              “Nogen der har erfaring med acontoskat-nedsættelse, når halvåret ligger under budget?”
            </p>
          </HbCard>
          <HbCard className="p-6">
            <HbTag>Community</HbTag>
            <p className="mt-4 text-sm leading-relaxed text-hb-ink">
              “Tak for sparringen i Aarhus — tre af jer fik mig talt fra en dyr leasingaftale.”
            </p>
          </HbCard>
        </div>
      </HbSection>
    </main>
  </div>
);

export default PreviewHjemmebane;
