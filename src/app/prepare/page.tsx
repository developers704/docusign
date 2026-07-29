import FieldEditorDemo from "@/components/FieldEditorDemo";
import { requireAdmin } from "@/lib/auth";

export default async function PreparePage(){ await requireAdmin(); return <FieldEditorDemo/>; }
