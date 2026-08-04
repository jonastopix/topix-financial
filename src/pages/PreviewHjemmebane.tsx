import { useState } from "react";
import "@/styles/hjemmebane.css";
import { HbSidebar, HbSidebarDrawer } from "@/components/hjemmebane/HbSidebar";
import { HbNav } from "@/components/hjemmebane/HbNav";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbVideoCard } from "@/components/hjemmebane/HbVideoCard";
import { HbEpisodeRow } from "@/components/hjemmebane/HbEpisodeRow";
import { HbEventCard } from "@/components/hjemmebane/HbEventCard";
import { HbTag } from "@/components/hjemmebane/HbTag";

/** V0.1 designprøve — "Dit Boardroom": sidebar-navigation + hero i fuld bredde
    + blok-grid (to 2/3+1/3-rækker, fuldbredde-community). Standalone route
    (ingen AppLayout), scoped via .theme-hjemmebane så appen er upåvirket.
    Mobil-rækkefølgen = DOM-rækkefølgen (ingen CSS-order). */
const PreviewHjemmebane = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="theme-hjemmebane min-h-screen bg-hb-paper font-body text-hb-ink antialiased">
      <div className="flex">
        <HbSidebar avatarSrc="/jonas-herlev.png" avatarAlt="Jonas Herlev" userName="Jonas Herlev" />

        <div className="min-w-0 flex-1">
          <HbNav onMenuClick={() => setDrawerOpen(true)} avatarSrc="/jonas-herlev.png" avatarAlt="Jonas Herlev" />

          <main className="mx-auto max-w-[1200px] px-6 py-12 md:py-16">
            {/* Hero: Ugens push — fuld redaktionel bredde, vane-ankeret skrumper ikke */}
            <section className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Ugens push · Uge 32</p>
              <h1 className="mt-4 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
                Halvåret er gjort op — nu handler det om likviditeten i efteråret.
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-hb-ink-soft">
                Juli-tallene tikker ind, og mønsteret er tydeligt: dem der kender deres likviditet tre måneder frem,
                sover bedre og forhandler bedre. I denne uge sætter vi fokus på efterårets pengebinding — og på de to
                deadlines i august, som stadig overrasker alt for mange.
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

            {/* Blok-grid: 6 kolonner (konceptuelt 3), samme asymmetri i begge rækker */}
            <div className="mt-14 grid grid-cols-1 gap-6 md:mt-16 lg:grid-cols-6">
              {/* Række 1: Kommende events (2/3) — øverst i grid'et */}
              <HbSection eyebrow="Kommende events" className="lg:col-span-4">
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

              {/* Række 1: Dit næste skridt (1/3) — den ene handling som fokuspunkt */}
              <HbSection eyebrow="Dit næste skridt" className="lg:col-span-2">
                <HbCard className="flex h-full flex-col items-start gap-4 p-6">
                  <h3 className="font-editorial text-2xl font-medium leading-snug text-hb-ink">Upload dine juli-tal</h3>
                  <p className="text-sm leading-relaxed text-hb-ink-soft">
                    Så er halvåret komplet, og din rådgiver kan se efteråret med dig — inden det starter.
                  </p>
                  <HbButton className="mt-auto">Upload tallene</HbButton>
                </HbCard>
              </HbSection>

              {/* Række 2: Seneste episode (2/3) — mediet får bredden */}
              <HbSection eyebrow="Seneste episode" linkLabel="Alle episoder" linkTo="#" className="lg:col-span-4">
                <HbVideoCard
                  image="/morten-larsen.jpg"
                  imageAlt="Episode 12 — still"
                  title="Episode 12 — Sådan læser du din likviditet tre måneder frem"
                  duration="24 min"
                />
                <div className="mt-6 border-b border-hb-line">
                  <HbEpisodeRow number={11} title="Moms, skat og de skjulte deadlines" duration="19 min" />
                  <HbEpisodeRow number={10} title="Budgettet som styringsværktøj — ikke et gæt" duration="22 min" />
                </div>
              </HbSection>

              {/* Række 2: LinkedIn-highlight (1/3) — pull quote ved siden af mediet */}
              <HbSection eyebrow="Fra LinkedIn" className="lg:col-span-2">
                <HbCard className="flex h-full flex-col p-6">
                  <blockquote className="font-editorial text-xl font-medium leading-snug text-hb-ink">
                    “De fleste SMV’er styrer ikke efter tallene — de styrer efter fornemmelsen og håber, tallene er
                    enige.”
                  </blockquote>
                  <div className="mt-auto flex items-center gap-3 pt-6">
                    <img
                      src="/morten-larsen.jpg"
                      alt="Morten Larsen"
                      className="h-10 w-10 rounded-full border border-hb-line object-cover"
                    />
                    <div className="min-w-0 text-sm leading-tight">
                      <div className="font-medium text-hb-ink">Morten Larsen</div>
                      <HbButton variant="link" className="text-sm">
                        Se opslaget
                      </HbButton>
                    </div>
                  </div>
                </HbCard>
              </HbSection>

              {/* Række 3: Community-glimt (fuld bredde) — stille udgang */}
              <HbSection eyebrow="Fra fællesskabet" linkLabel="Gå til community" linkTo="#" className="lg:col-span-6">
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
            </div>
          </main>
        </div>
      </div>

      <HbSidebarDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        avatarSrc="/jonas-herlev.png"
        avatarAlt="Jonas Herlev"
        userName="Jonas Herlev"
      />
    </div>
  );
};

export default PreviewHjemmebane;
