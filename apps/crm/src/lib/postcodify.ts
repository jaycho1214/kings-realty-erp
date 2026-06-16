"use server";

import { requireUser } from "@/lib/authz";

export interface PostcodifyResult {
  postcode5: string;
  ko_common: string;
  ko_doro: string;
  ko_jibeon: string;
  en_common: string;
  en_doro: string;
  en_jibeon: string;
  building_name: string;
  building_nums: string;
  other_addresses: string;
}

interface PostcodifyResponse {
  error: string;
  count: number;
  time: string;
  results: PostcodifyResult[];
}

const API_URL = "https://api.poesis.kr/post/search.php";

export async function searchAddress(
  query: string,
): Promise<{ results: PostcodifyResult[]; error?: string }> {
  await requireUser();

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { results: [], error: "2글자 이상 입력해주세요" };
  }

  const url = new URL(API_URL);
  url.searchParams.set("v", "3.5.0");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("ref", "kingsrealty.vercel.app");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    return { results: [], error: "주소 검색 서비스에 연결할 수 없습니다" };
  }

  const data: PostcodifyResponse = await res.json();

  if (data.error) {
    return { results: [], error: data.error };
  }

  return { results: data.results };
}
