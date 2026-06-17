import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, sql } from "@kingsrealty/db";
import { DeleteButton } from "@/components/delete-button";
import { CreateDialog } from "@/components/create-dialog";
import { DocumentList } from "@/components/document-list";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup } from "@/components/ui/field";
import { SubmitButton } from "@/components/submit-button";
import { StatusBadge } from "@/components/status-badge";
import { DataPanel } from "@/components/data-panel";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DetailView,
  DefinitionGrid,
  DefGroup,
  Def,
  type Fact,
} from "@/components/detail";
import { formatDate } from "@/lib/utils";
import { ApplianceForm } from "../_components/appliance-form";
import { deleteAppliance, createApplianceServiceRequest } from "../_actions";

const OWNER_LABEL: Record<string, string> = {
  landlord: "집주인",
  office: "킹스",
  tenant: "세입자",
};

const STATUS_LABEL: Record<string, string> = {
  normal: "정상",
  repair: "수리필요",
  broken: "사용불가",
};

const SR_STATUS_LABEL: Record<string, string> = {
  received: "접수",
  waiting: "수리대기중",
  in_progress: "수리중",
  completed: "수리완료",
  postponed: "수리연기",
  personal_handling: "개인처리",
};

const SR_OPEN = new Set(["received", "waiting", "in_progress"]);

