import * as React from "react";
import { Link } from "react-router-dom";
import { ListChecks, LogOut, X } from "lucide-react";
import topixIcon from "@/assets/topix-icon-green.png";
import { cn } from "@/lib/utils";

/** Nav-struktur. `to` = rigtig route; uden `to` er linket dødt (V0-preview-
    adfærden). Additiv udvidelse i C1 trin 3 — previewens udtryk er urørt. */
export interface HbNavEntry {
  label: string;
  to?: string;
  active?: boolean;
  children?: { label: string; to?: string; active?: boolean }[];
  /** Admin-blokken (raadgiverfladen-design.md §3.1): punkter der hører til
      rådgiverens adskilte blok NEDERST i nav'en. Samme greb som `drift` i
      HbAdminShell — første admin-punkt får skillelinje og overskrift over
      sig. Udeladt = medlemsmenuen, tegn-for-tegn som før. */
  admin?: boolean;
}

/** Miljø-strukturen som navigation. Døde links i previewen — kun "Dit Boardroom" er reel. */
const NAV: HbNavEntry[] = [
  { label: "Dit Boardroom", active: true },
  {
    label: "Dine tal",
    children: [
      { label: "Rapportering" },
      { label: "KPI'er" },
      { label: "Budget" },
      { label: "Milestones" },
      { label: "Handouts" },
    ],
  },
  { label: "Din rådgiver", children: [{ label: "Chat" }, { label: "Book session" }] },
  { label: "Akademiet" },
  { label: "Community" },
  { label: "Events" },
  { label: "Podcast & Talks" },
  { label: "Ressourcer", children: [{ label: "Skabeloner" }, { label: "Rabataftaler" }] },
];

interface HbSidebarProps {
  avatarSrc?: string;
  avatarAlt?: string;
  userName?: string;
  /** Erstat nav-strukturen (rigtige links). Udeladt = V0-previewens døde nav. */
  nav?: HbNavEntry[];
  /** Logo-linkets mål; udeladt = dødt (preview). */
  homeTo?: string;
  /** Log ud-handler. Udeladt = ingen knap (previewens brug er urørt). */
  onSignOut?: () => void;
  /** «Kom godt i gang» — henter onboarding-tjeklisten frem igen. Udeladt =
      intet punkt (rådgivere, færdig liste der ikke er lukket, preview). */
  komGodtIGang?: { onClick: () => void };
}

const NavItem = ({ label, active, to }: { label: string; active?: boolean; to?: string }) => {
  const className = cn(
    "relative flex h-10 items-center rounded-full px-4 text-[15px] transition-colors",
    active ? "font-medium text-hb-ink" : "text-hb-ink-soft hover:bg-hb-sage/30 hover:text-hb-ink",
  );
  const marker = active && <span className="absolute left-0 h-5 w-[3px] rounded-full bg-hb-evergreen" />;
  return to ? (
    <Link to={to} className={className}>
      {marker}
      {label}
    </Link>
  ) : (
    <a href="#" className={className}>
      {marker}
      {label}
    </a>
  );
};

const ChildLink = ({ label, to, active }: { label: string; to?: string; active?: boolean }) => {
  const className = cn(
    "flex h-9 items-center text-sm transition-colors",
    active ? "font-medium text-hb-ink" : "text-hb-ink-soft hover:text-hb-ink",
  );
  return to ? (
    <Link to={to} className={className}>
      {label}
    </Link>
  ) : (
    <a href="#" className={className}>
      {label}
    </a>
  );
};

/** Sidebarens indhold — delt mellem desktop-kolonnen og mobil-draweren. */
const SidebarContent = ({
  avatarSrc,
  avatarAlt = "Profil",
  userName = "Medlem",
  nav = NAV,
  homeTo,
  onSignOut,
  komGodtIGang,
}: HbSidebarProps) => (
  <>
    {homeTo ? (
      <Link to={homeTo} className="mb-10 flex items-center gap-3">
        <img src={topixIcon} alt="Topix" className="h-8 w-8 rounded-lg" />
        <span className="font-editorial text-lg font-medium text-hb-ink">The Boardroom</span>
      </Link>
    ) : (
      <a href="#" className="mb-10 flex items-center gap-3">
        <img src={topixIcon} alt="Topix" className="h-8 w-8 rounded-lg" />
        <span className="font-editorial text-lg font-medium text-hb-ink">The Boardroom</span>
      </a>
    )}
    <nav className="flex-1 space-y-1">
      {nav.map((item, index) => (
        <React.Fragment key={item.label}>
          {/* Admin-blokken læses som adskilt fra medlemsmenuen, ikke som endnu
              et punkt i den: samme hairline som profilblokken nederst
              (border-t hb-line) og en dæmpet overskrift i profilblokkens
              lille tekst. Padding frem for margin — nav'ens space-y-1 sætter
              margin-top på hvert barn og ville vinde over en mt-*. */}
          {item.admin && !nav[index - 1]?.admin && (
            <div className="pt-5">
              <p className="border-t border-hb-line pt-4 text-xs text-hb-ink-soft">Admin</p>
            </div>
          )}
          <NavItem label={item.label} active={item.active} to={item.to} />
          {item.children && (
            /* Gren-hairline lokalt mørknet: hb-line (L88) drukner som fritstående
               1px-streg direkte på papiret (L97). Tokenen er urørt. */
            <div className="mb-3 ml-4 border-l border-hb-ink/15 pl-4">
              {item.children.map((child) => (
                <ChildLink key={child.label} label={child.label} to={child.to} active={child.active} />
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
    </nav>
    {/* Tjeklisten hentes frem herfra når medlemmet har lukket den (eller
        når den er færdig og de vil se den igen). Samme udtryk som NavItem,
        men en knap: den navigerer ikke, den åbner boksen. */}
    {komGodtIGang && (
      <button
        type="button"
        onClick={komGodtIGang.onClick}
        className="mt-4 flex h-10 w-full items-center gap-2 rounded-full px-4 text-left text-[15px] text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
      >
        <ListChecks className="h-4 w-4" />
        Kom godt i gang
      </button>
    )}
    <div className="mt-8 flex items-center gap-3 border-t border-hb-line pt-5">
      {avatarSrc ? (
        <img src={avatarSrc} alt={avatarAlt} className="h-8 w-8 rounded-full border border-hb-line object-cover" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-hb-sage" />
      )}
      <div className="min-w-0 text-sm leading-tight">
        <div className="truncate font-medium text-hb-ink">{userName}</div>
        {/* /settings er en AppLayout-side (gammelt design) — det er
            bevidst: en vej til indstillinger i gammelt udtryk er bedre
            end ingen vej. */}
        <Link to="/settings" className="text-xs text-hb-ink-soft transition-colors hover:text-hb-ink">
          Indstillinger
        </Link>
      </div>
      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          title="Log ud"
          className="ml-auto shrink-0 p-1.5 text-hb-ink-soft transition-colors hover:text-hb-ink"
        >
          <LogOut className="h-4 w-4" />
        </button>
      )}
    </div>
  </>
);

/** Desktop-sidebar: papir, ikke en flade — samme baggrund som siden, adskilt af én hairline.
    Ingen sticky: previewens layout-skal er sin egen scroll-container på lg
    (indholdskolonnen scroller), fordi #root's globale overflow-x-regel gør
    sticky virkningsløs. overflow-y-auto så strukturen ikke klippes på lave skærme. */
const HbSidebar = (props: HbSidebarProps) => (
  <aside className="hidden h-screen w-[272px] shrink-0 flex-col overflow-y-auto border-r border-hb-line bg-hb-paper px-7 py-8 lg:flex">
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
