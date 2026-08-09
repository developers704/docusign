"use client";

import { useRef, useState } from "react";
import { Icon, type IconName } from "./Icons";

type Field = { id: number; type: string; x: number; y: number; label: string };
const palette: Array<{ type: string; label: string; icon: IconName }> = [
  { type: "signature", label: "Signature", icon: "agreement" },
  { type: "initials", label: "Initials", icon: "template" },
  { type: "name", label: "Name", icon: "contact" },
  { type: "date", label: "Date signed", icon: "calendar" },
  { type: "text", label: "Text", icon: "file" },
  { type: "checkbox", label: "Checkbox", icon: "check" },
];

export default function FieldEditorDemo() {
  const [fields, setFields] = useState<Field[]>([
    { id: 1, type: "signature", x: 50, y: 70, label: "Signature" },
    { id: 2, type: "date", x: 64, y: 78, label: "Date signed" },
  ]);
  const [selected, setSelected] = useState(1);
  const nextId = useRef(3);

  function add(type: string, label: string) {
    const id = nextId.current;
    nextId.current += 1;
    setFields((current) => [...current, { id, type, label, x: 45, y: 45 }]);
    setSelected(id);
  }

  return <div className="flex h-[calc(100vh-74px)] min-h-[720px] overflow-hidden bg-[#ebe8ee]">
    <aside className="w-[240px] shrink-0 border-r border-[#ded7e3] bg-white p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#9b91a4]">Fields</p>
      <p className="mt-2 text-xs leading-5 text-[#766c80]">Select a field to place it on the document.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">{palette.map((item)=><button key={item.type} onClick={()=>add(item.type,item.label)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-[#e6e0e9] bg-[#fcfbfd] p-2 text-center text-xs font-bold hover:border-[#9e7aff] hover:bg-[#f5f0ff]"><Icon name={item.icon} className="h-5 w-5 text-[#4c00ff]"/><span>{item.label}</span></button>)}</div>
      <div className="mt-6 rounded-xl bg-[#f5f1ff] p-4"><p className="text-xs font-extrabold text-[#4c00ff]">Recipient</p><select className="mt-3 w-full rounded-lg border border-[#d9cffa] bg-white px-3 py-2 text-xs font-bold"><option>1. Customer signer</option><option>2. Office approver</option></select></div>
    </aside>
    <main className="min-w-0 flex-1 overflow-auto p-8 scrollbar-thin">
      <div className="mx-auto w-[720px] rounded-lg bg-white p-14 shadow-2xl shadow-[#2e1c42]/20">
        <div className="border-b-2 border-[#2c2038] pb-5"><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-[#4c00ff]">Valliani Documents</p><h1 className="mt-2 text-2xl font-extrabold">Jewelry Purchase & Custom Order Contract</h1><p className="mt-2 text-xs text-[#716678]">Contract ID: SAMPLE-2026-001</p></div>
        <div className="relative mt-7 min-h-[780px] text-[12px] leading-6 text-[#473a52]">
          <h2 className="text-sm font-extrabold text-[#23152f]">Customer Information</h2><div className="mt-3 grid grid-cols-2 gap-4"><p><strong>Name:</strong> Customer Name</p><p><strong>Email:</strong> customer@example.com</p><p><strong>Phone:</strong> (555) 000-0000</p><p><strong>Order:</strong> VJ-001245</p></div>
          <h2 className="mt-7 text-sm font-extrabold text-[#23152f]">Contract Terms</h2><p className="mt-3">The customer confirms that product details, sizing, engraving, materials, pricing, deposit and delivery information have been reviewed and approved.</p><p className="mt-3">Custom-made, engraved, resized or special-order products may be subject to additional cancellation and return restrictions.</p>
          <div className="mt-8 rounded-xl border border-[#e6e0e9] bg-[#faf8fc] p-5"><h3 className="font-extrabold text-[#23152f]">Product Summary</h3><div className="mt-3 grid grid-cols-2 gap-y-2"><p>Product: Custom Jewelry</p><p>Total: $0.00</p><p>Metal: 14K Gold</p><p>Deposit: $0.00</p></div></div>
          <h2 className="mt-8 text-sm font-extrabold text-[#23152f]">Authorization</h2><p className="mt-3">By signing below, the customer agrees to conduct this transaction electronically and confirms their intent to sign this contract.</p>
          {fields.map((field)=><button key={field.id} onClick={()=>setSelected(field.id)} className={`absolute flex min-w-32 items-center gap-2 rounded-md border-2 bg-[#f5efff]/95 px-3 py-2 text-left text-[11px] font-extrabold text-[#4c00ff] shadow-md ${selected===field.id?"border-[#4c00ff] ring-4 ring-[#e6dcff]":"border-[#a98cff]"}`} style={{left:`${field.x}%`,top:`${field.y}%`}}><Icon name={field.type==="date"?"calendar":field.type==="checkbox"?"check":"agreement"} className="h-4 w-4"/>{field.label}</button>)}
        </div>
      </div>
    </main>
    <aside className="w-[280px] shrink-0 border-l border-[#ded7e3] bg-white p-5">
      <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#9b91a4]">Field properties</p>
      <h3 className="mt-3 text-lg font-extrabold">{fields.find(f=>f.id===selected)?.label||"Select a field"}</h3>
      <div className="mt-5 space-y-4"><label className="block text-xs font-bold">Assigned recipient<select className="mt-2 w-full rounded-xl border border-[#e0dae5] px-3 py-2.5 text-xs"><option>Customer signer</option></select></label><label className="flex items-center justify-between rounded-xl border border-[#e8e2ec] p-3 text-xs font-bold">Required<input type="checkbox" defaultChecked className="h-4 w-4 accent-[#4c00ff]"/></label><label className="block text-xs font-bold">Tooltip<input className="mt-2 w-full rounded-xl border border-[#e0dae5] px-3 py-2.5 text-xs" defaultValue="Sign here"/></label></div>
      <button onClick={()=>setFields(current=>current.filter(f=>f.id!==selected))} className="mt-6 w-full rounded-xl border border-red-200 px-4 py-2.5 text-xs font-extrabold text-red-700">Delete field</button>
      <div className="mt-8 border-t border-[#eee9f1] pt-5"><button className="w-full rounded-xl bg-[#4c00ff] px-4 py-3 text-sm font-extrabold text-white">Save & send</button><button className="mt-2 w-full rounded-xl border border-[#e2dbe6] px-4 py-3 text-sm font-extrabold">Save as draft</button></div>
    </aside>
  </div>;
}
