"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass } from "lucide-react";
import { findPage } from "@/lib/hr-nav";
import { ModulePlaceholder } from "@/components/hr/module-placeholder";
import { EmptyState, Paper, btn } from "@/components/shell/page";

// Any app page that has no screen yet: show what it will do, from the navigation map.
export default function PlannedPage() {
  const pathname = usePathname();
  const page = findPage(pathname);
  if (!page || page.href !== pathname || !page.intro) {
    return (
      <Paper>
        <EmptyState icon={Compass} title="This page doesn't exist" hint="Check the address, or pick a page from the menu."
          action={<Link href="/dashboard" className={btn.ghost}>Go to overview</Link>} />
      </Paper>
    );
  }
  return <ModulePlaceholder section={page.section.label} icon={page.icon} title={page.label} intro={page.intro} features={page.features ?? []} />;
}
