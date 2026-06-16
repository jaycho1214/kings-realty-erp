"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { searchAddress, type PostcodifyResult } from "@/lib/postcodify";

export interface AddressData {
  postcode5: string;
  address: string; // ko_common + ko_doro (도로명 full)
  address_jibeon: string; // ko_common + ko_jibeon
  address_en: string; // en_common + en_doro
  building_name: string;
}

interface AddressSearchProps {
  defaultValues?: {
    address: string;
    address_detail: string | null;
    address_en: string | null;
  };
  onSelect?: (data: AddressData) => void;
}

export function AddressSearch({ defaultValues, onSelect }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PostcodifyResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<AddressData | null>(
    defaultValues?.address
      ? {
          postcode5: "",
          address: defaultValues.address,
          address_jibeon: "",
          address_en: defaultValues.address_en ?? "",
          building_name: "",
        }
      : null,
  );
  const [addressDetail, setAddressDetail] = useState(
    defaultValues?.address_detail ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const reqIdRef = useRef(0);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      startTransition(async () => {
        const { results: r, error: e } = await searchAddress(value);
        // Ignore out-of-order responses from superseded queries
        if (reqId !== reqIdRef.current) return;
        setResults(r);
        setError(e ?? null);
        setIsOpen(r.length > 0);
      });
    }, 350);
  }, []);

  const handleSelect = (result: PostcodifyResult) => {
    const data: AddressData = {
      postcode5: result.postcode5,
      address: `${result.ko_common} ${result.ko_doro}`.trim(),
      address_jibeon: `${result.ko_common} ${result.ko_jibeon}`.trim(),
      address_en: `${result.en_doro}, ${result.en_common}`.trim(),
      building_name: result.building_name,
    };
    setSelected(data);
    setIsOpen(false);
    setQuery("");
    setAddressDetail("");
    onSelect?.(data);
  };

  return (
    <div className="space-y-3">
      {/* Hidden inputs for form submission */}
      <input type="hidden" name="address" value={selected?.address ?? ""} />
      <input
        type="hidden"
        name="address_en"
        value={selected?.address_en ?? ""}
      />

      {/* Search input */}
      <Field>
        <Label>
          주소 <span className="text-danger">*</span>
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="도로명, 지번, 건물명으로 검색"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
          {isPending && (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Results dropdown */}
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
                    [{r.postcode5}] {r.ko_common} {r.ko_doro}
                  </span>
                </span>
                <span className="ml-5 text-xs text-muted-foreground">
                  {r.ko_jibeon && (
                    <span>
                      (지번) {r.ko_common} {r.ko_jibeon}
                    </span>
                  )}
                  {r.building_name && <span> | {r.building_name}</span>}
                </span>
                <span className="ml-5 text-xs text-muted-foreground">
                  {r.en_doro}, {r.en_common}
                </span>
              </button>
            ))}
          </div>
        )}

        {error && !isOpen && query.length >= 2 && (
          <p className="text-xs text-muted-foreground">{error}</p>
        )}
      </Field>

      {/* Selected address display */}
      {selected && (
        <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              {selected.postcode5 && (
                <span className="mr-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {selected.postcode5}
                </span>
              )}
              <span className="font-medium">{selected.address}</span>
              {selected.building_name && (
                <p className="text-xs text-muted-foreground">
                  {selected.building_name}
                </p>
              )}
              {selected.address_en && (
                <p className="text-xs text-muted-foreground">
                  {selected.address_en}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setSelected(null)}
            >
              변경
            </Button>
          </div>
        </div>
      )}

      {/* Detail address */}
      <Field>
        <Label htmlFor="address_detail">상세주소</Label>
        <Input
          id="address_detail"
          name="address_detail"
          value={addressDetail}
          onChange={(e) => setAddressDetail(e.target.value)}
          placeholder="동/호수 등 상세주소"
        />
      </Field>
    </div>
  );
}
