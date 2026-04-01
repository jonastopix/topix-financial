import { toast } from "sonner";

export const DEMO_EMAIL = "demo@theboardroom.dk";

export function blockIfDemo(isDemoMode: boolean, action: string): boolean {
  if (isDemoMode) {
    toast.info(`Dette er en demooplevelse`, {
      description: `${action} er ikke tilgængeligt i demo. Opret en gratis konto for at prøve.`,
      action: { label: "Opret konto →", onClick: () => window.open("https://theboardroom.dk", "_blank") },
    });
    return true;
  }
  return false;
}
