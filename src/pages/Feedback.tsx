import AppLayout from "@/components/AppLayout";
import { MessageSquare, ThumbsUp, User } from "lucide-react";

const feedbackItems = [
  {
    id: "1",
    author: "Marie K.",
    role: "Board Member",
    date: "25. jan 2026",
    report: "Januar 2026",
    message: "Stærk vækst i MRR! Overvej at investere mere i marketing nu, da jeres unit economics ser solide ud. Hvad er planen for enterprise-segmentet?",
    likes: 3,
  },
  {
    id: "2",
    author: "Anders P.",
    role: "Mentor",
    date: "24. jan 2026",
    report: "Januar 2026",
    message: "God fremgang med churn-reduktion. Jeg vil anbefale at kigge på NPS som en leading indicator. Lad os tage en snak om jeres onboarding-flow.",
    likes: 5,
  },
  {
    id: "3",
    author: "Sofie L.",
    role: "Board Member",
    date: "28. dec 2025",
    report: "December 2025",
    message: "Imponerende at I lukkede 15 nye kunder! Husk at dokumentere jeres salgsproces, så den kan skaleres. Hvem ejer salgsfunktionen pt?",
    likes: 2,
  },
  {
    id: "4",
    author: "Thomas R.",
    role: "Investor",
    date: "27. dec 2025",
    report: "December 2025",
    message: "V2.0 launch ser lovende ud. Hvad er jeres plan for at reducere CAC? De nuværende tal er acceptable, men der er plads til optimering.",
    likes: 4,
  },
];

const Feedback = () => {
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">Feedback fra dit board og mentorer</p>
      </div>

      <div className="space-y-4">
        {feedbackItems.map((item) => (
          <div key={item.id} className="glass-card rounded-xl p-6 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-foreground">{item.author}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{item.role}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{item.date}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider mb-3">
                  <MessageSquare className="h-2.5 w-2.5" />
                  {item.report}
                </span>
                <p className="text-sm text-foreground leading-relaxed mt-2">{item.message}</p>
                <div className="flex items-center gap-2 mt-3">
                  <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {item.likes}
                  </button>
                  <button className="text-xs text-muted-foreground hover:text-primary transition-colors ml-3">
                    Svar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
};

export default Feedback;
