import * as React from "react";
import topixIcon from "@/assets/topix-icon-green.png";

interface HbNavProps {
  links?: { label: string; href: string }[];
  avatarSrc?: string;
  avatarAlt?: string;
}

const DEFAULT_LINKS = [
  { label: "Puls", href: "#" },
  { label: "Episoder", href: "#" },
  { label: "Events", href: "#" },
  { label: "Community", href: "#" },
];

/** Let, lys topbar: mærke, få links, avatar. Ingen sidebar — forsiden er et medie. */
const HbNav = ({ links = DEFAULT_LINKS, avatarSrc, avatarAlt = "Profil" }: HbNavProps) => (
  <header className="border-b border-hb-line bg-hb-paper">
    <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-6 px-6">
      <a href="#" className="flex items-center gap-3">
        <img src={topixIcon} alt="Topix" className="h-8 w-8 rounded-lg" />
        <span className="font-editorial text-lg font-medium text-hb-ink">The Boardroom</span>
      </a>
      <nav className="hidden items-center gap-8 md:flex">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-sm text-hb-ink-soft transition-colors hover:text-hb-ink"
          >
            {link.label}
          </a>
        ))}
      </nav>
      {avatarSrc ? (
        <img src={avatarSrc} alt={avatarAlt} className="h-9 w-9 rounded-full border border-hb-line object-cover" />
      ) : (
        <div className="h-9 w-9 rounded-full bg-hb-sage" />
      )}
    </div>
  </header>
);

export { HbNav };
