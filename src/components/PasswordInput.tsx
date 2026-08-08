"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Icon } from "./Icons";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
};

/** Password input: hidden by default, eye toggles visibility. */
export default function PasswordInput({ label, className = "", id, ...props }: Props) {
  const autoId = useId();
  const inputId = id || autoId;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      {label ? (
        <label htmlFor={inputId} className="mb-2 block text-sm font-bold text-[#372748]">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          {...props}
          id={inputId}
          type={visible ? "text" : "password"}
          className={
            className ||
            "h-12 w-full rounded-xl border border-[#ddd6e2] bg-white px-4 pr-12 text-sm outline-none transition placeholder:text-[#aaa0b2] focus:border-[#7950ff] focus:ring-4 focus:ring-[#eee8ff]"
          }
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute right-2 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#716678] hover:bg-[#f3eff8] hover:text-[#372748]"
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          <Icon name={visible ? "eyeOff" : "eye"} className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
