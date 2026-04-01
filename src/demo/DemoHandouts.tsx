import { useState } from "react";
import {
  Compass, Calculator, Settings, Handshake, Megaphone,
  CheckCircle2, ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronUp, Lightbulb,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ModuleKey = "overordnet" | "bogholderi" | "administration" | "salg" | "marketing";

interface ModuleMeta {
  key: ModuleKey;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  status: "completed" | "in_progress" | "not_started";
  progress: number;
  completedAt?: string;
  sections: { title: string; qa: { q: string; a: string }[] }[];
  checklist?: { label: string; done: boolean }[];
  tips?: string[];
}

const MODULES: ModuleMeta[] = [
  {
    key: "overordnet",
    title: "Målsætning 12 mdr.",
    subtitle: "Dit overordnede mål for forretningen",
    icon: Compass,
    status: "completed",
    progress: 100,
    completedAt: "2025-10-05",
    tips: [
      "Klare mål øger sandsynligheden for succes markant.",
      "Definer 1–3 nøgletal der fortæller dig, om du er på rette kurs.",
    ],
    sections: [
      {
        title: "Nuværende situation",
        qa: [
          { q: "Hvad er din nuværende situation i forretningen?", a: "Vi er en bootstrappet SaaS-virksomhed med 42 betalende kunder og en MRR på 342.000 kr. Væksten er organisk og drevet af indhold og SEO." },
          { q: "Hvor meget arbejder du på nuværende tidspunkt?", a: "Ca. 50–55 timer om ugen. For meget tid går til support og ad-hoc opgaver." },
          { q: "Hvad er du utilfreds over ved din nuværende situation?", a: "Manglende delegering. Jeg er flaskehalsen i for mange processer." },
          { q: "Hvad er den største flaskehals lige nu?", a: "Manglende Customer Success-funktion — vi mister kunder vi godt kunne have fastholdt." },
        ],
      },
      {
        title: "Mål for din forretning",
        qa: [
          { q: "Hvad er dit mål med din forretning?", a: "Nå 500.000 kr. MRR inden udgangen af 2026 og ansætte to nøglepersoner, så jeg kan trække mig fra den daglige drift." },
          { q: "Om 12 måneder er vi lykkedes, hvis…", a: "MRR er over 500.000 kr., churn er under 1%, og vi har en CSM ansat og onboardet." },
          { q: "Hvad er den vigtigste indikator på, at vi er på ret vej?", a: "MRR-vækst over 8% månedligt og churn under 1,2%." },
        ],
      },
    ],
  },
  {
    key: "bogholderi",
    title: "Bogholderi",
    subtitle: "Få styr på dine tal og økonomistyring",
    icon: Calculator,
    status: "in_progress",
    progress: 60,
    tips: [
      "Ajourført bogholderi giver dig rettidigt overblik — og sparer tid hos revisor.",
      "Opdel altid privat og erhverv fuldstændig.",
    ],
    checklist: [
      { label: "Bogholderisystem opsat og tilsluttet bankkonto", done: true },
      { label: "Månedlig afstemning gennemført", done: true },
      { label: "Moms indberettet til tiden", done: true },
      { label: "Lønseddel til dig selv oprettet korrekt", done: false },
      { label: "Årsregnskab sendt til revisor", done: false },
    ],
    sections: [
      {
        title: "Din nuværende situation",
        qa: [
          { q: "Hvem håndterer dit bogholderi?", a: "Jeg gør det selv i Billy. Bruger ca. 3 timer om måneden." },
          { q: "Hvad er dine største udfordringer med bogholderiet?", a: "Jeg er bagud med moms og har ikke fået sat lønsedler korrekt op." },
        ],
      },
    ],
  },
  {
    key: "administration",
    title: "Administration",
    subtitle: "Systemer og processer der frigiver tid",
    icon: Settings,
    status: "in_progress",
    progress: 25,
    tips: [
      "Dokumentér ét kerneprocess om måneden — det frigiver tid og letter oplæring.",
      "Automatisering betaler sig hurtigt ved repetitive opgaver.",
    ],
    checklist: [
      { label: "CRM-system implementeret", done: true },
      { label: "Projektledelsesværktøj i brug", done: false },
      { label: "Standardiserede kontrakter og aftaler", done: false },
      { label: "GDPR-dokumentation opdateret", done: false },
    ],
    sections: [
      {
        title: "Nuværende processer",
        qa: [
          { q: "Hvilke administrative systemer bruger du i dag?", a: "Billy til regnskab, Notion til projekter og Gmail. Intet er rigtigt integreret." },
        ],
      },
    ],
  },
  {
    key: "salg",
    title: "Salg",
    subtitle: "Din salgsstrategi og pipeline",
    icon: Handshake,
    status: "not_started",
    progress: 0,
    tips: [
      "Definer din ideelle kundeprofil (ICP) præcist — det skærper al salgsaktivitet.",
      "Track din konverteringsrate fra lead til betalt kunde.",
    ],
    checklist: [],
    sections: [{ title: "Salgsproces", qa: [] }],
  },
  {
    key: "marketing",
    title: "Marketing",
    subtitle: "Tiltrækningsstrategier og brand",
    icon: Megaphone,
    status: "not_started",
    progress: 0,
    tips: [
      "Fokusér på én kanal og mestre den — hellere 80% på én end 20% på fem.",
      "Mål cost per lead og cost per acquisition konsekvent.",
    ],
    checklist: [],
    sections: [{ title: "Nuværende marketing", qa: [] }],
  },
];

const statusMap = {
  completed: { label: "Gennemført ✓", variant: "default" as const },
  in_progress: { label: "I gang", variant: "secondary" as const },
  not_started: { label: "Ikke startet", variant: "outline" as const },
};

function ModuleCard({ mod, onClick }: { mod: ModuleMeta; onClick: () => void }) {
  const Icon = mod.icon;
  const s = statusMap[mod.status];
  return (
    <button onClick={onClick} className="glass-card rounded-xl p-5 text-left hover:ring-2 hover:ring-primary/30 transition-all w-full">
      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <Badge variant={s.variant}>
          {mod.status === "in_progress" ? `I gang · ${mod.progress}%` : s.label}
        </Badge>
      </div>
      <h3 className="font-semibold text-foreground mb-1">{mod.title}</h3>
      <p className="text-sm text-muted-foreground mb-3">{mod.subtitle}</p>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Udfyldt</span>
          <span>{mod.progress}%</span>
        </div>
        <Progress value={mod.progress} className="h-1.5" />
      </div>
      {mod.status === "completed" && mod.completedAt && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span>
            Udfyldt{" "}
            {new Date(mod.completedAt).toLocaleDateString("da-DK", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        </div>
      )}
    </button>
  );
}

function SectionBlock({ section }: { section: ModuleMeta["sections"][0] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <h3 className="font-semibold text-foreground">{section.title}</h3>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {section.qa.map((item) => (
            <div key={item.q} className="space-y-1">
              <p className="text-sm font-medium text-foreground">{item.q}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
            </div>
          ))}
          {section.qa.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Ikke udfyldt endnu.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleDetail({ mod, onBack }: { mod: ModuleMeta; onBack: () => void }) {
  const Icon = mod.icon;
  const s = statusMap[mod.status];
  const completedChecks = mod.checklist?.filter((c) => c.done).length ?? 0;
  const totalChecks = mod.checklist?.length ?? 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Alle handouts
      </Button>

      <div className="glass-card rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-foreground">{mod.title}</h1>
              <Badge variant={s.variant}>
                {mod.status === "in_progress" ? `I gang · ${mod.progress}%` : s.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{mod.subtitle}</p>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Fremgang</span>
                <span>{mod.progress}%</span>
              </div>
              <Progress value={mod.progress} className="h-1.5" />
            </div>
          </div>
        </div>
      </div>

      {mod.tips && mod.tips.length > 0 && (
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <Lightbulb className="h-4 w-4 text-amber-500" />
            </div>
            <div className="space-y-1.5">
              {mod.tips.map((t) => (
                <p key={t} className="text-sm text-muted-foreground">{t}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {mod.checklist && mod.checklist.length > 0 && (
        <div className="glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Tjekliste</h2>
            <span className="text-xs text-muted-foreground">{completedChecks} / {totalChecks}</span>
          </div>
          <div className="space-y-2">
            {mod.checklist.map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-1">
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${item.done ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                  {item.done && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />}
                </div>
                <span className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mod.sections.map((section) => (
        <SectionBlock key={section.title} section={section} />
      ))}

      {mod.status === "not_started" && (
        <div className="glass-card rounded-xl p-8 text-center space-y-3">
          <BookOpen className="h-10 w-10 text-muted-foreground/50 mx-auto" />
          <h3 className="font-semibold text-foreground">Endnu ikke påbegyndt</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Dette modul er ikke startet endnu. I den rigtige platform udfylder du spørgsmålene her og deler dem med din rådgiver.
          </p>
        </div>
      )}
    </div>
  );
}

export default function DemoHandouts() {
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);

  const completed = MODULES.filter((m) => m.status === "completed").length;
  const nextModule = MODULES.find((m) => m.status !== "completed");
  const pct = Math.round((completed / MODULES.length) * 100);
  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  if (activeModule) {
    const mod = MODULES.find((m) => m.key === activeModule)!;
    return <ModuleDetail mod={mod} onBack={() => setActiveModule(null)} />;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Handouts</h1>
      </div>

      <div className="glass-card rounded-xl p-5 flex items-center gap-5">
        <div className="relative h-[76px] w-[76px] shrink-0">
          <svg width="76" height="76" className="-rotate-90">
            <circle cx="38" cy="38" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
            <circle cx="38" cy="38" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-700" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-foreground">{pct}%</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground">
            {completed} af {MODULES.length} moduler gennemført
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {nextModule ? `Næste: ${nextModule.title}` : "Alle moduler er gennemført 🎉"}
          </p>
          {nextModule && (
            <button
              onClick={() => setActiveModule(nextModule.key)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Fortsæt <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => (
          <ModuleCard key={mod.key} mod={mod} onClick={() => setActiveModule(mod.key)} />
        ))}
      </div>
    </div>
  );
}
