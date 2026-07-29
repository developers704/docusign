import type { ReactNode } from "react";
import type { AppSession } from "@/lib/auth";
import type { OfficeRecord } from "@/lib/types";
import { readAppProfile, readOffices, readTemplateFolders } from "@/lib/store";
import DocuSignLayout from "./DocuSignLayout";

export default async function AdminShell({
  children,
  session,
  office,
}: {
  children: ReactNode;
  session: AppSession;
  office?: OfficeRecord;
}) {
  const folders = await readTemplateFolders(
    session.role === "super_admin" ? undefined : session.officeId || undefined
  );
  const profile = session.role === "super_admin" ? await readAppProfile() : null;
  const offices =
    session.role === "super_admin"
      ? (await readOffices(true)).map((item) => ({ id: item.id, name: item.name }))
      : office
        ? [{ id: office.id, name: office.name }]
        : [];

  return (
    <DocuSignLayout
      session={session}
      office={office}
      folders={folders}
      offices={offices}
      networkName={profile?.networkName}
    >
      {children}
    </DocuSignLayout>
  );
}
