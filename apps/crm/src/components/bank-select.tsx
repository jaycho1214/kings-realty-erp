"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

interface Bank {
  code: string;
  name: string;
  logo: string;
  category: "commercial" | "special" | "regional" | "internet" | "other";
}

const BANKS: Bank[] = [
  // 시중은행
  {
    code: "KB",
    name: "KB국민은행",
    logo: "/banks/kb.png",
    category: "commercial",
  },
  {
    code: "SHINHAN",
    name: "신한은행",
    logo: "/banks/shinhan.png",
    category: "commercial",
  },
  {
    code: "WOORI",
    name: "우리은행",
    logo: "/banks/woori.png",
    category: "commercial",
  },
  {
    code: "HANA",
    name: "하나은행",
    logo: "/banks/hana.png",
    category: "commercial",
  },
  {
    code: "NH",
    name: "NH농협은행",
    logo: "/banks/nh.png",
    category: "commercial",
  },
  {
    code: "IBK",
    name: "IBK기업은행",
    logo: "/banks/ibk.png",
    category: "commercial",
  },
  {
    code: "SC",
    name: "SC제일은행",
    logo: "/banks/sc.png",
    category: "commercial",
  },
  {
    code: "CITI",
    name: "한국씨티은행",
    logo: "/banks/citi.png",
    category: "commercial",
  },
  // 특수은행
  {
    code: "KDB",
    name: "KDB산업은행",
    logo: "/banks/kdb.png",
    category: "special",
  },
  {
    code: "SUHYUP",
    name: "Sh수협은행",
    logo: "/banks/suhyup.png",
    category: "special",
  },
  {
    code: "EXIMBANK",
    name: "한국수출입은행",
    logo: "/banks/eximbank.png",
    category: "special",
  },
  // 지방은행
  {
    code: "DGB",
    name: "DGB대구은행",
    logo: "/banks/dgb.png",
    category: "regional",
  },
  {
    code: "BNK_BUSAN",
    name: "BNK부산은행",
    logo: "/banks/bnk_busan.png",
    category: "regional",
  },
  {
    code: "BNK_GYEONGNAM",
    name: "BNK경남은행",
    logo: "/banks/bnk_gyeongnam.png",
    category: "regional",
  },
  {
    code: "KWANGJU",
    name: "광주은행",
    logo: "/banks/kwangju.png",
    category: "regional",
  },
  {
    code: "JEONBUK",
    name: "전북은행",
    logo: "/banks/jeonbuk.png",
    category: "regional",
  },
  {
    code: "JEJU",
    name: "제주은행",
    logo: "/banks/jeju.png",
    category: "regional",
  },
  // 인터넷전문은행
  {
    code: "KAKAO",
    name: "카카오뱅크",
    logo: "/banks/kakao.png",
    category: "internet",
  },
  {
    code: "KBANK",
    name: "케이뱅크",
    logo: "/banks/kbank.png",
    category: "internet",
  },
  {
    code: "TOSS",
    name: "토스뱅크",
    logo: "/banks/toss.png",
    category: "internet",
  },
  // 기타
  {
    code: "KFCC",
    name: "새마을금고",
    logo: "/banks/kfcc.png",
    category: "other",
  },
  { code: "CU", name: "신협", logo: "/banks/cu.png", category: "other" },
  { code: "POST", name: "우체국", logo: "/banks/post.png", category: "other" },
  {
    code: "NACUFOK",
    name: "산림조합",
    logo: "/banks/nacufok.png",
    category: "other",
  },
];

const CATEGORIES = [
  { key: "commercial", label: "시중은행" },
  { key: "special", label: "특수은행" },
  { key: "regional", label: "지방은행" },
  { key: "internet", label: "인터넷전문은행" },
  { key: "other", label: "기타 금융기관" },
] as const;

function BankLogo({
  src,
  name,
  size = 20,
}: {
  src: string;
  name: string;
  size?: number;
}) {
  return (
    <Image
      src={src}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 rounded-sm object-contain"
    />
  );
}

interface BankSelectProps {
  name: string;
  id?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

export function BankSelect({
  name,
  id,
  defaultValue = "",
  placeholder = "은행 선택",
  className,
}: BankSelectProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);

  const selectedBank = BANKS.find((b) => b.name === value);

  const handleSelect = useCallback((bankName: string) => {
    setValue(bankName);
    setOpen(false);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={value} />
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "h-8 w-full justify-between px-2.5 font-normal",
              !selectedBank && "text-muted-foreground",
              className,
            )}
          >
            <span className="flex items-center gap-2 truncate">
              {selectedBank ? (
                <>
                  <BankLogo src={selectedBank.logo} name={selectedBank.name} />
                  {selectedBank.name}
                </>
              ) : (
                placeholder
              )}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-[--anchor-width] p-0">
        <Command>
          <CommandInput placeholder="은행 검색..." />
          <CommandList>
            <CommandEmpty>은행을 찾을 수 없습니다</CommandEmpty>
            {CATEGORIES.map(({ key, label }) => (
              <CommandGroup key={key} heading={label}>
                {BANKS.filter((b) => b.category === key).map((bank) => (
                  <CommandItem
                    key={bank.code}
                    value={bank.name}
                    onSelect={handleSelect}
                    data-checked={value === bank.name || undefined}
                  >
                    <BankLogo src={bank.logo} name={bank.name} />
                    {bank.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
