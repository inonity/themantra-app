"use client"

import { createContext, useContext, useState } from "react"

const QuickSwitchContext = createContext<{
  dialogOpen: boolean
  setDialogOpen: (open: boolean) => void
}>({
  dialogOpen: false,
  setDialogOpen: () => {},
})

export function QuickSwitchProvider({ children }: { children: React.ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <QuickSwitchContext value={{ dialogOpen, setDialogOpen }}>
      {children}
    </QuickSwitchContext>
  )
}

export function useQuickSwitchDialog() {
  return useContext(QuickSwitchContext)
}