export default async function ApplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
}) {
  const { id, tab } = await params;
  const activeTab = tab?.[0] ?? "";
  const numId = Number(id);
  const db = getDb();

  const [appliance, properties, photos, services, categories] =
    await Promise.all([
      db
        .selectFrom("appliance")
        .innerJoin("property", "property.id", "appliance.property_id")
        .innerJoin("landlord", "landlord.id", "property.landlord_id")
        .select([
          "appliance.id",
          "appliance.property_id",
          "appliance.name",
          "appliance.owner",
          "appliance.brand",
          "appliance.model_number",
          "appliance.as_contact",
          "appliance.status",
          "appliance.notes",
          sql<string>`coalesce(property.address_jibeon, property.address)`.as(
            "property_address",
          ),
          "landlord.name as landlord_name",
        ])
        .where("appliance.id", "=", numId)
        .executeTakeFirst(),
      db
        .selectFrom("property")
        .select([
          "id",
          sql<string>`coalesce(address_jibeon, address)`.as("address"),
        ])
        .orderBy("created_at", "desc")
        .execute(),
      db
        .selectFrom("document")
        .select([
          "id",
          "file_name",
          "file_url",
          "file_type",
          "title",
          "comments",
          "created_at",
        ])
        .where("entity_type", "=", "appliance")
        .where("entity_id", "=", numId)
        .orderBy("created_at", "desc")
        .execute(),
      db
        .selectFrom("service_request")
        .innerJoin("lease", "lease.id", "service_request.lease_id")
        .innerJoin("tenant", "tenant.id", "lease.tenant_id")
        .select([
          "service_request.id",
          "service_request.title",
          "service_request.status",
          "service_request.created_at",
          "tenant.name as tenant_name",
        ])
        .where("service_request.appliance_id", "=", numId)
        .orderBy("service_request.created_at", "desc")
        .execute(),
      db
        .selectFrom("service_category")
        .select(["value", "label"])
        .orderBy("sort_order", "asc")
        .execute(),
    ]);

  if (!appliance) notFound();

  const activeLease = await db
    .selectFrom("lease")
    .select("id")
    .where("property_id", "=", appliance.property_id)
    .where("status", "=", "active")
    .executeTakeFirst();
  const hasActiveLease = !!activeLease;

  const openCount = services.filter((s) => SR_OPEN.has(s.status)).length;
  const deleteWithId = deleteAppliance.bind(null, numId);

  const facts: Fact[] = [
    { label: "소유", value: OWNER_LABEL[appliance.owner] ?? appliance.owner },
    {
      label: "상태",
      value: STATUS_LABEL[appliance.status] ?? appliance.status,
      tone: appliance.status === "normal" ? "success" : "danger",
    },
    { label: "사진", value: `${photos.length}장` },
    {
      label: "A/S",
      value: `${services.length}건`,
      tone: openCount ? "danger" : "default",
    },
  ];

  const readView = (
    <div className="space-y-4">
      <DefinitionGrid>
        <DefGroup label="비품 정보">
          <Def label="비품명">{appliance.name}</Def>
          <Def label="매물">
            <Link
              href={`/properties/${appliance.property_id}`}
              className="text-brand hover:underline"
            >
              {appliance.property_address}
            </Link>
          </Def>
          <Def label="임대인">{appliance.landlord_name}</Def>
          <Def label="소유">
            {OWNER_LABEL[appliance.owner] ?? appliance.owner}
          </Def>
          <Def label="상태">
            <StatusBadge
              status={appliance.status}
              label={STATUS_LABEL[appliance.status] ?? appliance.status}
            />
          </Def>
        </DefGroup>
        <DefGroup label="상세">
          <Def label="브랜드">{appliance.brand || "-"}</Def>
          <Def label="모델번호" mono>
            {appliance.model_number || "-"}
          </Def>
          <Def label="A/S 연락처" mono>
            {appliance.as_contact || "-"}
          </Def>
          {appliance.notes && (
            <Def label="메모" full>
              <span className="whitespace-pre-wrap">{appliance.notes}</span>
            </Def>
          )}
        </DefGroup>
      </DefinitionGrid>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <DeleteButton action={deleteWithId} />
      </div>
    </div>
  );

  const editView = (
    <ApplianceForm
      variant="plain"
      applianceId={numId}
      properties={properties}
      defaultValues={{
        property_id: appliance.property_id,
        name: appliance.name,
        owner: appliance.owner,
        status: appliance.status,
        brand: appliance.brand,
        model_number: appliance.model_number,
        as_contact: appliance.as_contact,
        notes: appliance.notes,
      }}
    />
  );

  const serviceForm = createApplianceServiceRequest.bind(
    null,
    numId,
    appliance.property_id,
  );

  return (
    <DetailView
      back={{ href: "/appliances", label: "비품" }}
      basePath={`/appliances/${numId}`}
      activeTab={activeTab}
      title={appliance.name}
      badges={
        <>
          <StatusBadge
            status={appliance.status}
            label={STATUS_LABEL[appliance.status] ?? appliance.status}
          />
          <Badge variant="secondary">
            {OWNER_LABEL[appliance.owner] ?? appliance.owner}
          </Badge>
        </>
      }
      facts={facts}
      info={{ read: readView, edit: editView }}
      tabs={[
        {
          key: "photos",
          label: "사진",
          count: photos.length,
          content: (
            <DocumentList
              entityType="appliance"
              entityId={numId}
              documents={photos}
            />
          ),
        },
        {
          key: "service",
          label: "A/S",
          count: services.length,
          alert: openCount > 0,
          content: (
            <div className="space-y-3">
              <div className="flex justify-end">
                {hasActiveLease ? (
                  <CreateDialog title="수리 요청" buttonLabel="수리 요청">
                    <form action={serviceForm}>
                      <FieldGroup>
                        <Field>
                          <Label htmlFor="sr-title">제목</Label>
                          <Input
                            id="sr-title"
                            name="title"
                            required
                            placeholder={`${appliance.name} 수리`}
                          />
                        </Field>
                        <Field>
                          <Label htmlFor="sr-category">분류</Label>
                          <select
                            id="sr-category"
                            name="category"
                            defaultValue="appliance"
                            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                          >
                            {categories.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field>
                          <Label htmlFor="sr-description">내용</Label>
                          <Textarea
                            id="sr-description"
                            name="description"
                            rows={3}
                            placeholder="증상/요청 내용"
                          />
                        </Field>
                        <div className="flex justify-end">
                          <SubmitButton label="요청 등록" />
                        </div>
                      </FieldGroup>
                    </form>
                  </CreateDialog>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    활성 계약이 있는 매물만 수리 요청을 등록할 수 있습니다.
                  </p>
                )}
              </div>
              <DataPanel>
                {services.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    등록된 A/S 요청이 없습니다.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>제목</TableHead>
                        <TableHead>세입자</TableHead>
                        <TableHead>접수일</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.map((s) => (
                        <TableRow key={s.id} className="group">
                          <TableCell className="font-medium">
                            <Link
                              href={`/services/${s.id}`}
                              className="group-hover:underline"
                            >
                              {s.title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {s.tenant_name}
                          </TableCell>
                          <TableCell className="tabular text-muted-foreground">
                            {formatDate(s.created_at)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={s.status}
                              label={SR_STATUS_LABEL[s.status] ?? s.status}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </DataPanel>
            </div>
          ),
        },
      ]}
    />
  );
}
