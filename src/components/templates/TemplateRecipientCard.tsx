"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import type { SigningOrderRecipient } from "@/components/templates/SigningOrderDiagramModal";

const ACTION_OPTIONS = [
  { value: "needs_to_sign", label: "Needs to Sign", icon: "file" as const },
  { value: "in_person_signer", label: "In Person Signer", icon: "team" as const },
  { value: "receives_a_copy", label: "Receives a Copy", icon: "send" as const },
  { value: "needs_to_view", label: "Needs to View", icon: "search" as const },
];

type ContactItem = { name: string; email: string; agreements?: number };

function actionLabel(action: string) {
  return ACTION_OPTIONS.find((item) => item.value === action)?.label || "Needs to Sign";
}

let contactsCache: ContactItem[] | null = null;
let contactsPromise: Promise<ContactItem[]> | null = null;

async function loadContacts() {
  if (contactsCache) return contactsCache;
  if (!contactsPromise) {
    contactsPromise = fetch("/api/contacts")
      .then(async (response) => {
        const data = (await response.json()) as { items?: ContactItem[] };
        if (!response.ok) return [];
        return Array.isArray(data.items) ? data.items : [];
      })
      .catch(() => [] as ContactItem[])
      .then((items) => {
        contactsCache = items;
        return items;
      });
  }
  return contactsPromise;
}

