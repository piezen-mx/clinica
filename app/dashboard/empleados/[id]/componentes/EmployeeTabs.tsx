"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  id_empleado: number;
}

const TABS = (id_empleado: number) => [
  { href: `/dashboard/empleados/${id_empleado}`, label: "Datos Personales" },
  { href: `/dashboard/empleados/${id_empleado}/documentos`, label: "Documentación" },
  { href: `/dashboard/empleados/${id_empleado}/asistencia`, label: "Asistencia" },
];

export default function EmployeeTabs({ id_empleado }: Props) {
  const pathname = usePathname();

  return (
    <div className="border-b border-[#c4c6d0] dark:border-zinc-700 overflow-x-auto">
      <nav className="flex gap-0 -mb-px">
        {TABS(id_empleado).map(({ href, label }) => {
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
