import { NavLink } from "react-router";

const NAV = [
  { to: "/", label: "Inicio", end: true },
  { to: "/tabla", label: "Tabla" },
  { to: "/partidos", label: "Partidos" },
  { to: "/equipos", label: "Equipos" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
        <NavLink to="/" className="group flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">
            open<span className="text-vino-ink">FutVE</span>
          </span>
          <span className="hidden text-xs text-faint sm:inline">Liga FUTVE, datos abiertos</span>
        </NavLink>

        <nav className="flex gap-1 text-sm" aria-label="Principal">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-2.5 py-1 transition-colors ${
                  isActive
                    ? "bg-vino-soft font-medium text-vino-ink"
                    : "text-muted hover:bg-raised hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-8 text-xs leading-relaxed text-faint sm:px-6">
        <p>
          openFutVE — plataforma de datos abiertos de la Liga FUTVE Primera División. Fase 1: los
          datos son observaciones por fuente, sin reconciliar.
        </p>
        <p className="mt-2">
          <a
            className="underline decoration-line underline-offset-2 hover:text-muted"
            href="https://github.com/openfutve/openfutve"
          >
            Código y datos en GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
