import * as React from "react";
import { Menu } from "lucide-react";
import topixIcon from "@/assets/topix-icon-green.png";

interface HbNavProps {
  onMenuClick?: () => void;
  avatarSrc?: string;
  avatarAlt?: string;
}

/** Slank mobil-topbar: burger, mærke, avatar. Desktop-navigationen bor i HbSidebar. */
const HbNav = ({ onMenuClick, avatarSrc, avatarAlt = "Profil" }: HbNavProps) => (
  <header className="border-b border-hb-line bg-hb-paper lg:hidden">
    <div className="flex h-16 items-center justify-between gap-4 px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Åbn menu"
        className="-ml-2 rounded-full p-2 text-hb-ink transition-colors hover:bg-hb-sage/30"
      >
        <Menu className="h-5 w-5" />
      </button>
      <a href="#" className="flex items-center gap-3">
        <img src={topixIcon} alt="Topix" className="h-8 w-8 rounded-lg" />
        <span className="font-editorial text-lg font-medium text-hb-ink">The Boardroom</span>
      </a>
      {avatarSrc ? (
        <img src={avatarSrc} alt={avatarAlt} className="h-9 w-9 rounded-full border border-hb-line object-cover" />
      ) : (
        <div className="h-9 w-9 rounded-full bg-hb-sage" />
      )}
    </div>
  </header>
);

export { HbNav };
