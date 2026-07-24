"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { searchAddress, type PostcodifyResult } from "@/lib/postcodify";

/** Free-text address input with Postcodify suggestions as an assist.
 *  The visible input is the submitted `address`; picking a suggestion also
 *  fills hidden `address_jibeon`/`address_en`. Editing after a pick reverts
 *  to free text (hidden fields clear). */
export function AddressField() {
  const [value, setValue] = useState("");
  const [jibeon, setJibeon] = useState("");
  const [addressEn, setAddressEn] = useState("");
  const [results, setResults] = useState<PostcodifyResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const reqIdRef = useRef(0);

  const handleChange = useCallback((v: string) => {
    setValue(v);
    setJibeon("");
    setAddressEn("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      startTransition(async () => {
        const { results: r } = await searchAddress(v);
        if (reqId !== reqIdRef.current) return;
        setResults(r);
        setIsOpen(r.length > 0);
      });
    }, 350);
  }, []);

  const handleSelect = (r: PostcodifyResult) => {
    setValue(`${r.ko_common} ${r.ko_doro}`.trim());
    setJibeon(`${r.ko_common} ${r.ko_jibeon}`.trim());
    setAddressEn(`${r.en_doro}, ${r.en_common}`.trim());
    setIsOpen(false);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="address_jibeon" value={jibeon} />
      <input type="hidden" name="address_en" value={addressEn} />
      <Field name="address">
        <Label htmlFor="address">주소</Label>
        <div className="relative">
          <Input
            id="address"
            name="address"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="도로명·지번·건물명 — 검색하거나 그냥 입력"
            autoComplete="off"
          />
          {isPending && (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {isOpen && (
          <div className="max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-md">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
              >
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-primary" />
                  <span className="font-medium">
                    {r.ko_common} {r.ko_doro}
                  </span>
                </span>
                {r.ko_jibeon && (
                  <span className="ml-5 text-xs text-muted-foreground">
                    (지번) {r.ko_common} {r.ko_jibeon}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {jibeon && (
          <p className="text-xs text-muted-foreground">지번: {jibeon}</p>
        )}
      </Field>
      <Field name="address_detail">
        <Label htmlFor="address_detail">상세주소</Label>
        <Input
          id="address_detail"
          name="address_detail"
          placeholder="동/호수, 층 등"
        />
      </Field>
    </div>
  );
}
