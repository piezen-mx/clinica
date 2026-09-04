"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useSucursal } from "@/contexts/SucursalContext";
import { useTheme } from "@/contexts/ThemeContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Sun, Moon, LogOut, Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import CambiarPasswordModal from "@/app/dashboard/componentes/CambiarPasswordModal";
import { NAV_LINKS, type NavLink } from "@/app/dashboard/componentes/navConfig";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const RAIL_WIDTH = 72;
const EXPANDED_WIDTH = 240;
const COLLAPSED_STORAGE_KEY = "sidebar_collapsed";

// Paleta de references/sidebar/DESIGN.md
const NAVY = "#00204A";

export default function Sidebar({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { sucursales, selectedId, setSelected } = useSucursal();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [flyoutTop, setFlyoutTop] = useState<number | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_LINKS.forEach((l) => {
      if (l.children) initial[l.label] = l.children.some((c) => pathname.startsWith(c.href));
    });
    return initial;
  });

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  const links = NAV_LINKS.filter(
    (l) =>
      (l.minRole === 0 || (user?.id_role ?? 0) === l.minRole) &&
      !l.excludeRoles.includes(user?.id_role ?? 0)
  );

  const asideWidth = collapsed ? RAIL_WIDTH : EXPANDED_WIDTH;
  const isActive = (href?: string) => !!href && pathname.startsWith(href);
  const isGroupActive = (link: NavLink) => !!link.children?.some((c) => pathname.startsWith(c.href));

  const navItemBase = "flex items-center gap-3 py-2.5 text-xs font-semibold tracking-wide transition-colors";
  const navItemState = (active: boolean) =>
    active
      ? "bg-[#2e4772] text-white border-l-4 border-[#0051d5]"
      : "text-white/70 hover:text-white hover:bg-[#2e4772]/50 border-l-4 border-transparent";

  const renderLink = (link: NavLink) => {
    const Icon = link.icon;

    if (link.children) {
      const active = isGroupActive(link);
      const submenu = link.children.map((child) => {
        const ChildIcon = child.icon;
        const childActive = pathname.startsWith(child.href);
        return (
          <Link
            key={child.href}
            href={child.href}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded transition-colors ${
              childActive ? "text-white bg-[#2e4772]" : "text-white/60 hover:text-white"
            }`}
          >
            <ChildIcon className="h-4 w-4" />
            {child.label}
          </Link>
        );
      });

      return (
        <div
          key={link.label}
          className="relative"
          onMouseEnter={(e) => {
            if (!collapsed) return;
            setFlyoutTop(e.currentTarget.getBoundingClientRect().top);
            setHoveredGroup(link.label);
          }}
          onMouseLeave={() => collapsed && setHoveredGroup(null)}
        >
          <button
            type="button"
            onClick={() => !collapsed && toggleGroup(link.label)}
            className={`w-full text-left ${navItemBase} ${navItemState(active)} ${collapsed ? "justify-center px-0" : "px-4"}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1">{link.label}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${openGroups[link.label] ? "rotate-180" : ""}`}
                />
              </>
            )}
          </button>
          {collapsed ? (
            flyoutTop !== null && (
              <div
                style={{ position: "fixed", top: flyoutTop, left: RAIL_WIDTH + 8 }}
                onMouseEnter={() => setHoveredGroup(link.label)}
                onMouseLeave={() => setHoveredGroup(null)}
                className={`z-50 min-w-[180px] rounded-lg bg-[#00204a] py-2 shadow-lg transition-opacity duration-300 ${
                  hoveredGroup === link.label ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <p className="px-3 pb-1 text-xs font-semibold text-white/50">{link.label}</p>
                {submenu}
              </div>
            )
          ) : (
            openGroups[link.label] && <div className="pl-8 py-1 space-y-1">{submenu}</div>
          )}
        </div>
      );
    }

    if (link.disabled) {
      return (
        <div
          key={link.label}
          className={`${navItemBase} ${collapsed ? "justify-center px-0" : "px-4"} border-l-4 border-transparent text-white/30 opacity-60 cursor-not-allowed`}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {!collapsed && <span>{link.label}</span>}
        </div>
      );
    }

    return (
      <Link
        key={link.href}
        href={link.href!}
        className={`${navItemBase} ${navItemState(isActive(link.href))} ${collapsed ? "justify-center px-0" : "px-4"}`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{link.label}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop / tablet aside */}
      <aside
        style={{ width: asideWidth, backgroundColor: NAVY }}
        className={`${inter.className} hidden lg:flex fixed top-0 left-0 z-40 h-screen flex-col py-6 transition-all duration-300 overflow-y-auto`}
      >
        <div className={`mb-6 flex items-center px-6 ${collapsed ? "justify-center px-0" : "justify-between"}`}>
          {!collapsed && <span className="text-lg font-bold text-white">Pie Zen</span>}
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>
        <nav className="flex-1 space-y-1">{links.map(renderLink)}</nav>
      </aside>

      {/* Header + content wrapper */}
      <div
        style={{ "--sidebar-w": `${asideWidth}px` } as CSSProperties}
        className="flex min-h-screen flex-col lg:ml-[var(--sidebar-w)] transition-all duration-300"
      >
        {/* Desktop header */}
        <header
          className={`${inter.className} hidden lg:flex sticky top-0 z-30 items-center justify-end gap-4 border-b border-[#e2e8f0] bg-white px-6 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800`}
        >
          {sucursales.length > 1 && (
            <select
              value={selectedId}
              onChange={(e) => setSelected(Number(e.target.value))}
              className="rounded border border-[#cbd5e1] bg-white px-2 py-1.5 text-sm text-[#0b1c30] shadow-sm transition-colors hover:border-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#2563eb] dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
            >
              {sucursales.map((s) => (
                <option key={s.id_sucursal} value={s.id_sucursal}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={toggle}
            aria-label="Cambiar tema"
            className="rounded p-2 text-[#44474f] hover:bg-[#eff4ff] dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setPasswordModal(true)}
            className="flex flex-col items-end hover:underline underline-offset-2 transition-colors"
          >
            <span className="text-sm font-medium leading-tight text-[#0b1c30] dark:text-zinc-300">{user?.nombre}</span>
            <span className="text-xs leading-tight text-[#44474f] dark:text-zinc-500">{user?.role_nombre}</span>
          </button>
          <button
            onClick={logout}
            style={{ backgroundColor: NAVY }}
            className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </header>

        {/* Mobile header */}
        <header
          className={`${inter.className} lg:hidden sticky top-0 z-30 flex items-center justify-between border-b border-[#e2e8f0] bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800`}
        >
          <Link href="/dashboard" className="text-lg font-bold text-[#0b1c30] dark:text-zinc-50">
            Pie Zen
          </Link>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="rounded p-2 text-[#44474f] hover:bg-[#eff4ff] dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside
        style={{ backgroundColor: NAVY }}
        className={`${inter.className} fixed top-0 left-0 z-50 h-full w-64 shadow-xl flex flex-col transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <span className="text-base font-semibold text-white">Menú</span>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-sm text-white/50">Sesión iniciada como</p>
          <button
            onClick={() => {
              setMobileOpen(false);
              setPasswordModal(true);
            }}
            className="flex flex-col items-start mt-0.5 hover:underline underline-offset-2 transition-colors text-left"
          >
            <span className="text-sm font-medium leading-tight text-white">{user?.nombre}</span>
            <span className="text-xs leading-tight text-white/50">{user?.role_nombre}</span>
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;

            if (link.children) {
              const active = isGroupActive(link);
              return (
                <div key={link.label}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(link.label)}
                    className={`w-full text-left ${navItemBase} ${navItemState(active)} px-4`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1">{link.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${openGroups[link.label] ? "rotate-180" : ""}`}
                    />
                  </button>
                  {openGroups[link.label] && (
                    <div className="pl-9 py-1 space-y-1">
                      {link.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = pathname.startsWith(child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-2 rounded px-3 py-2 text-xs font-semibold transition-colors ${
                              childActive ? "text-white" : "text-white/60 hover:text-white"
                            }`}
                          >
                            <ChildIcon className="h-4 w-4" />
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (link.disabled) {
              return (
                <div
                  key={link.label}
                  className={`${navItemBase} px-4 border-l-4 border-transparent text-white/30 opacity-60 cursor-not-allowed`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{link.label}</span>
                </div>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href!}
                onClick={() => setMobileOpen(false)}
                className={`${navItemBase} ${navItemState(isActive(link.href))} px-4`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {link.label}
              </Link>
            );
          })}

          {sucursales.length > 1 && (
            <div className="pt-2 px-4">
              <p className="pb-1 text-xs text-white/50">Sucursal</p>
              <select
                value={selectedId}
                onChange={(e) => {
                  setMobileOpen(false);
                  setSelected(Number(e.target.value));
                }}
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
              >
                {sucursales.map((s) => (
                  <option key={s.id_sucursal} value={s.id_sucursal} className="text-[#0b1c30]">
                    {s.nombre}
                    {s.ciudad ? ` — ${s.ciudad}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 flex items-center gap-2">
          <button
            onClick={toggle}
            aria-label="Cambiar tema"
            className="rounded border border-white/20 p-2.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors shrink-0"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={logout}
            className="flex-1 flex items-center justify-center gap-2 rounded bg-[#0051d5] px-4 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {passwordModal && <CambiarPasswordModal onClose={() => setPasswordModal(false)} />}
    </>
  );
}
