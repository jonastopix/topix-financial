import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, FileText, TrendingUp, Calculator, Target,
  BookOpen, MessageCircle, Sparkles, Heart, Users, Upload,
  ChevronRight, CheckCircle2, AlertTriangle, BarChart3,
  Send, Bell, ClipboardList, UserCog, Zap, Info, Mail, CheckCheck, BookMarked
} from "lucide-react";

/* ── Founder data ── */

const founderFeatures = [
  {
    icon: FileText, title: "Rapportering", path: "/reports#upload",
    color: "text-primary", bg: "bg-primary/10",
    desc: "Upload din månedlige saldobalance eller resultatopgørelse. AI trækker tallene ud automatisk.",
    tips: [
      "Understøtter PDF og Excel fra de fleste danske regnskabssystemer",
      "Godkend tallene med ét klik når AI har behandlet rapporten",
      "Upload din årsrapport fra revisor (PDF) for at berige historiske data — tallene fordeles automatisk over 12 måneder",
    ],
  },
  {
    icon: TrendingUp, title: "KPI'er", path: "/kpis#goals",
    color: "text-chart-info", bg: "bg-chart-info/10",
    desc: "Se dine vigtigste nøgletal: omsætning, margin, resultat og likviditet — med trend og branchesammenligning.",
    tips: ["Sæt mål for hvert KPI og følg din fremgang", "Sammenlign med branchesnittet for din sektor", "Download en PDF-rapport til investorer eller bestyrelse"],
  },
  {
    icon: Calculator, title: "Budget", path: "/budget#forecast",
    color: "text-chart-warning", bg: "bg-chart-warning/10",
    desc: "Byg dit årsbudget og følg om du rammer dine mål — omsætning, EBITDA og cashflow.",
    tips: ["Vælg en brancheskabelon som udgangspunkt", "Se budget vs. realiseret for hver måned under 'Budget vs. Realiseret'", "Brug 'Hvad-hvis?'-fanen til at simulere effekten af at ansætte eller investere"],
  },
  {
    icon: Target, title: "Milestones", path: "/milestones",
    color: "text-chart-warning", bg: "bg-chart-warning/10",
    desc: "Definer dine vigtigste mål og følg fremgangen. Rådgiverne kan se og kommentere dine milestones.",
    tips: ["Sæt deadlines og opdatér fremgang løbende", "Park idéer i køleskabet — de forsvinder ikke men forstyrrer ikke overblikket", "Milestones fra Handouts tilføjes automatisk"],
  },
  {
    icon: BookOpen, title: "Handouts", path: "/handouts",
    color: "text-chart-positive", bg: "bg-chart-positive/10",
    desc: "5 strategiske moduler der hjælper dig med at strukturere din forretning — fra målsætning til salg og marketing.",
    tips: ["Start med 'Målsætning 12 mdr.' for at sætte retningen", "Hvert modul tager 30-60 minutter at gennemføre", "Når du har udfyldt et modul, kan du få AI-sparring på dine svar"],
  },
  {
    icon: MessageCircle, title: "Chat med rådgiver", path: "/chat",
    color: "text-chart-info", bg: "bg-chart-info/10",
    desc: "Din direkte linje til dine rådgivere. De læser dine tal og er klar til sparring.",
    tips: ["Skriv hvad du har på hjerte — spørgsmål, opdateringer eller bare hvad der fylder", "Brug emnefiltre: rapport, handout, milestone, budget, sparring", "Klik 'Følg op senere' hvis du vil have en reminder fra rådgiveren"],
  },
  {
    icon: Sparkles, title: "Finansiel AI & AI-chef", path: "/chat?tab=ai",
    color: "text-primary", bg: "bg-primary/10",
    desc: "Din personlige AI-chef kender dine tal, milestones og handouts. Stil spørgsmål om din forretning eller spørg hvad du skal fokusere på denne uge.",
    tips: ["Prøv: 'Hvad skal jeg fokusere på denne uge?'", "Prøv: 'Hvad driver mine udgifter?'", "Ugens fokus på dit dashboard er genereret af AI-chefen automatisk hver mandag"],
  },
  {
    icon: BookMarked, title: "Historiske årsrapporter", path: "/reports#annual-reports",
    color: "text-primary", bg: "bg-primary/10",
    desc: "Upload din årsrapport fra revisor som PDF. AI læser tallene og fordeler dem over årets 12 måneder — giver dine KPI-grafer historisk kontekst.",
    tips: [
      "Understøtter årsrapporter fra BDO, Deloitte, PWC, KPMG og lokale revisorer",
      "Upload 2024 og 2025 for at se din historiske udvikling i graferne",
      "Måneder med rigtige committede rapporter overskrives ikke",
    ],
  },
  {
    icon: BarChart3, title: "Virksomhedens sundhed", path: "/",
    color: "text-chart-positive", bg: "bg-chart-positive/10",
    desc: "En samlet score for din forretning baseret på vækst, margin, resultat og likviditet.",
    tips: ["Grøn = over benchmark, rød = under", "Opdateres automatisk ved ny rapport", "Hover på (i)-ikonet for at se hvad der tæller"],
  },
];