export default function TemplateRecipientCard({
  recipient,
  index,
  color,
  signingOrder,
  signingStep,
  onSigningStepChange,
  canRemove,
  onChange,
  onRemove,
  onMove,
}: {
  recipient: SigningOrderRecipient;
  index: number;
  color: string;
  signingOrder: boolean;
  signingStep?: number;
  onSigningStepChange?: (step: number) => void;
  canRemove: boolean;
  onChange: (patch: Partial<SigningOrderRecipient>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [actionOpen, setActionOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [contacts, setContacts] = useState<ContactItem[]>(contactsCache || []);
  const [contactQuery, setContactQuery] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [privateMessage, setPrivateMessage] = useState("");
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [showPrivateMessage, setShowPrivateMessage] = useState(false);
  const [signingStepDraft, setSigningStepDraft] = useState("");
  const actionRef = useRef<HTMLDivElement>(null);
  const customizeRef = useRef<HTMLDivElement>(null);
  const contactsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (actionOpen && !actionRef.current?.contains(target)) setActionOpen(false);
      if (customizeOpen && !customizeRef.current?.contains(target)) setCustomizeOpen(false);
      if (contactsOpen && !contactsRef.current?.contains(target)) setContactsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionOpen(false);
        setCustomizeOpen(false);
        setContactsOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [actionOpen, customizeOpen, contactsOpen]);

  useEffect(() => {
    void loadContacts().then((items) => setContacts(items));
  }, []);

  useEffect(() => {
    if (!contactsOpen && !nameFocused) return;
    let cancelled = false;
    setContactsLoading(true);
    void loadContacts().then((items) => {
      if (cancelled) return;
      setContacts(items);
      setContactsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contactsOpen, nameFocused]);

  useEffect(() => {
    setSigningStepDraft("");
  }, [recipient.id, signingStep]);

  const filteredContacts = useMemo(() => {
    const q = (contactsOpen ? contactQuery : recipient.name).trim().toLowerCase();
    if (!q) return contacts.slice(0, 10);
    return contacts
      .filter(
        (item) => item.name.toLowerCase().includes(q) || item.email.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [contacts, contactQuery, contactsOpen, recipient.name]);

  const showNameSuggestions = nameFocused;

  function openContacts() {
    setContactsOpen((value) => !value);
    setActionOpen(false);
    setCustomizeOpen(false);
    setContactQuery("");
  }

  function pickContact(item: ContactItem) {
    onChange({ name: item.name, email: item.email });
    setContactsOpen(false);
    setNameFocused(false);
    setContactQuery("");
  }

  return (
    <div className="overflow-visible rounded border border-[#d8d8d8] bg-white shadow-[0_1px_2px_rgba(0,0,0,.04)]">
      <div className="flex">
        <span className="w-[5px] shrink-0 self-stretch" style={{ backgroundColor: color }} />

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            {signingOrder && (
              <div className="flex w-10 shrink-0 flex-col items-center pt-1">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={signingStepDraft || String(signingStep ?? index + 1)}
                  onChange={(event) => setSigningStepDraft(event.target.value)}
                  onBlur={() => {
                    const step = Math.max(1, Number(signingStepDraft || signingStep || index + 1) || 1);
                    onSigningStepChange?.(step);
                    setSigningStepDraft("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  aria-label={`Signing order for ${recipient.name || recipient.role}`}
                  title="Edit signing order — lower number signs first"
                  className="mb-2 h-8 w-8 rounded border border-[#c6c6c6] text-center text-[14px] font-semibold text-[#666] outline-none focus:border-[#4c00ff]"
                />
                <button type="button" aria-label="Move up" onClick={() => onMove(-1)} className="text-[#999] hover:text-[#000]">
                  <Icon name="chevron" className="h-3.5 w-3.5 -rotate-90" />
                </button>
                <span className="my-0.5 grid grid-cols-2 gap-0.5 opacity-40" aria-hidden>
                  <span className="h-1 w-1 rounded-full bg-[#666]" />
                  <span className="h-1 w-1 rounded-full bg-[#666]" />
                  <span className="h-1 w-1 rounded-full bg-[#666]" />
                  <span className="h-1 w-1 rounded-full bg-[#666]" />
                  <span className="h-1 w-1 rounded-full bg-[#666]" />
                  <span className="h-1 w-1 rounded-full bg-[#666]" />
                </span>
                <button type="button" aria-label="Move down" onClick={() => onMove(1)} className="text-[#999] hover:text-[#000]">
                  <Icon name="chevron" className="h-3.5 w-3.5 rotate-90" />
                </button>
              </div>
            )}

            <div className="w-full max-w-[360px] space-y-3">
              <label className="block">
                <span className="mb-1 block text-[13px] text-[#666]">Role</span>
                <input
                  value={recipient.role}
                  onChange={(event) => onChange({ role: event.target.value })}
                  className="h-10 w-full rounded border border-[#c6c6c6] px-3 text-[15px] outline-none focus:border-[#4c00ff]"
                />
              </label>

              <div className="block">
                <span className="mb-1 block text-[13px] text-[#666]">
                  Name <span className="text-[#b00020]">*</span>
                </span>
                <div className="relative" ref={contactsRef}>
                  <button
                    type="button"
                    onClick={openContacts}
                    title="Choose from previous customers"
                    className="absolute left-1.5 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-[#666] hover:bg-[#f0ebff] hover:text-[#4c00ff]"
                  >
                    <Icon name="contact" className="h-4 w-4" />
                  </button>
                  <input
                    value={recipient.name}
                    onChange={(event) => onChange({ name: event.target.value })}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => {
                      window.setTimeout(() => setNameFocused(false), 180);
                    }}
                    placeholder="Name"
                    className="h-10 w-full rounded border border-[#c6c6c6] pl-9 pr-3 text-[15px] outline-none focus:border-[#4c00ff]"
                    autoComplete="off"
                  />
                  {showNameSuggestions && (
                    <div className="absolute left-0 right-0 z-40 mt-1 max-h-[min(50vh,320px)] overflow-hidden rounded border border-[#d8d8d8] bg-white shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                      <div className="max-h-[min(50vh,320px)] overflow-y-auto py-1">
                        {contactsLoading ? (
                          <p className="px-3 py-3 text-center text-[12px] text-[#888]">Loading suggestions…</p>
                        ) : filteredContacts.length === 0 ? (
                          <p className="px-3 py-3 text-center text-[12px] text-[#888]">
                            {contacts.length === 0
                              ? "No saved contacts yet — they appear after you send contracts."
                              : "No match — keep typing or enter a new name."}
                          </p>
                        ) : (
                          filteredContacts.map((item) => (
                            <button
                              key={item.email.toLowerCase()}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => pickContact(item)}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f7f4ff]"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e9e1ff] text-[10px] font-extrabold text-[#4c00ff]">
                                {item.name.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-[#212121]">{item.name}</span>
                                <span className="block truncate text-[12px] text-[#666]">{item.email}</span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  {contactsOpen && (
                    <div className="absolute left-0 right-0 z-40 mt-1 max-h-[min(70vh,480px)] overflow-hidden rounded border border-[#d8d8d8] bg-white shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                      <div className="border-b border-[#eee] p-2">
                        <div className="relative">
                          <Icon name="search" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#888]" />
                          <input
                            autoFocus
                            value={contactQuery}
                            onChange={(event) => setContactQuery(event.target.value)}
                            placeholder="Search customers…"
                            className="h-9 w-full rounded border border-[#c6c6c6] pl-8 pr-2 text-[13px] outline-none focus:border-[#4c00ff]"
                          />
                        </div>
                      </div>
                      <div className="max-h-[min(60vh,400px)] overflow-y-auto py-1">
                        {contactsLoading ? (
                          <p className="px-3 py-4 text-center text-[12px] text-[#888]">Loading customers…</p>
                        ) : filteredContacts.length === 0 ? (
                          <p className="px-3 py-4 text-center text-[12px] text-[#888]">
                            {contacts.length === 0
                              ? "No previous customers yet. They appear after you send contracts."
                              : "No match found."}
                          </p>
                        ) : (
                          filteredContacts.map((item) => (
                            <button
                              key={item.email.toLowerCase()}
                              type="button"
                              onClick={() => pickContact(item)}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#f7f4ff]"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e9e1ff] text-[10px] font-extrabold text-[#4c00ff]">
                                {item.name.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-[#212121]">{item.name}</span>
                                <span className="block truncate text-[12px] text-[#666]">{item.email}</span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[13px] text-[#666]">
                  Email <span className="text-[#b00020]">*</span>
                </span>
                <input
                  type="email"
                  value={recipient.email}
                  onChange={(event) => onChange({ email: event.target.value })}
                  placeholder="Email"
                  className="h-10 w-full rounded border border-[#c6c6c6] px-3 text-[15px] outline-none focus:border-[#4c00ff]"
                />
              </label>

              {showAccessCode && (
                <label className="block">
                  <span className="mb-1 block text-[13px] text-[#666]">Access code</span>
                  <input
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    placeholder="Enter access code"
                    className="h-10 w-full rounded border border-[#c6c6c6] px-3 text-[15px] outline-none focus:border-[#4c00ff]"
                  />
                </label>
              )}
              {showPrivateMessage && (
                <label className="block">
                  <span className="mb-1 block text-[13px] text-[#666]">Private message</span>
                  <textarea
                    value={privateMessage}
                    onChange={(event) => setPrivateMessage(event.target.value)}
                    rows={2}
                    placeholder="Include a personal note"
                    className="w-full rounded border border-[#c6c6c6] px-3 py-2 text-[15px] outline-none focus:border-[#4c00ff]"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-start gap-2 md:justify-end">
            <div className="relative" ref={actionRef}>
              <button
                type="button"
                onClick={() => {
                  setActionOpen((value) => !value);
                  setCustomizeOpen(false);
                  setContactsOpen(false);
                }}
                className="inline-flex h-10 items-center gap-2 rounded border border-[#c6c6c6] bg-[#f3f3f3] px-3 text-[14px] font-semibold text-[#4c00ff]"
              >
                <Icon name="file" className="h-4 w-4" />
                {actionLabel(recipient.action)}
                <Icon name="chevron" className="h-3.5 w-3.5 rotate-90 text-[#666]" />
              </button>
              {actionOpen && (
                <div className="absolute right-0 z-30 mt-1 w-[240px] overflow-hidden rounded border border-[#d8d8d8] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                  {ACTION_OPTIONS.map((option) => {
                    const selected = recipient.action === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange({ action: option.value });
                          setActionOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] hover:bg-[#f5f5f5] ${
                          selected ? "bg-[#f7f4ff] font-semibold text-[#4c00ff]" : "text-[#000]"
                        }`}
                      >
                        <Icon name={option.icon} className="h-4 w-4" />
                        <span className="flex-1">{option.label}</span>
                        {selected && <Icon name="check" className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative" ref={customizeRef}>
              <button
                type="button"
                onClick={() => {
                  setCustomizeOpen((value) => !value);
                  setActionOpen(false);
                  setContactsOpen(false);
                }}
                className="inline-flex h-10 items-center gap-2 rounded border border-[#c6c6c6] bg-[#f3f3f3] px-3 text-[14px] font-semibold text-[#000]"
              >
                Customize
                <Icon name="chevron" className="h-3.5 w-3.5 rotate-90 text-[#666]" />
              </button>
              {customizeOpen && (
                <div className="absolute right-0 z-30 mt-1 w-[300px] overflow-hidden rounded border border-[#d8d8d8] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAccessCode(true);
                      setCustomizeOpen(false);
                    }}
                    className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-[#f5f5f5]"
                  >
                    <Icon name="shield" className="mt-0.5 h-4 w-4 text-[#666]" />
                    <span>
                      <span className="block text-[14px] font-semibold text-[#000]">Add access code</span>
                      <span className="mt-0.5 block text-[12px] text-[#666]">Enter a code that only you and this recipient know.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPrivateMessage(true);
                      setCustomizeOpen(false);
                    }}
                    className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-[#f5f5f5]"
                  >
                    <Icon name="bell" className="mt-0.5 h-4 w-4 text-[#666]" />
                    <span>
                      <span className="block text-[14px] font-semibold text-[#000]">Add private message</span>
                      <span className="mt-0.5 block text-[12px] text-[#666]">Include a personal note with this recipient.</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => setCustomizeOpen(false)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#f5f5f5]">
                    <Icon name="settings" className="h-4 w-4 text-[#666]" />
                    <span className="text-[14px] font-semibold text-[#000]">Advanced settings</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label={`Remove ${recipient.role || "recipient"}`}
              onClick={onRemove}
              disabled={!canRemove}
              className="inline-flex h-10 w-10 items-center justify-center rounded text-[#666] hover:bg-[#f2f2f2] disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16M9 7V5h6v2M8 7l1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
