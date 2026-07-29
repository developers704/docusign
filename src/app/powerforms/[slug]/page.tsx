import { notFound } from "next/navigation";
import PublicPowerFormClient from "@/components/templates/PublicPowerFormClient";
import { getOfficeById, readTemplates } from "@/lib/store";
import { getPowerFormBySlug } from "@/lib/services/powerFormService";
import { isPowerFormPubliclyAvailable } from "@/lib/powerFormNormalize";
import { templateHasSigningFields } from "@/lib/templateSigningFields";

export default async function PublicPowerFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await getPowerFormBySlug(slug);
  if (!form) notFound();

  const templates = await readTemplates();
  const template = templates.find((item) => item.id === form.templateId);
  const office = await getOfficeById(form.officeId);

  let unavailable = false;
  let unavailableReason = "";
  if (!isPowerFormPubliclyAvailable(form)) {
    unavailable = true;
    unavailableReason =
      form.status === "paused"
        ? "This PowerForm is paused."
        : form.status === "draft"
          ? "This PowerForm is not published yet."
          : form.status === "archived"
            ? "This PowerForm has been archived."
            : "This PowerForm is not available right now.";
  } else if (!template || !templateHasSigningFields(template)) {
    unavailable = true;
    unavailableReason = "This form is not available yet. The sender still needs to finish configuring the template.";
  }

  return (
    <PublicPowerFormClient
      slug={form.slug}
      officeName={office?.name || ""}
      unavailable={unavailable}
      unavailableReason={unavailableReason}
      form={{
        name: form.name,
        description: form.description,
        accessType: form.accessType,
        requireAccessCode: form.requireAccessCode,
        requireEmailVerification: form.requireEmailVerification,
        requireConsent: form.requireConsent,
        consentText: form.consentText,
        collectName: form.collectName,
        collectEmail: form.collectEmail,
        collectPhone: form.collectPhone,
        collectEmployeeId: form.collectEmployeeId,
        customIntakeFields: form.customIntakeFields,
        successMessage: form.successMessage,
      }}
    />
  );
}
