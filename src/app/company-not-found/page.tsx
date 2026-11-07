import { headers } from "next/headers";
import CompanyNotFound from "@/components/company-not-found";

export const metadata = { title: "Institution not found · Campusly" };

/** Served by the proxy for every page on an institution address that doesn't exist. */
export default async function CompanyNotFoundPage() {
  const host = (await headers()).get("host") || "";
  return <CompanyNotFound host={host} />;
}
