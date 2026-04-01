export const DEMO_COMPANY = "The Boardroom ApS";
export const DEMO_USER = "Morten Larsen";

export const DEMO_FACTS = [
  { period: "Jan 2025", key: "2025-01", revenue: 182000, ebitda: 13320, cash: 85000, gross_profit: 167440, payroll: 85000 },
  { period: "Feb 2025", key: "2025-02", revenue: 195000, ebitda: 23200, cash: 72000, gross_profit: 179400, payroll: 85000 },
  { period: "Mar 2025", key: "2025-03", revenue: 210000, ebitda: 24600, cash: 95000, gross_profit: 193200, payroll: 92000 },
  { period: "Apr 2025", key: "2025-04", revenue: 198000, ebitda: 17480, cash: 88000, gross_profit: 182160, payroll: 92000 },
  { period: "Maj 2025", key: "2025-05", revenue: 225000, ebitda: 36000, cash: 120000, gross_profit: 207000, payroll: 92000 },
  { period: "Jun 2025", key: "2025-06", revenue: 248000, ebitda: 38480, cash: 145000, gross_profit: 228160, payroll: 105000 },
  { period: "Jul 2025", key: "2025-07", revenue: 232000, ebitda: 29320, cash: 132000, gross_profit: 213440, payroll: 105000 },
  { period: "Aug 2025", key: "2025-08", revenue: 267000, ebitda: 43920, cash: 168000, gross_profit: 245640, payroll: 115000 },
  { period: "Sep 2025", key: "2025-09", revenue: 285000, ebitda: 55600, cash: 195000, gross_profit: 262200, payroll: 115000 },
  { period: "Okt 2025", key: "2025-10", revenue: 310000, ebitda: 58600, cash: 220000, gross_profit: 285200, payroll: 130000 },
  { period: "Nov 2025", key: "2025-11", revenue: 298000, ebitda: 48480, cash: 205000, gross_profit: 274160, payroll: 130000 },
  { period: "Dec 2025", key: "2025-12", revenue: 342000, ebitda: 69920, cash: 248000, gross_profit: 314640, payroll: 140000 },
];

export const DEMO_MILESTONES = [
  { title: "Nå 400.000 kr. MRR", progress: 85, deadline: "31. mar 2026", current: "342.000 kr.", target: "400.000 kr.", category: "finance" },
  { title: "Reducér churn til under 1%", progress: 40, deadline: "30. jun 2026", current: "1,2%", target: "<1%", category: "operations" },
  { title: "Ansæt Customer Success Manager", progress: 30, deadline: "30. apr 2026", current: "Kandidater screenes", target: "Ansat", category: "team" },
];

export const DEMO_CHAT = [
  { role: "advisor", name: "Jonas Herlev", initials: "JH", time: "I går 14:32", text: "Imponerende december, Morten! Omsætningsvæksten på 88% YoY er stærk. Har du set nærmere på, hvilke kanaler der driver den vækst?" },
  { role: "user", name: "Morten Larsen", initials: "ML", time: "I går 15:18", text: "Tak Jonas! Det er primært vores inbound-kanal der kører nu — SEO begynder at virke. Vi får ca. 3-4 kvalificerede leads om ugen organisk." },
  { role: "advisor", name: "Jonas Herlev", initials: "JH", time: "I går 16:05", text: "Det er guld. Organisk vækst med de marginer I har nu er præcis det vi har arbejdet hen imod. Lad os tage det op på mødet 30. april." },
];

export const DEMO_BUDGET = [
  { month: "Okt 2025", revBudget: 300000, revActual: 310000, costBudget: 240000, costActual: 251400, ebitdaBudget: 60000, ebitdaActual: 58600 },
  { month: "Nov 2025", revBudget: 310000, revActual: 298000, costBudget: 245000, costActual: 249520, ebitdaBudget: 65000, ebitdaActual: 48480 },
  { month: "Dec 2025", revBudget: 320000, revActual: 342000, costBudget: 250000, costActual: 272080, ebitdaBudget: 70000, ebitdaActual: 69920 },
];

export const CATEGORY_LABELS: Record<string, string> = {
  finance: "Økonomi",
  operations: "Drift",
  team: "Team",
};
