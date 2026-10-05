import {
  BarChart3,
  Bot,
  Bug,
  CalendarDays,
  CheckSquare,
  CircleDollarSign,
  ClipboardCheck,
  FileStack,
  FolderKanban,
  GitPullRequestArrow,
  HandCoins,
  LayoutDashboard,
  PackageCheck,
  Receipt,
  Rocket,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/server/authz/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Workspace",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban, permission: "project.view" },
      { href: "/clients", label: "Clients", icon: Users, permission: "client.view" },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, permission: "project.view" },
      { href: "/bugs", label: "Bugs", icon: Bug, permission: "project.view" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, permission: "project.view" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { href: "/documents", label: "Documents", icon: FileStack, permission: "project.view" },
      { href: "/approvals", label: "Approvals", icon: ClipboardCheck, permission: "project.view" },
      { href: "/change-requests", label: "Change Requests", icon: GitPullRequestArrow, permission: "project.view" },
      { href: "/deployments", label: "Deployments", icon: Rocket, permission: "project.view" },
      { href: "/handover", label: "Handover", icon: PackageCheck, permission: "project.view" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/invoices", label: "Invoices", icon: Receipt, permission: "finance.view" },
      { href: "/payments", label: "Payments", icon: HandCoins, permission: "finance.view" },
      { href: "/expenses", label: "Expenses", icon: Wallet, permission: "finance.view" },
      { href: "/profitability", label: "Profitability", icon: TrendingUp, permission: "finance.view" },
    ],
  },
  {
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, permission: "project.view" },
      { href: "/assistant", label: "AI Assistant", icon: Bot, permission: "project.view" },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const CURRENCY_ICON = CircleDollarSign;
