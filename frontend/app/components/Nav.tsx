"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMode } from "../lib/mode";

const LINKS = [
  { href: "/", label: "Stats" },
  { href: "/carriers", label: "Carriers" },
  { href: "/routes", label: "Routes" },
  { href: "/airports", label: "Airports" },
  { href: "/aircraft", label: "Aircraft" },
  { href: "/max-grounding", label: "737 MAX", researcherOnly: true },
  { href: "/delays", label: "Delays" },
  { href: "/compare", label: "Compare" },
  { href: "/decision-center", label: "Decision Center", researcherOnly: true },
  { href: "/data-health", label: "Data Health" },
  { href: "/glossary", label: "Glossary" },
  { href: "/methodology", label: "Methodology", researcherOnly: true },
  { href: "/copilot", label: "Copilot" },
];

export default function Nav() {
  const pathname = usePathname();
  const { mode, setMode } = useMode();

  const visibleLinks = LINKS.filter((link) => !link.researcherOnly || mode === "researcher");

  return (
    <nav className="nav">
      {visibleLinks.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
          {link.label}
        </Link>
      ))}
      <button
        type="button"
        className="mode-toggle"
        onClick={() => setMode(mode === "public" ? "researcher" : "public")}
        title="Switch between a simpler public view and the full researcher toolset"
      >
        {mode === "public" ? "Public view" : "Researcher view"}
      </button>
    </nav>
  );
}