const founderTimeline = [
  { week: "Månedligt", title: "Upload rapport", desc: "Eksportér saldobalance fra e-conomic, Dinero eller Billy og upload den under Rapportering. Systemet genkender typen automatisk og AI trækker tallene ud.", icon: Upload, color: "bg-primary/10 text-primary", link: "/reports#upload" },
  { week: "Månedligt", title: "Refleksion", desc: "Brug 2 minutter på at fortælle os hvad der gik godt og hvad der er svært. Det er den hurtigste måde at give rådgiverne kontekst til god sparring.", icon: Heart, color: "bg-chart-warning/10 text-chart-warning", link: "/pulse" },
  { week: "Løbende", title: "Chat med rådgiver", desc: "Skriv hvad du har på hjerte — spørgsmål, opdateringer eller bare hvad der fylder. Dine rådgivere læser dine tal og er klar til sparring.", icon: MessageCircle, color: "bg-chart-info/10 text-chart-info", link: "/chat" },
  { week: "Én gang", title: "Upload årsrapporter", desc: "Upload din årsrapport fra revisor (PDF) under Rapportering → Historiske årsrapporter. Giver dine grafer historisk kontekst fra dag ét.", icon: BookMarked, color: "bg-primary/10 text-primary", link: "/reports#annual-reports" },
];

const founderTips: { text: string; link?: string }[] = [
  { text: "Upload din rapport inden den 7. i måneden — så undgår du påmindelser og rådgiverne har dine tal tidligt", link: "/reports#upload" },
  { text: "Udfyld din refleksion hver måned — det er den hurtigste måde at give rådgiverne kontekst på", link: "/pulse" },
  { text: "Brug chatten aktivt — dine rådgivere læser dine tal og svarer hurtigt", link: "/chat" },
  { text: "Sæt KPI-mål én gang om året — det gør din fremgang målbar og konkret", link: "/kpis#goals" },
  { text: "Gennemfør Handouts i rækkefølge — hvert modul bygger ovenpå det forrige", link: "/handouts" },
  { text: "Brug AI-chefen aktivt — spørg 'Hvad skal jeg fokusere på denne uge?' direkte fra dashboardet", link: "/chat?tab=ai" },
  { text: "Park idéer i køleskabet under Milestones — de forsvinder ikke men forstyrrer ikke dit overblik", link: "/milestones" },
  { text: "Tilføj The Boardroom til din hjemskærm på mobilen for hurtig adgang — åbn siden i Safari og vælg 'Føj til hjemskærm'" },
  { text: "Upload din årsrapport fra revisor under Rapportering for at se historisk udvikling i dine grafer", link: "/reports#annual-reports" },
];

/* ── Advisor data ── */

const advisorWorkflow = [
  { step: 1, title: "Tjek prioriteringskøen", desc: "Øverst på dashboardet ser du 'Kræver handling' og 'Klar til sparring'. Klik direkte på en virksomhed for at åbne chatten. Brug tildelingsknappen (initialer-badgen) til at fordele virksomheder mellem rådgiverne.", link: "/", icon: AlertTriangle, color: "text-destructive bg-destructive/10" },
  { step: 2, title: "Tjek rapporteringsrytmen", desc: "Rapport-påmindelser sendes automatisk dag 7, 15 og 20 til founders der ikke har uploadet. Tjek Review Queue hvis en rapport er stuck i pipeline.", link: "/admin/review-queue", icon: ClipboardList, color: "text-primary bg-primary/10" },
  { step: 3, title: "Svar i chatten", desc: "Virksomheder der afventer svar vises med rød markering. Klik direkte fra prioriteringskøen for at åbne den rette samtale.", link: "/chat", icon: MessageCircle, color: "text-chart-info bg-chart-info/10" },
  { step: 4, title: "Kommentér på KPI-grafer", desc: "Når du er inde på en virksomheds KPI-side, kan du pinne kommentarer direkte på graferne. Founder modtager automatisk en notifikation.", link: "/kpis", icon: TrendingUp, color: "text-chart-info bg-chart-info/10" },
  { step: 5, title: "Send broadcast ved behov", desc: "Skal alle founders have samme besked? Brug broadcast-funktionen i member-oversigten. Du kan vælge specifikke modtagere.", link: "/members", icon: Send, color: "text-chart-warning bg-chart-warning/10" },
  { step: 6, title: "Brug 'Ingen handling nødvendig'", desc: "Når en founder skriver 'tak' eller afslutter et emne, klik 'Ingen handling' i chat-headeren. Det fjerner samtalen fra handlingskøen uden at afbryde relationen.", link: "/chat", icon: CheckCheck, color: "text-primary bg-primary/10" },
  { step: 7, title: "Kvitter eller sæt påmindelse", desc: "I prioriteringskøen kan du nu kvittere et item (det forsvinder fra køen for denne session) eller sætte en påmindelse om 2 eller 7 dage. Klik '···'-knappen yderst til højre på en virksomhed.", link: "/", icon: CheckCheck, color: "text-primary bg-primary/10" },
];

