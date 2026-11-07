import { headers } from "next/headers";
import CompanyNotFound from "@/components/company-not-found";

export const metadata = { title: "Company not found · Next Gen HRMS" };

/** Served by the proxy for every page on a company address that doesn't exist. */
export default async function CompanyNotFoundPage() {
  const host = (await headers()).get("host") || "";
  return <CompanyNotFound host={host} />;
}
