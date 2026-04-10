import { AuthGuard } from "@/components/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { QuickSwitchBanner } from "@/components/quick-switch-banner";
import { QuickSwitchProvider } from "@/components/quick-switch-context";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <QuickSwitchProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <QuickSwitchBanner />
            <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 bg-background px-4">
              <SidebarTrigger className="-ml-1" />
            </header>
            <div className="flex flex-1 flex-col p-4">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </QuickSwitchProvider>
    </AuthGuard>
  );
}
