import AppLayout from "@/components/AppLayout";
import { Users, UserPlus } from "lucide-react";

const members = [
  { name: "Jonas Doe", role: "Founder & CEO", initials: "JD" },
  { name: "Marie K.", role: "Board Member", initials: "MK" },
  { name: "Anders P.", role: "Mentor", initials: "AP" },
  { name: "Sofie L.", role: "Board Member", initials: "SL" },
  { name: "Thomas R.", role: "Investor", initials: "TR" },
];

const Group = () => {
  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            Gruppe
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dit board, mentorer og investorer
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <UserPlus className="h-4 w-4" />
          Invitér medlem
        </button>
      </div>

      <div className="space-y-3">
        {members.map((member) => (
          <div
            key={member.name}
            className="glass-card rounded-xl p-5 flex items-center gap-4 animate-fade-in hover:border-primary/20 transition-all"
          >
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-foreground">{member.initials}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{member.name}</p>
              <p className="text-xs text-muted-foreground">{member.role}</p>
            </div>
            <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
              Aktiv
            </span>
          </div>
        ))}
      </div>
    </AppLayout>
  );
};

export default Group;