const advisorFeatures = [
  { icon: LayoutDashboard, title: "Dashboard", path: "/", color: "text-primary", bg: "bg-primary/10",
    desc: "Dit overblik: prioriteringskø, finansielle alerts, alle virksomheder med KPI-data og seneste aktivitet.",
    tips: ["Prioriteringskøen øverst viser hvem der haster mest", "Klik en virksomhed i alerts-panelet for at gå direkte til chatten", "Brug søgning og filtre i member-listen til at finde hurtigt"] },
  { icon: UserCog, title: "Medlemmer", path: "/members", color: "text-chart-warning", bg: "bg-chart-warning/10",
    desc: "Komplet overblik over alle founders: rapporterings-status, engagement, branche og invitationer.",
    tips: ["Filter på 'Ubesvaret' for hurtigt at se hvem der venter", "Udvid et medlem for at se login-aktivitet og Circle-status", "Send invitation direkte herfra til nye membres"] },
  { icon: ClipboardList, title: "Review Queue", path: "/admin/review-queue", color: "text-primary", bg: "bg-primary/10",
    desc: "Diagnostisk oversigt over rapporter med pipeline-flags (AI blocked, validation fail, osv.). Bruges til fejlfinding — ikke til godkendelse.",
    tips: ["Klik pilen for at åbne debug-detaljer for en rapport", "Founders uploader og godkender selv deres rapporter", "Filtrér på extraction method, validation status eller AI eligibility"] },
  { icon: Bell, title: "Finansielle alerts", path: "/", color: "text-destructive", bg: "bg-destructive/10",
    desc: "Automatisk overvågning: omsætningsfald >15%, bankovertræk og negativt resultat vises i alerts-panelet.",
    tips: ["Alerts trigges automatisk ved nye committede rapporter", "Klik en alert for at gå direkte til virksomhedens chat", "Alerts vises i 60 dage"] },
  { icon: Send, title: "Broadcast", path: "/members", color: "text-chart-warning", bg: "bg-chart-warning/10",
    desc: "Send samme besked til alle eller udvalgte founders på én gang. Beskeden vises i deres chat.",
    tips: ["Fold broadcast ud øverst i member-listen", "Vælg 'Specifikke' for at målrette mod bestemte virksomheder", "Founder modtager in-app notifikation"] },
  { icon: Sparkles, title: "KPI-kommentarer", path: "/kpis", color: "text-primary", bg: "bg-primary/10",
    desc: "Pin kommentarer direkte på founders' KPI-grafer. Vises som markering på grafen og notificerer founder.",
    tips: ["Klik på et datapunkt i grafen for at tilføje kommentar", "Kommentarer er synlige for founder og alle advisors", "Founder modtager in-app notifikation ved ny kommentar"] },
];

const advisorShortcuts = [
  { situation: "Virksomhed afventer svar", action: "Klik virksomhed i prioriteringskø → åbner chatten direkte", link: "/" },
  { situation: "Founder mangler rapport", action: "Rapport-påmindelser sendes automatisk dag 7, 15 og 20 — tjek Review Queue hvis noget er stuck", link: "/admin/review-queue" },
  { situation: "Skift til en anden virksomhed", action: "Scroll ned i sidebar → 'Vis som virksomhed' → søg og vælg", link: "/" },
  { situation: "Se virksomhed som founder", action: "'Vis som virksomhed' + 'Vis som medlem' i sidebar", link: "/" },
  { situation: "Send månedlig digest", action: "Admin → E-mail skabeloner → 'Send digest nu'", link: "/admin/emails" },
  { situation: "Tilføj KPI-kommentar", action: "KPI'er → vælg periode i grafen → klik datapunkt", link: "/kpis" },
  { situation: "Kvitter item i prioriteringskø", action: "Klik '···' på en virksomhed i 'Kræver handling' → Kvitter eller sæt påmindelse", link: "/" },
  { situation: "Sæt slutdato på member", action: "Medlemmer → udvid virksomhed → 'Rediger virksomhedsdata' (kun admin)", link: "/members" },
];

