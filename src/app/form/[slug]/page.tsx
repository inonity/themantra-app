"use client";

import { use, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { PublicFormView } from "@/components/interest-forms/public-form-view";

function FormPageInner({ slug }: { slug: string }) {
  const data = useQuery(api.interestForms.getPublicPageData, { slug });

  if (data === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2">
        <p className="text-xl font-semibold">Form not found</p>
        <p className="text-muted-foreground text-sm">This link may be invalid or expired.</p>
      </div>
    );
  }

  return <PublicFormView data={data} />;
}

export default function FormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <FormPageInner slug={slug} />
    </Suspense>
  );
}
