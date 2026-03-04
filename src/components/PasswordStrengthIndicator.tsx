import { Check, X } from "lucide-react";

interface PasswordStrengthIndicatorProps {
  password: string;
}

const criteria = [
  { label: "Mindst 8 tegn", test: (p: string) => p.length >= 8 },
  { label: "Stort bogstav", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Et tal", test: (p: string) => /[0-9]/.test(p) },
  { label: "Specialtegn", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const levels = [
  { label: "Svag", color: "bg-destructive" },
  { label: "Svag", color: "bg-destructive" },
  { label: "Rimelig", color: "bg-orange-500" },
  { label: "God", color: "bg-yellow-500" },
  { label: "Stærk", color: "bg-emerald-500" },
];

export function getPasswordScore(password: string): number {
  return criteria.filter((c) => c.test(password)).length;
}

const PasswordStrengthIndicator = ({ password }: PasswordStrengthIndicatorProps) => {
  if (!password) return null;

  const score = getPasswordScore(password);
  const level = levels[score];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Styrke:</span>
        <span className="text-xs font-medium text-muted-foreground">{level.label}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${level.color}`}
          style={{ width: `${(score / 4) * 100}%` }}
        />
      </div>
      <ul className="grid grid-cols-2 gap-1">
        {criteria.map((c) => {
          const met = c.test(password);
          return (
            <li key={c.label} className="flex items-center gap-1 text-[11px]">
              {met ? (
                <Check className="h-3 w-3 text-emerald-500 shrink-0" />
              ) : (
                <X className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              )}
              <span className={met ? "text-foreground" : "text-muted-foreground/60"}>{c.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PasswordStrengthIndicator;
