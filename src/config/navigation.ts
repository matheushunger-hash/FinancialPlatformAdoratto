import { LayoutDashboard, Truck, Receipt, Repeat, FileSpreadsheet, CreditCard, type LucideIcon } from "lucide-react";

// Each item in this array becomes a link in the sidebar.
// To add a new section in the future, just add one object here —
// no need to touch any UI component code.

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Fornecedores", href: "/dashboard/fornecedores", icon: Truck },
  { title: "Contas a Pagar", href: "/dashboard/contas-a-pagar", icon: Receipt },
  { title: "Recorrências", href: "/dashboard/recorrencias", icon: Repeat },
  { title: "Importar", href: "/dashboard/importar", icon: FileSpreadsheet },
  { title: "Recebimentos", href: "/dashboard/recebimentos", icon: CreditCard },
];
