"use client";

import { use, useEffect, useState } from "react";
import type { EnvelopeRecord } from "@/lib/types";
import PrepareEditor from "@/components/PrepareEditor";

export default function PrepareEnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [envelope, setEnvelope] = useState<EnvelopeRecord | null>(null);
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/admin/envelopes/${encodeURIComponent(id)}/prepare-bootstrap`, {
          cache: "no-store",
        });
        const result = (await response.json()) as {
          error?: string;
          envelope?: EnvelopeRecord;
          pageSizes?: Array<{ width: number; height: number }>;
        };
        if (!response.ok || !result.envelope) {
          if (!cancelled) setError(result.error || "Could not load envelope.");
          return;
        }
        if (!cancelled) {
          setEnvelope(result.envelope);
          setPageSizes(result.pageSizes || [{ width: 612, height: 792 }]);
        }
      } catch {
        if (!cancelled) setError("Connection error while loading prepare.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f5f9] p-6 text-sm font-semibold text-red-700">
        {error}
      </div>
    );
  }

  if (!envelope) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f5f9] text-sm text-[#6b6578]">
        Loading document prepare…
      </div>
    );
  }

  return <PrepareEditor envelope={envelope} pageSizes={pageSizes} />;
}
