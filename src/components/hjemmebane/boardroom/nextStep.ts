import { DANISH_MONTHS } from "@/lib/financialUtils";

/** "Dit næste skridt" — port af DashboardActionCenter-PRIORITERINGEN
    (rapport mangler → afventer godkendelse → milestone-deadline →
    pulse-nudge) som REN funktion, så dommen kan testes. Bevidst udeladt
    af porten (bogført i forside-design-blokken): weekly_focus, ulæste
    chat-/agent-beskeder, company_actions og platform-announcements.
    null = alt er ajour (kortet bærer i stedet forløbs-linket). */

export interface NextStepMilestone {
  title: string;
  deadline: string | null;
  progress: number;
  status: string;
}

export interface NextStepInputs {
  now: Date;
  /** Perioder m. processed rapport (effektive period-keys, "YYYY-MM"). */
  processedPeriodKeys: ReadonlySet<string>;
  /** Perioder m. godkendte (committed) tal i facts-laget. */
  committedPeriodKeys: ReadonlySet<string>;
  milestones: NextStepMilestone[];
  hasPulseThisMonth: boolean;
}

export interface NextStep {
  id: "missing-report" | "pending-approval" | "milestone-deadline" | "pulse";
  title: string;
  description: string;
  cta: string;
  link: string;
}

export function deriveNextStep(inputs: NextStepInputs): NextStep | null {
  const { now } = inputs;
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  const monthName = DANISH_MONTHS[prevMonth].toLowerCase();

  if (!inputs.processedPeriodKeys.has(prevKey)) {
    return {
      id: "missing-report",
      title: `Upload dine ${monthName}-tal`,
      description: `Så er ${monthName} ${prevYear} med, og din rådgiver kan se fremad med dig.`,
      cta: "Upload tallene",
      link: "/reports",
    };
  }

  if (!inputs.committedPeriodKeys.has(prevKey)) {
    return {
      id: "pending-approval",
      title: `Godkend dine ${monthName}-tal`,
      description: `Tallene for ${monthName} ${prevYear} er uploadet, men ikke godkendt endnu — godkend dem, så de kommer i drift.`,
      cta: "Godkend tallene",
      link: "/reports",
    };
  }

  const candidates = inputs.milestones
    .filter((m) => m.deadline && m.progress < 100 && m.status !== "parked")
    .map((m) => ({
      milestone: m,
      daysLeft: Math.ceil((new Date(m.deadline as string).getTime() - now.getTime()) / 86400000),
    }))
    .filter(({ daysLeft }) => daysLeft > 0 && daysLeft <= 14)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (candidates.length > 0) {
    const { milestone, daysLeft } = candidates[0];
    return {
      id: "milestone-deadline",
      title: `"${milestone.title}" nærmer sig deadline`,
      description: `${daysLeft} dag${daysLeft === 1 ? "" : "e"} tilbage — opdatér fremdriften eller justér målet.`,
      cta: "Åbn milestones",
      link: "/milestones",
    };
  }

  if (!inputs.hasPulseThisMonth) {
    return {
      id: "pulse",
      title: "Tag stilling til dine tal",
      description: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}-rapporten er afleveret. Har du taget stilling til tallene?`,
      cta: "Send din refleksion",
      link: "/pulse",
    };
  }

  return null;
}
