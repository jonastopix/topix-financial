import AppLayout from "@/components/AppLayout";
import { Settings as SettingsIcon, Bell, Shield, Palette } from "lucide-react";

const settingsSections = [
  {
    icon: SettingsIcon,
    title: "Generelt",
    description: "Virksomhedsinfo, CVR-nummer og kontaktoplysninger",
  },
  {
    icon: Bell,
    title: "Notifikationer",
    description: "Styr hvornår og hvordan du modtager beskeder",
  },
  {
    icon: Shield,
    title: "Sikkerhed",
    description: "Password, to-faktor-godkendelse og adgangskontrol",
  },
  {
    icon: Palette,
    title: "Udseende",
    description: "Tema, sprog og visuelle præferencer",
  },
];

const Settings = () => {
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
          Indstillinger
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Administrér din konto og platformindstillinger
        </p>
      </div>

      <div className="space-y-3">
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.title}
              className="glass-card rounded-xl p-5 flex items-center gap-4 animate-fade-in hover:border-primary/20 transition-all cursor-pointer group"
            >
              <div className="p-3 rounded-xl bg-secondary">
                <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {section.title}
                </p>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </AppLayout>
  );
};

export default Settings;
