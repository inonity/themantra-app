"use client";

import { useCurrentUser } from "@/hooks/useStoreUserEffect";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) return;

    router.push("/dashboard");
  }, [user, router]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-muted-foreground">Redirecting...</div>
    </div>
  );
}
