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
  ArrowLeftRight,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useCurrentUser } from "@/hooks/useStoreUserEffect"
import { useQuickSwitchDialog } from "@/components/quick-switch-context"

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { Id } from "../../convex/_generated/dataModel"

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

function capitalizeRole(role: string | undefined) {
  if (!role) return ""
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function getInitials(name: string | undefined) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function AppSidebar() {
  const user = useCurrentUser()
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuthActions()
  const { isMobile, setOpenMobile } = useSidebar()
  const { dialogOpen: switchDialogOpen, setDialogOpen: setSwitchDialogOpen } = useQuickSwitchDialog()

  const quickSwitchStatus = useQuery(api.quickSwitch.getStatus)
  const switchableUsers = useQuery(
    api.quickSwitch.listSwitchableUsers,
    quickSwitchStatus?.realUser ? {} : "skip"
  )
  const startSession = useMutation(api.quickSwitch.startSession)
  const endSession = useMutation(api.quickSwitch.endSession)

  const isAdmin = quickSwitchStatus?.realUser?.role === "admin"
  const isImpersonating = quickSwitchStatus?.isActive === true

  function closeMobile() {
    if (isMobile) setOpenMobile(false)
  }

  function openSwitchDialog() {
    if (isMobile) setOpenMobile(false)
    setSwitchDialogOpen(true)
  }

  async function handleSwitchUser(targetUserId: Id<"users">) {
    await startSession({ targetUserId })
    setSwitchDialogOpen(false)
    router.push("/dashboard")
  }

  async function handleSwitchBack() {
    await endSession()
    setSwitchDialogOpen(false)
    router.push("/dashboard")
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

  // Build the sorted user list for the dialog:
  // When impersonating: current target first, then admin (switch back), then separator, then rest
  // When not impersonating: all users with separators between each
  const filteredUsers = switchableUsers?.filter(
    (u) =>
      !(
        isImpersonating &&
        quickSwitchStatus?.isActive &&
        quickSwitchStatus.actingAsUser?._id === u._id
      )
  )

  return (
    <>
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
                {isAdmin && (
                  <>
                    <DropdownMenuItem onClick={openSwitchDialog}>
                      <ArrowLeftRight />
                      Switch Account
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
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

    {/* Dialog rendered outside Sidebar so it's not hidden when sidebar closes on mobile */}
    <Dialog open={switchDialogOpen} onOpenChange={setSwitchDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Switch Account</DialogTitle>
          <DialogDescription>
            Switch to another account to view and act as that user.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto">
          {/* Current target (the account admin is acting as) — shown first */}
          {isImpersonating &&
            quickSwitchStatus?.isActive &&
            (() => {
              const currentUser = quickSwitchStatus.actingAsUser
              return (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
                  <Avatar className="h-9 w-9 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs">
                      {getInitials(currentUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {currentUser.name}
                      </span>
                      <Badge variant="secondary">
                        {capitalizeRole(currentUser.role)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentUser.email}
                    </p>
                  </div>
                  <Badge variant="outline">Current</Badge>
                </div>
              )
            })()}

          {/* Switch back to admin */}
          {isImpersonating && quickSwitchStatus?.realUser && (
            <>
              <div className="h-px bg-border my-2" />
              <button
                onClick={handleSwitchBack}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent p-3 text-left hover:bg-accent transition-colors"
              >
                <Avatar className="h-9 w-9 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">
                    {getInitials(quickSwitchStatus.realUser.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {quickSwitchStatus.realUser.name}
                    </span>
                    <Badge variant="secondary">Admin</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {quickSwitchStatus.realUser.email}
                  </p>
                </div>
                <span className="text-xs text-primary font-medium shrink-0">
                  Switch back
                </span>
              </button>
            </>
          )}

          {/* Separator before user list */}
          {filteredUsers && filteredUsers.length > 0 && (
            <div className="h-px bg-border my-2" />
          )}

          {/* Other switchable users (exclude current target) */}
          {filteredUsers?.map((u, i) => (
            <div key={u._id}>
              {i > 0 && <div className="h-px bg-border my-1" />}
              <button
                onClick={() => handleSwitchUser(u._id)}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent p-3 text-left hover:bg-accent transition-colors"
              >
                <Avatar className="h-9 w-9 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">
                    {getInitials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {u.name}
                    </span>
                    <Badge variant="secondary">
                      {capitalizeRole(u.role)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {u.email}
                  </p>
                </div>
              </button>
            </div>
          ))}
          {switchableUsers?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No agents or salespersons to switch to.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
