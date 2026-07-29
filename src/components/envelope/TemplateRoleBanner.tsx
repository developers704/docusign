"use client";

import type { TemplateRecipientRoleRecord } from "@/lib/types";
import type { RecipientFormInput } from "@/lib/recipientFormUtils";
import { missingRequiredTemplateRoles } from "@/lib/recipientFormUtils";

export default function TemplateRoleBanner({
  roles,
  recipients,
}: {
  roles: TemplateRecipientRoleRecord[];
  recipients: RecipientFormInput[];
}) {
  const missing = missingRequiredTemplateRoles(roles, recipients);
  if (!missing.length) return null;

  return (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">Assign required roles</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
        {missing.map((role) => (
          <li key={role.id}>Assign someone to the {role.roleName} role.</li>
        ))}
      </ul>
    </div>
  );
}
