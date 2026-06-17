"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { AddressSearch } from "@/components/address-search";
import { createProperty, updateProperty } from "../_actions";

interface PropertyFormProps {
  propertyId?: number;
  landlords: { id: number; name: string }[];
  variant?: "card" | "plain";
  defaultValues?: {
    address: string;
    address_jibeon: string | null;
    address_detail: string | null;
    address_en: string | null;
    property_type: string;
    rooms: number | null;
    bathrooms: number | null;
    size_pyeong: number | null;
    monthly_rent_krw: number;
    deposit_krw: number;
    status: string;
    permission_status: string;
    landlord_id: number;
    notes: string | null;
    management_phone: string | null;
    moveout_date: string | null;
  };
}

export function PropertyForm({
  propertyId,
  landlords,
  defaultValues,
}: PropertyFormProps) {
  const action = propertyId
    ? updateProperty.bind(null, propertyId)
    : createProperty;

  return (
    <form action={action}>
      <FieldGroup>
        {/* Row 1-2: 주소 검색 (Postcodify) */}
        <AddressSearch
          defaultValues={
            defaultValues
              ? {
                  address: defaultValues.address,
                  address_jibeon: defaultValues.address_jibeon ?? null,
                  address_detail: defaultValues.address_detail,
                  address_en: defaultValues.address_en ?? null,
                }
              : undefined
          }
        />

        {/* Row 3: 유형, 면적, 방, 화장실 */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Field>
            <Label htmlFor="property_type">유형</Label>
            <select
              id="property_type"
              name="property_type"
              required
              defaultValue={defaultValues?.property_type ?? "apartment"}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="apartment">아파트</option>
              <option value="villa">빌라</option>
              <option value="officetel">오피스텔</option>
              <option value="house">주택</option>
            </select>
          </Field>

          <Field>
            <Label htmlFor="size_pyeong">면적 (평)</Label>
            <Input
              id="size_pyeong"
              name="size_pyeong"
              type="number"
              step="0.1"
              min="0"
              defaultValue={defaultValues?.size_pyeong ?? ""}
              placeholder="예: 32"
            />
          </Field>

          <Field>
            <Label htmlFor="rooms">방</Label>
            <Input
              id="rooms"
              name="rooms"
              type="number"
              min="0"
              defaultValue={defaultValues?.rooms ?? ""}
              placeholder="방 수"
            />
          </Field>

          <Field>
            <Label htmlFor="bathrooms">화장실</Label>
            <Input
              id="bathrooms"
              name="bathrooms"
              type="number"
              min="0"
              defaultValue={defaultValues?.bathrooms ?? ""}
              placeholder="화장실 수"
            />
          </Field>
        </div>

        {/* Row 4: 월세, 보증금 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="monthly_rent_krw">월세 (원)</Label>
            <Input
              id="monthly_rent_krw"
              name="monthly_rent_krw"
              type="number"
              required
              min="0"
              defaultValue={defaultValues?.monthly_rent_krw ?? ""}
              placeholder="월세 금액"
            />
          </Field>

          <Field>
            <Label htmlFor="deposit_krw">보증금 (원)</Label>
            <Input
              id="deposit_krw"
              name="deposit_krw"
              type="number"
              required
              min="0"
              defaultValue={defaultValues?.deposit_krw ?? ""}
              placeholder="보증금 금액"
            />
          </Field>
        </div>

        {/* Row 5: 임대인, 상태, 허가상태 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field>
            <Label htmlFor="landlord_id">임대인</Label>
            <select
              id="landlord_id"
              name="landlord_id"
              required
              defaultValue={defaultValues?.landlord_id ?? ""}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="" disabled>
                임대인 선택...
              </option>
              {landlords.map((landlord) => (
                <option key={landlord.id} value={landlord.id}>
                  {landlord.name}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <Label htmlFor="status">상태</Label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "vacant"}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="vacant">공실</option>
              <option value="pending">입주대기중</option>
              <option value="occupied">입주중</option>
              <option value="move_out">퇴거</option>
              <option value="maintenance">수리중</option>
              <option value="terminated">계약해지</option>
            </select>
          </Field>

          <Field>
            <Label htmlFor="permission_status">허가상태</Label>
            <select
              id="permission_status"
              name="permission_status"
              defaultValue={defaultValues?.permission_status ?? "pending"}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="pending">대기</option>
              <option value="approved">승인</option>
              <option value="rejected">반려</option>
            </select>
          </Field>

          <Field>
            <Label htmlFor="moveout_date">퇴거일</Label>
            <Input
              id="moveout_date"
              name="moveout_date"
              type="date"
              defaultValue={defaultValues?.moveout_date ?? ""}
            />
          </Field>
        </div>

        {/* Row 6: 관리실 연락처 */}
        <Field>
          <Label htmlFor="management_phone">관리실 연락처</Label>
          <Input
            id="management_phone"
            name="management_phone"
            defaultValue={defaultValues?.management_phone ?? ""}
            placeholder="관리사무소 전화번호"
          />
        </Field>

        {/* Row 7: 비고 */}
        <Field>
          <Label htmlFor="notes">비고</Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={defaultValues?.notes ?? ""}
            placeholder="참고 사항을 입력하세요"
            rows={4}
          />
        </Field>

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </FieldGroup>
    </form>
  );
}
