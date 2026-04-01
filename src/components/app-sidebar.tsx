"use client"

import {
  BoxIcon,
  HomeIcon,
  LayersIcon,
  PackageIcon,
  ShoppingCartIcon,
  WarehouseIcon,
  ClipboardListIcon,
  HistoryIcon,
  UsersIcon,
  TagIcon,
  BanknoteIcon,
  PercentIcon,
  HeartIcon,
  TruckIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCurrentUser } from "@/hooks/useStoreUserEffect"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { SignOutButton } from "@/components/sign-out-button"

const adminNav = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: HomeIcon,
  },
  {
    title: "Products",
    url: "/dashboard/products",
    icon: PackageIcon,
  },
  {
    title: "Batches",
    url: "/dashboard/batches",
    icon: LayersIcon,
  },
  {
    title: "Stock",
    url: "/dashboard/stock",
    icon: WarehouseIcon,
  },
  {
    title: "Sales",
    url: "/dashboard/sales",
    icon: ShoppingCartIcon,
  },
  {
    title: "Offers",
    url: "/dashboard/offers",
    icon: TagIcon,
  },
  {
    title: "Fulfillment",
    url: "/dashboard/fulfillment",
    icon: TruckIcon,
  },
  {
    title: "Agents",
    url: "/dashboard/agents",
    icon: UsersIcon,
  },
  {
    title: "Pricing",
    url: "/dashboard/pricing",
    icon: PercentIcon,
  },
  {
    title: "Agent Payments",
    url: "/dashboard/agent-payments",
    icon: BanknoteIcon,
  },
]

const agentNav = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: HomeIcon,
  },
  {
    title: "My Inventory",
    url: "/dashboard/inventory",
    icon: BoxIcon,
  },
  {
    title: "Interests",
    url: "/dashboard/interests",
    icon: HeartIcon,
  },
  {
    title: "Record Sale",
    url: "/dashboard/record-sale",
    icon: ClipboardListIcon,
  },
  {
    title: "Fulfillment",
    url: "/dashboard/my-fulfillment",
    icon: TruckIcon,
  },
  {
    title: "Sales History",
    url: "/dashboard/my-sales",
    icon: HistoryIcon,
  },
  {
    title: "Payments",
    url: "/dashboard/payments",
    icon: BanknoteIcon,
  },
]

const salesNav = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: HomeIcon,
  },
  {
    title: "My Inventory",
    url: "/dashboard/inventory",
    icon: BoxIcon,
  },
  {
    title: "Interests",
    url: "/dashboard/interests",
    icon: HeartIcon,
  },
  {
    title: "Record Sale",
    url: "/dashboard/record-sale",
    icon: ClipboardListIcon,
  },
  {
    title: "Fulfillment",
    url: "/dashboard/my-fulfillment",
    icon: TruckIcon,
  },
  {
    title: "Sales History",
    url: "/dashboard/my-sales",
    icon: HistoryIcon,
  },
  {
    title: "Payments",
    url: "/dashboard/payments",
    icon: BanknoteIcon,
  },
]

export function AppSidebar() {
  const user = useCurrentUser()
  const pathname = usePathname()

  const navItems =
    user?.role === "admin"
      ? adminNav
      : user?.role === "agent"
        ? agentNav
        : user?.role === "sales"
          ? salesNav
          : []

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <span className="font-semibold">TheMantra</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={pathname === item.url}
                  >
                    <item.icon data-icon="inline-start" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SignOutButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
