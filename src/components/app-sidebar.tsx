"use client"

import {
  BoxIcon,
  HomeIcon,
  LayersIcon,
  PackageIcon,
  ShoppingCartIcon,
  WarehouseIcon,
  ClipboardListIcon,
  PlusCircleIcon,
  HistoryIcon,
  UsersIcon,
  TagIcon,
  BanknoteIcon,
  PercentIcon,
  HeartIcon,
  TruckIcon,
  QrCodeIcon,
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
  useSidebar,
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
    title: "Offers",
    url: "/dashboard/offers",
    icon: TagIcon,
  },
  {
    title: "Rates",
    url: "/dashboard/rates",
    icon: PercentIcon,
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
    title: "Agent Payments",
    url: "/dashboard/agent-payments",
    icon: BanknoteIcon,
  },
    {
    title: "Sales",
    url: "/dashboard/sales",
    icon: ShoppingCartIcon,
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
    title: "Customer Interests",
    url: "/dashboard/interests",
    icon: ClipboardListIcon,
  },
  {
    title: "Interest Forms",
    url: "/dashboard/interest-forms",
    icon: QrCodeIcon,
  },
  {
    title: "Sales",
    url: "/dashboard/my-sales",
    icon: HistoryIcon,
  },
  {
    title: "Fulfillment",
    url: "/dashboard/my-fulfillment",
    icon: TruckIcon,
  },
  {
    title: "HQ Payments",
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
    title: "Customer Interests",
    url: "/dashboard/interests",
    icon: ClipboardListIcon,
  },
  {
    title: "Interest Forms",
    url: "/dashboard/interest-forms",
    icon: QrCodeIcon,
  },
  {
    title: "Sales History",
    url: "/dashboard/my-sales",
    icon: HistoryIcon,
  },
  {
    title: "Fulfillment",
    url: "/dashboard/my-fulfillment",
    icon: TruckIcon,
  },
  {
    title: "HQ Payments",
    url: "/dashboard/payments",
    icon: BanknoteIcon,
  },
]

export function AppSidebar() {
  const user = useCurrentUser()
  const pathname = usePathname()
  const { signOut } = useAuthActions()
  const { isMobile, setOpenMobile } = useSidebar()

  function closeMobile() {
    if (isMobile) setOpenMobile(false)
  }

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
              <span className="font-semibold">The Mantra</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {user?.role !== "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/dashboard/record-sale" />}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    onClick={closeMobile}
                  >
                    <PlusCircleIcon data-icon="inline-start" />
                    <span>Add Sale</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <SidebarMenu className="mt-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/dashboard/record-interest" />}
                    isActive={pathname === "/dashboard/record-interest"}
                    className="border border-border hover:bg-accent"
                    onClick={closeMobile}
                  >
                    <HeartIcon data-icon="inline-start" />
                    <span>Record Interest</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<Link href={item.url} />}
                    isActive={pathname === item.url}
                    onClick={closeMobile}
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
                <DropdownMenuItem render={<Link href="/dashboard/settings" />} onClick={closeMobile}>
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
