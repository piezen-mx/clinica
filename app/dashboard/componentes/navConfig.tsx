import {
  LayoutDashboard,
  Users,
  Calendar,
  Stethoscope,
  Package,
  Box,
  Store,
  Link2,
  ShoppingCart,
  ClipboardList,
  UsersRound,
  UserCog,
  Truck,
  ShoppingBag,
  PackageCheck,
  ArrowLeftRight,
  ClipboardCheck,
  Receipt,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavLink {
  href?: string;
  label: string;
  icon: LucideIcon;
  minRole: number;
  excludeRoles: number[];
  disabled?: boolean;
  children?: NavChild[];
}

export const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: 0, excludeRoles: [5] },
  { href: "/dashboard/pacientes", label: "Pacientes", icon: Users, minRole: 0, excludeRoles: [5] },
  { href: "/dashboard/citas", label: "Citas", icon: Calendar, minRole: 0, excludeRoles: [5] },
  { href: "/dashboard/servicios", label: "Servicios", icon: Stethoscope, minRole: 0, excludeRoles: [5] },
  {
    label: "Inventario",
    icon: Package,
    minRole: 0,
    excludeRoles: [5],
    children: [
      { href: "/dashboard/productos", label: "Productos", icon: Box },
      { href: "/dashboard/proveedores", label: "Proveedores", icon: Truck },
      { href: "/dashboard/pedidos", label: "Pedidos", icon: ShoppingBag },
      { href: "/dashboard/recepciones", label: "Recepciones", icon: PackageCheck },
      { href: "/dashboard/movimientos", label: "Movimientos", icon: ArrowLeftRight },
      { href: "/dashboard/conteos", label: "Conteos", icon: ClipboardCheck },
    ],
  },
  { href: "/dashboard/sucursales", label: "Sucursales", icon: Store, minRole: 0, excludeRoles: [5] },
  { href: "/dashboard/enlaces", label: "Enlaces", icon: Link2, minRole: 0, excludeRoles: [3, 5] },
  { href: "/dashboard/ventas", label: "Ventas", icon: ShoppingCart, minRole: 0, excludeRoles: [5] },
  { href: "/dashboard/tratamientos", label: "Tratamientos", icon: ClipboardList, minRole: 0, excludeRoles: [] },
  { href: "/dashboard/empleados", label: "Empleados", icon: UsersRound, minRole: 0, excludeRoles: [2, 3, 5] },
  { href: "/dashboard/facturacion", label: "Facturación", icon: Receipt, minRole: 0, excludeRoles: [2, 3, 5] },
  { href: "/dashboard/usuarios", label: "Usuarios", icon: UserCog, minRole: 0, excludeRoles: [2, 3, 5] },
];
