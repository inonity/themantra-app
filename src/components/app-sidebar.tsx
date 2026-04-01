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
  ChevronsUpDown,
  LogOut,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

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
  const { signOut } = useAuthActions()

  const navItems =
    user?.role === "admin"
      ? adminNav
      : user?.role === "agent"
        ? agentNav
        : user?.role === "sales"
          ? salesNav
          : []

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?"

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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {user?.name ?? "Loading..."}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email ?? ""}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <div className="flex items-center gap-2 px-1.5 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {user?.name ?? "Loading..."}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
                  <Settings />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
