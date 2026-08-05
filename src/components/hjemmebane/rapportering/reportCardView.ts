/** Tilstands-dommen for rapportkortene (rapportering-design §b): mapping
    fra rapportens server-tilstand (RP-1-felterne — financial_reports.status,
    committed-medlemskab i facts, get_report_commit_states) til kort-udtryk.
    REN funktion, så præsentationslogikken er testet — ikke spredt i JSX.
    Toner (Mola): quiet = ro; attention = hb-rust-accent uden alarm-flader;
    alert = tydelig men rolig alvor. Frontend DØMMER kun — den skriver
    aldrig status (A1-reglen bor i engine-laget). */

export type CommitState = "not_ready" | "ready" | "update_available" | "blocked";

export interface ReportCardInput {
  status: string;
  isCommitted: boolean;
  commitState?: CommitState;
  stateReason?: string | null;
}

export type CardAction = "review" | "override" | "upload" | "none";

export interface ReportCardView {
  key:
    | "processing"
    | "error"
    | "period_open"
    | "manual"
    | "awaiting"
    | "blocked"
    | "not_ready"
    | "update"
    | "committed"
    | "unknown";
  label: string;
  tone: "quiet" | "attention" | "alert";
  detail?: string;
  primary?: { label: string; action: CardAction };
  secondary?: { label: string; action: CardAction };
}

export function deriveReportCardView(input: ReportCardInput): ReportCardView {
  const { status, isCommitted, commitState, stateReason } = input;

  // Rå status-tilstande dømmer først (error slår commitState — prioritet).
  if (status === "processing") {
    return { key: "processing", label: "Behandles…", tone: "quiet" };
  }
  if (status === "error") {
    return {
      key: "error",
      label: "Kunne ikke behandles",
      tone: "alert",
      primary: { label: "Prøv igen", action: "upload" },
      secondary: { label: "Indtast manuelt", action: "override" },
    };
  }
  if (status === "period_not_completed") {
    return {
      key: "period_open",
      label: "Perioden er ikke afsluttet endnu",
      tone: "attention",
      primary: { label: "Ret periode", action: "override" },
    };
  }
  if (status === "needs_manual_entry") {
    return {
      key: "manual",
      label: "Kræver manuel indtastning",
      tone: "attention",
      primary: { label: "Indtast tallene", action: "override" },
    };
  }

  if (status === "processed") {
    if (!isCommitted) {
      if (commitState === "blocked") {
        return {
          key: "blocked",
          label: "Kan ikke godkendes endnu",
          tone: "attention",
          detail: stateReason ?? undefined,
          primary: { label: "Se hvorfor", action: "review" },
        };
      }
      if (commitState === "not_ready") {
        return {
          key: "not_ready",
          label: "Perioden skal rettes først",
          tone: "attention",
          primary: { label: "Ret periode", action: "override" },
        };
      }
      return {
        key: "awaiting",
        label: "Klar til gennemsyn",
        tone: "attention",
        primary: { label: "Gennemgå og godkend", action: "review" },
      };
    }
    if (commitState === "update_available") {
      return {
        key: "update",
        label: "Opdatering klar til gennemsyn",
        tone: "attention",
        primary: { label: "Gennemgå opdatering", action: "review" },
      };
    }
    return {
      key: "committed",
      label: "Godkendt",
      tone: "quiet",
      secondary: { label: "Ret data", action: "override" },
    };
  }

  // Defensivt: ukendt tilstand dømmes stille og handlingsløst.
  return { key: "unknown", label: "Ukendt tilstand", tone: "quiet" };
}