/* ── Shared feature card ── */

interface FeatureItem {
  icon: React.ElementType;
  title: string;
  path: string;
  color: string;
  bg: string;
  desc: string;
  tips: string[];
}

const FeatureCard = ({ f }: { f: FeatureItem }) => (
  <Link to={f.path} className="glass-card rounded-lg p-4 hover:shadow-sm transition-shadow block">
    <div className="flex items-start gap-3 mb-3">
      <div className={`rounded-full p-2 ${f.bg} shrink-0`}>
        <f.icon className={`h-4 w-4 ${f.color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{f.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
    </div>
    <div className="space-y-1.5 ml-11">
      {f.tips.map((tip, i) => (
        <div key={i} className="flex items-start gap-2">
          <CheckCircle2 className="h-3 w-3 text-chart-positive shrink-0 mt-0.5" />
          <span className="text-xs text-muted-foreground">{tip}</span>
        </div>
      ))}
    </div>
  </Link>
);

/* ── Founder variant ── */

const FounderGuide = () => (
  <>
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">
        Sådan bruger du The Boardroom
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Alt hvad du behøver at vide — find det du leder efter, eller læs det hele.
      </p>
    </div>

    {/* ── Monthly rhythm ── */}
    <div className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-4">Din månedlige rytme</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {founderTimeline.map(item => (
          <Link key={item.title} to={item.link} className="glass-card rounded-lg p-4 hover:shadow-sm transition-shadow block">
            <div className={`rounded-full p-2 w-fit ${item.color} mb-3`}>
              <item.icon className="h-4 w-4" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{item.week}</p>
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
            <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
              Gå til <ChevronRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>
    </div>

    {/* ── All features ── */}
    <div className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-4">Alle funktioner</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {founderFeatures.map(f => <FeatureCard key={f.title} f={f} />)}
      </div>
    </div>

    {/* ── Good habits ── */}
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-chart-warning" />
        <h2 className="text-base font-semibold text-foreground">Gode vaner der gør en forskel</h2>
      </div>
      <div className="space-y-3">
        {founderTips.map((tip, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{i + 1}</span>
            </div>
            {tip.link ? (
              <Link to={tip.link} className="text-sm text-muted-foreground hover:text-primary transition-colors flex-1">
                {tip.text} <ChevronRight className="h-3 w-3 inline" />
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">{tip.text}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  </>
);

/* ── Advisor variant ── */

const AdvisorGuide = () => (
  <>
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Advisor-guide</h1>
      <p className="text-sm text-muted-foreground mt-1">Dine værktøjer og det anbefalede workflow.</p>
    </div>

    {/* ── Recommended workflow ── */}
    <div className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-4">Det anbefalede workflow</h2>
      <div className="space-y-3">
        {advisorWorkflow.map(item => (
          <Link key={item.step} to={item.link} className="glass-card rounded-lg p-4 hover:shadow-sm transition-shadow flex items-start gap-4 block">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-primary">{item.step}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className={`rounded-full p-1 ${item.color.split(" ")[1]}`}>
                  <item.icon className={`h-3.5 w-3.5 ${item.color.split(" ")[0]}`} />
                </div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
              </div>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2" />
          </Link>
        ))}
      </div>
    </div>

    {/* ── All advisor tools ── */}
    <div className="mb-8">
      <h2 className="text-base font-semibold text-foreground mb-4">Alle advisor-værktøjer</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {advisorFeatures.map(f => <FeatureCard key={f.title} f={f} />)}
      </div>
    </div>

    {/* ── Shortcuts ── */}
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-chart-warning" />
        <h2 className="text-base font-semibold text-foreground">Hurtige genveje</h2>
      </div>
      <div className="space-y-2">
        {advisorShortcuts.map((row, i) => (
          <Link key={i} to={row.link} className="flex items-start gap-3 glass-card rounded-lg p-3 hover:shadow-sm transition-shadow block">
            <p className="text-sm font-medium text-foreground whitespace-nowrap shrink-0">{row.situation}</p>
            <p className="text-sm text-muted-foreground flex-1">{row.action}</p>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          </Link>
        ))}
      </div>
    </div>
  </>
);

/* ── Shell ── */

const Guide = () => {
  const { isAdvisor } = useAuth();
  const { viewingAsMember } = useViewMode();
  const effectiveAdvisor = isAdvisor && !viewingAsMember;

  return (
    <AppLayout>
      {effectiveAdvisor ? <AdvisorGuide /> : <FounderGuide />}
    </AppLayout>
  );
};

export default Guide;
