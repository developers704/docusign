import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { createPolicyPdf } from "@/lib/pdf";
import { getOfficeById } from "@/lib/store";
import { createTemplateService } from "@/lib/services/templateService";

export const runtime = "nodejs";

const templateService = createTemplateService();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;
  const template = await templateService.getById(id);
  if (!template || !canAccessOffice(session, template.officeId)) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const doc = template.documents?.[0];
  let bytes: Buffer;
  let fileName = `${template.name.replace(/[^a-z0-9]+/gi, "-") || "template"}.pdf`;
  if (doc?.filePath) {
    const absolute = path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath);
    try {
      bytes = await readFile(absolute);
    } catch {
      return NextResponse.json({ error: "Document file could not be read." }, { status: 404 });
    }
    fileName = doc.originalFileName || fileName;
  } else {
    const office = await getOfficeById(template.officeId);
    bytes = Buffer.from(
      await createPolicyPdf({
        officeName: office?.name || "Office",
        title: template.title || template.name,
        content: template.content || template.description || template.message || template.name,
        recipients: [],
      })
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
