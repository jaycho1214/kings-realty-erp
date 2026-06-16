import { redirect } from "next/navigation";

/**
 * 계약(Leases) are tenant-centric (WP B2): they live inside each tenant's
 * detail page, and there is no standalone 계약 list/nav. Individual lease
 * detail pages (/leases/[id]) remain for deep links, editing, and PDF export.
 */
export default function LeasesPage() {
  redirect("/tenants");
}
