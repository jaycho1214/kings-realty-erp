"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CountryOption {
  code: string;
  dial: string;
  flag: string;
  format: (digits: string) => string;
  maxDigits: number;
}

const COUNTRIES: CountryOption[] = [
  {
    code: "KR",
    dial: "+82",
    flag: "🇰🇷",
    maxDigits: 11,
    format: (d) => {
      if (d.length <= 3) return d;
      if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
      return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    },
  },
  {
    code: "US",
    dial: "+1",
    flag: "🇺🇸",
    maxDigits: 10,
    format: (d) => {
      if (d.length <= 3) return d;
      if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
      return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    },
  },
];

function parseExistingValue(value: string): {
  countryCode: string;
  digits: string;
} {
  for (const c of COUNTRIES) {
    if (value.startsWith(c.dial)) {
      return {
        countryCode: c.code,
        digits: value.slice(c.dial.length).replace(/\D/g, ""),
      };
    }
  }
  // Default: assume Korea, strip hyphens
  return { countryCode: "KR", digits: value.replace(/\D/g, "") };
}

interface PhoneInputProps {
  name: string;
  id?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  defaultCountry?: string;
  className?: string;
}

export function PhoneInput({
  name,
  id,
  required,
  defaultValue = "",
  placeholder,
  defaultCountry = "KR",
  className,
}: PhoneInputProps) {
  const parsed = defaultValue
    ? parseExistingValue(defaultValue)
    : { countryCode: defaultCountry, digits: "" };
  const [countryCode, setCountryCode] = useState(parsed.countryCode);
  const [digits, setDigits] = useState(parsed.digits);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const country = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];
  const formatted = country.format(digits);
  const fullValue = digits ? `${country.dial}${digits}` : "";

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "");
      setDigits(raw.slice(0, country.maxDigits));
    },
    [country.maxDigits],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow backspace to remove digits naturally
      if (e.key === "Backspace" && formatted.endsWith("-")) {
        e.preventDefault();
        setDigits((prev) => prev.slice(0, -1));
      }
    },
    [formatted],
  );

  const selectCountry = useCallback((code: string) => {
    setCountryCode(code);
    setDropdownOpen(false);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative flex", className)}>
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={fullValue} />

      {/* Country code picker */}
      <button
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        className="flex h-8 items-center gap-1 rounded-l-lg border border-r-0 border-input bg-muted/50 px-2 text-sm whitespace-nowrap hover:bg-muted transition-colors"
      >
        <span className="text-base leading-none">{country.flag}</span>
        <span className="text-muted-foreground text-xs">{country.dial}</span>
        <svg
          className="size-3 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {dropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-input bg-popover shadow-md">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => selectCountry(c.code)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors first:rounded-t-lg last:rounded-b-lg",
                c.code === countryCode && "bg-accent",
              )}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span>{c.dial}</span>
              <span className="text-muted-foreground">{c.code}</span>
            </button>
          ))}
        </div>
      )}

      {/* Phone number input */}
      <input
        id={id}
        type="tel"
        value={formatted}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        required={required}
        placeholder={
          placeholder ??
          (countryCode === "KR" ? "010-0000-0000" : "000-000-0000")
        }
        className="h-8 w-full min-w-0 rounded-r-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm"
      />
    </div>
  );
}
