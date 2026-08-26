"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  orgId: string;
}

/**
 * Tira de pestañas horizontal (no un segundo sidebar), copiando
 * `app/dashboard/empleados/[id]/componentes/EmployeeTabs.tsx`. "General", "Clientes"
 * y "Productos" están habilitadas; Facturas y Personalización se agregan a este mismo
 * arreglo en los specs 30-31.
 */
const TABS = (orgId: string) => [
  { href: `/dashboard/facturacion/${orgId}/general`, label: "General" },
  { href: `/dashboard/facturacion/${orgId}/customers`, label: "Clientes" },
  { href: `/dashboard/facturacion/${orgId}/products`, label: "Productos" },
];

export default function OrgTabs({ orgId }: Props) {
  const pathname = usePathname();

  return (
    <div className="border-b border-[#c4c6d0] dark:border-zinc-700 overflow-x-auto">
      <nav className="flex gap-0 -mb-px">
        {TABS(orgId).map(({ href, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-[#0051d5] text-[#0051d5] dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-[#44474f] hover:text-[#0051d5] dark:text-zinc-400 dark:hover:text-blue-400"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
