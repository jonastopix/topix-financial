import AppLayout from "@/components/AppLayout";
import { MessageSquare, CalendarDays, PlayCircle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const cards = [
  {
    icon: MessageSquare,
    title: "Community",
    description: "Del erfaringer, stil spørgsmål og få sparring fra andre iværksættere.",
    label: "Åbn community",
    href: "https://app.topix.dk/c/community/",
  },
  {
    icon: CalendarDays,
    title: "Live sessions",
    description: "Se kommende online sessions og tilmeld dig direkte.",
    label: "Se kalender",
    href: "https://app.topix.dk/c/calendar/",
  },
  {
    icon: PlayCircle,
    title: "Classroom",
    description: "Videomoduler og undervisning tilgængelig når det passer dig.",
    label: "Åbn Classroom",
    href: "https://app.topix.dk/c/classroom/",
  },
];

const Community = () => {
  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Community</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Her finder du The Boardroom community, kommende live sessions og videomoduler i Classroom. Log ind med din email på app.topix.dk.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardContent className="pt-6 space-y-4">
                <card.icon className="h-8 w-8 text-primary" />
                <div className="space-y-1.5">
                  <h2 className="font-semibold text-foreground">{card.title}</h2>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={card.href} target="_blank" rel="noopener noreferrer">
                    {card.label}
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Du skal være logget ind på app.topix.dk for at se indholdet. Brug den email du er registreret med.
        </p>
      </div>
    </AppLayout>
  );
};

export default Community;
