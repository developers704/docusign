import { notFound } from "next/navigation";
import PublicWebFormClient from "@/components/templates/PublicWebFormClient";
import { readTemplates, readWebForms } from "@/lib/store";
import { templateHasSigningFields } from "@/lib/templateSigningFields";

export default async function PublicWebFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const forms = await readWebForms();
  const form = forms.find((item) => item.slug === slug && item.status === "active");
  if (!form) notFound();
  const templates = await readTemplates();
  const template = templates.find((item) => item.id === form.templateId);
  const ready = Boolean(template && templateHasSigningFields(template));
  return (
    <PublicWebFormClient
      slug={form.slug}
      formName={form.name}
      instructions={form.instructions}
      unavailable={!ready}
    />
  );
}
