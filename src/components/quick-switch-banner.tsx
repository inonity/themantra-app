"use client"

import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { ArrowLeftRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useQuickSwitchDialog } from "@/components/quick-switch-context"

function capitalizeRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function QuickSwitchBanner() {
  const status = useQuery(api.quickSwitch.getStatus)
  const { setDialogOpen } = useQuickSwitchDialog()

  if (!status?.isActive) return null

  return (
    <div className="flex items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 min-w-0">
        <ArrowLeftRight className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm text-amber-900 dark:text-amber-100 truncate">
          Acting as{" "}
          <strong>{status.actingAsUser.name}</strong>
        </span>
        <Badge variant="outline" className="shrink-0">
          {capitalizeRole(status.actingAsUser.role ?? "")}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className="shrink-0 text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-900/50"
      >
        <ArrowLeftRight data-icon="inline-start" />
        <span className="hidden sm:inline">Switch Account</span>
        <span className="sm:hidden">Switch</span>
      </Button>
    </div>
  )
}
