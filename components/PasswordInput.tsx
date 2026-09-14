"use client";

import { useState } from "react";

/** A password `<input>` with a show/hide toggle — used on every password field in the app. */
export default function PasswordInput({
  className = "input",
  placeholder,
  value,
  onChange,
  autoFocus,
}: {
  className?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        className={`${className} pr-16`}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-600"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
