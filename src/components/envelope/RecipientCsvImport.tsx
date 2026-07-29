"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { RecipientFormInput } from "@/lib/recipientFormUtils";
import { parseRecipientCsv } from "@/lib/recipientFormUtils";

const FORMAT_HELP = "Same format for file or paste: name,email (header optional). One person per line.";
const PASTE_PLACEHOLDER = "name,email\nExample 1,example1@example.com\nExample 2,example2@example.com";

export default function RecipientCsvImport({
  sendMode,
  onImport,
  defaultOpen = false,
}: {
  sendMode: "group" | "sequential";
  onImport: (recipients: RecipientFormInput[]) => void;
  /** When true, paste box starts open (bulk send). */
  defaultOpen?: boolean;
}) {
  const [pasteOpen, setPasteOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (defaultOpen) setPasteOpen(true);
  }, [defaultOpen]);

  function runImport(source: string) {
    const result = parseRecipientCsv(source, sendMode);
    if (result.errors.length) {
      setError(result.errors[0]);
      setSuccess("");
      return false;
    }
    if (!result.recipients.length) {
      setError("No valid rows found. Use name,email on each line.");
      setSuccess("");
      return false;
    }
    setError("");
    onImport(result.recipients);
    setSuccess(`Added ${result.recipients.length} recipient${result.recipients.length === 1 ? "" : "s"}.`);
    return true;
  }

  function handleImport() {
    runImport(text);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setFileName(file.name);
      setText(content);
      setPasteOpen(true);
      setError("");
      setSuccess("");
      runImport(content);
    };
    reader.onerror = () => setError("Could not read that file. Try again or paste the CSV text.");
    reader.readAsText(file);
    event.target.value = "";
  }

  return (
    <div className="rounded-xl border border-dashed border-[#c8bfd3] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#2b2038]">Import from CSV</p>
          <p className="mt-1 text-xs text-[#817687]">{FORMAT_HELP}</p>
          <p className="mt-1 text-xs text-[#817687]">
            Example: <code className="rounded bg-[#f3efff] px-1">Example 1,example1@example.com</code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg border border-[#ddd5e5] px-3 py-2 text-xs font-semibold text-[#4c00ff] hover:bg-[#faf8ff]">
            Choose CSV file
            <input type="file" accept=".csv,text/csv,text/plain,.txt" className="hidden" onChange={handleFileChange} />
          </label>
          <button
            type="button"
            onClick={() => {
              setPasteOpen((current) => !current);
              setError("");
            }}
            className="rounded-lg border border-[#ddd5e5] px-3 py-2 text-xs font-semibold text-[#2b2038] hover:bg-[#faf8ff]"
          >
            {pasteOpen ? "Hide paste" : "Paste CSV"}
          </button>
        </div>
      </div>

      {fileName && !pasteOpen && <p className="mt-2 text-xs text-[#555]">Loaded: {fileName}</p>}

      {pasteOpen && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-semibold text-[#2b2038]" htmlFor="recipient-csv-paste">
            Paste recipients (same format as CSV file)
          </label>
          <textarea
            id="recipient-csv-paste"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
              setSuccess("");
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (!pasted.trim()) return;
              event.preventDefault();
              setText(pasted);
              runImport(pasted);
            }}
            rows={6}
            placeholder={PASTE_PLACEHOLDER}
            className="w-full rounded-lg border border-[#ddd5e5] px-3 py-2 font-mono text-sm"
          />
          {error && <p className="text-xs text-red-700">{error}</p>}
          {success && <p className="text-xs font-semibold text-green-700">{success}</p>}
          <button
            type="button"
            onClick={handleImport}
            className="rounded-lg bg-[#4c00ff] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3d00cc]"
          >
            Add recipients from paste
          </button>
        </div>
      )}

      {!pasteOpen && error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {!pasteOpen && success && <p className="mt-2 text-xs font-semibold text-green-700">{success}</p>}
    </div>
  );
}
