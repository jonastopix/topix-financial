import * as React from "react";
import { X } from "lucide-react";
import topixIcon from "@/assets/topix-icon-green.png";
import { cn } from "@/lib/utils";

/** Miljø-strukturen som navigation. Døde links i previewen — kun "Dit Boardroom" er reel. */
const NAV: { label: string; active?: boolean; children?: string[] }[] = [
  { label: "Dit Boardroom", active: true },
  { label: "Dine tal", children: ["Rapportering", "KPI'er", "Budget", "Milestones"] },
  { label: "Akademiet" },
  { label: "Community" },
  { label: "Events" },
  { label: "Podcast & Talks" },
  { label: "Ressourcer" },
];

interface HbSidebarProps {
  avatarSrc?: string;
  avatarAlt?: string;
  userName?: string;
}

const NavItem = ({ label, active }: { label: string; active?: boolean }) => (
  <a
    href="#"
    className={cn(
      "relative flex h-10 items-center rounded-full px-4 text-[15px] transition-colors",
      active ? "font-medium text-hb-ink" : "text-hb-ink-soft hover:bg-hb-sage/30 hover:text-hb-ink",
    )}
  >
    {active && <span className="absolute left-0 h-5 w-[3px] rounded-full bg-hb-evergreen" />}
    {label}
  </a>
);

/** Sidebarens indhold — delt mellem desktop-kolonnen og mobil-draweren. */
const SidebarContent = ({ avatarSrc, avatarAlt = "Profil", userName = "Medlem" }: HbSidebarProps) => (
  <>
    <a href="#" className="mb-10 flex items-center gap-3">
      <img src={topixIcon} alt="Topix" className="h-8 w-8 rounded-lg" />
      <span className="font-editorial text-lg font-medium text-hb-ink">The Boardroom</span>
    </a>
    <nav className="flex-1 space-y-1">
      {NAV.map((item) => (
        <React.Fragment key={item.label}>
          <NavItem label={item.label} active={item.active} />
          {item.children && (
            <div className="mb-3 ml-4 border-l border-hb-line pl-4">
              {item.children.map((child) => (
                <a
                  key={child}
                  href="#"
                  className="flex h-9 items-center text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
                >
                  {child}
                </a>
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
    </nav>
    <div className="mt-8 flex items-center gap-3 border-t border-hb-line pt-5">
      {avatarSrc ? (
        <img src={avatarSrc} alt={avatarAlt} className="h-8 w-8 rounded-full border border-hb-line object-cover" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-hb-sage" />
      )}
      <div className="min-w-0 text-sm leading-tight">
        <div className="truncate font-medium text-hb-ink">{userName}</div>
        <a href="#" className="text-xs text-hb-ink-soft transition-colors hover:text-hb-ink">
          Indstillinger
        </a>
      </div>
    </div>
  </>
);

/** Desktop-sidebar: papir, ikke en flade — samme baggrund som siden, adskilt af én hairline. */
const HbSidebar = (props: HbSidebarProps) => (
  <aside className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col border-r border-hb-line bg-hb-paper px-7 py-8 lg:flex">
    <SidebarContent {...props} />
  </aside>
);

interface HbSidebarDrawerProps extends HbSidebarProps {
  open: boolean;
  onClose: () => void;
}

/** Mobil-drawer. Egen overlay i sidens DOM-træ — bevidst IKKE shadcn Sheet:
    Sheet portaler til <body> uden for .theme-hjemmebane-scopet og ville
    arve appens mørke tokens. */
const HbSidebarDrawer = ({ open, onClose, ...props }: HbSidebarDrawerProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-hb-ink/30" onClick={onClose} />
      <div className="animate-slide-in absolute inset-y-0 left-0 flex w-[280px] flex-col overflow-y-auto border-r border-hb-line bg-hb-paper px-7 py-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Luk menu"
          className="absolute right-4 top-4 rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent {...props} />
      </div>
    </div>
  );
};

export { HbSidebar, HbSidebarDrawer };
