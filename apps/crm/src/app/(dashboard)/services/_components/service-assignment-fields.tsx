"use client";

import { useState } from "react";
import { ChevronsUpDown, Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface UserOption {
  id: number;
  name: string;
  image?: string | null;
}

export interface VendorOption {
  id: number;
  name: string;
  phone: string | null;
}

interface ServiceAssignmentFieldsProps {
  users: UserOption[];
  vendors: VendorOption[];
  defaultAssigneeIds?: number[];
  defaultVendorName?: string | null;
  defaultVendorPhone?: string | null;
  defaultLandlordSelf?: boolean;
}

export function ServiceAssignmentFields({
  users,
  vendors,
  defaultAssigneeIds = [],
  defaultVendorName = "",
  defaultVendorPhone = "",
  defaultLandlordSelf = false,
}: ServiceAssignmentFieldsProps) {
  const [staffOpen, setStaffOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>(defaultAssigneeIds);
  const [vendorName, setVendorName] = useState(defaultVendorName ?? "");
  const [vendorPhone, setVendorPhone] = useState(defaultVendorPhone ?? "");
  const [landlordSelf, setLandlordSelf] = useState(defaultLandlordSelf);

  const selectedUsers = users.filter((u) => selectedIds.includes(u.id));

  const toggleUser = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // Picking a known vendor auto-fills its phone; free-typed names are kept as-is
  // and created on save (server upserts by name).
  const handleVendorName = (name: string) => {
    setVendorName(name);
    const match = vendors.find((v) => v.name === name);
    if (match?.phone) setVendorPhone(match.phone);
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {/* 담당자 — our staff, multiple */}
      <Field>
        <Label>담당자</Label>
        <input
          type="hidden"
          name="assignee_user_ids"
          value={JSON.stringify(selectedIds)}
        />
        <Popover open={staffOpen} onOpenChange={setStaffOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-8 w-full justify-between px-2.5 font-normal"
              />
            }
          >
            {selectedUsers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedUsers.map((u) => (
                  <Badge
                    key={u.id}
                    variant="outline"
                    className="gap-1 py-0.5 pr-1 pl-1"
                  >
                    <Avatar className="size-4">
                      {u.image && <AvatarImage src={u.image} alt="" />}
                      <AvatarFallback className="text-[8px]">
                        {u.name.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    {u.name}
                    <button
                      type="button"
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUser(u.id);
                      }}
                    >
                      <X className="size-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">담당자 선택</span>
            )}
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-[--anchor-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="이름 검색..." />
              <CommandList>
                <CommandEmpty>결과 없음</CommandEmpty>
                <CommandGroup>
                  {users.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={`${u.name} ${u.id}`}
                      onSelect={() => toggleUser(u.id)}
                    >
                      <Check
                        className={cn(
                          "mr-1.5 size-3.5",
                          selectedIds.includes(u.id)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <Avatar className="mr-2 size-5">
                        {u.image && <AvatarImage src={u.image} alt="" />}
                        <AvatarFallback className="text-[9px]">
                          {u.name.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      {u.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </Field>

      {/* 외부 업체 — name with datalist autocomplete */}
      <Field>
        <Label htmlFor="vendor_name">외부 업체</Label>
        <Input
          id="vendor_name"
          name="vendor_name"
          list="service-vendor-options"
          value={vendorName}
          onChange={(e) => handleVendorName(e.target.value)}
          placeholder="업체명 (직접 입력 가능)"
          autoComplete="off"
        />
        <datalist id="service-vendor-options">
          {vendors.map((v) => (
            <option key={v.id} value={v.name} />
          ))}
        </datalist>
      </Field>

      {/* 업체 연락처 */}
      <Field>
        <Label htmlFor="vendor_phone">업체 연락처</Label>
        <Input
          id="vendor_phone"
          name="vendor_phone"
          type="tel"
          value={vendorPhone}
          onChange={(e) => setVendorPhone(e.target.value)}
          placeholder="010-0000-0000"
        />
      </Field>

      {/* 임대인 직접 처리 */}
      <Field>
        <Label>임대인 직접 처리</Label>
        <input
          type="hidden"
          name="landlord_self"
          value={String(landlordSelf)}
        />
        <label className="flex h-8 items-center gap-2 text-sm">
          <Checkbox
            checked={landlordSelf}
            onCheckedChange={(checked: boolean) => setLandlordSelf(checked)}
          />
          임대인이 직접 처리함
        </label>
      </Field>
    </div>
  );
}
