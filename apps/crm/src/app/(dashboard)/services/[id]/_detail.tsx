import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb, sql } from "@kingsrealty/db";
import { DeleteButton } from "@/components/delete-button";
import { DocumentList } from "@/components/document-list";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  DetailView,
  DefinitionGrid,
  DefGroup,
  Def,
  type Fact,
} from "@/components/detail";
import { formatDate, formatKRW } from "@/lib/utils";
import { ServiceForm } from "../_components/service-form";
import { ServiceStatus } from "../_components/service-status";
import { deleteServiceRequest } from "../_actions";

const statusMap: Record<string, string> = {
  received: "접수",
  pending_repair: "수리대기중",
  in_progress: "수리중",
  completed: "수리완료",
  postponed: "수리연기",
  self_handled: "개인처리결정",
  escalated: "에스컬레이션",
  cancelled: "취소",
};

const bearerMap: Record<string, string> = {
  landlord: "임대인",
  tenant: "임차인",
  office: "중개",
};

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  const db = getDb();

  const serviceCategoriesPromise = db
    .selectFrom("service_category")
    .select(["value", "label"])
    .orderBy("sort_order", "asc")
    .execute();

  const sr = await db
    .selectFrom("service_request")
    .innerJoin("lease", "lease.id", "service_request.lease_id")
    .innerJoin("tenant", "tenant.id", "lease.tenant_id")
    .innerJoin("property", "property.id", "lease.property_id")
    .innerJoin("user", "user.id", "service_request.logged_by")
    .leftJoin(
      "service_vendor",
      "service_vendor.id",
      "service_request.vendor_id",
    )
    .select([
      "service_request.id",
      "service_request.lease_id",
      "service_request.title",
      "service_request.description",
      "service_request.category",
      "service_request.status",
      "service_request.cost_krw",
      "service_request.location",
      "service_request.bearer",
      "service_request.assignee",
      "service_request.landlord_self",
      "service_vendor.name as vendor_name",
      "service_vendor.phone as vendor_phone",
      "service_request.scheduled_date",
      "service_request.completed_date",
      "service_request.estimated_cost",
      "service_request.actual_cost",
      "service_request.postpone_reason",
      "service_request.escalated_to_landlord",
      "service_request.resolved_at",
      "service_request.logged_by",
      "service_request.notes",
      "service_request.created_at",
      "tenant.name as tenant_name",
      "tenant.id as tenant_id",
      sql<string>`coalesce(property.address_jibeon, property.address)`.as(
        "address",
      ),
      "property.id as property_id",
      "user.name as logged_by_name",
    ])
    .where("service_request.id", "=", numId)
    .executeTakeFirst();

  if (!sr) notFound();

  const [serviceCategories, statusLogs, documents, assignees, users, vendors] =
    await Promise.all([
      serviceCategoriesPromise,
      db
        .selectFrom("service_request_status_log")
        .innerJoin("user", "user.id", "service_request_status_log.changed_by")
        .select([
          "service_request_status_log.id",
          "service_request_status_log.status",
          "service_request_status_log.note",
          "service_request_status_log.created_at",
          "user.name as changed_by_name",
        ])
        .where("service_request_status_log.service_request_id", "=", numId)
        .orderBy("service_request_status_log.created_at", "desc")
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
        .where("entity_type", "=", "service_request")
        .where("entity_id", "=", numId)
        .orderBy("created_at", "desc")
        .execute(),
      db
        .selectFrom("service_request_assignee")
        .innerJoin("user", "user.id", "service_request_assignee.user_id")
        .select(["user.id as user_id", "user.name"])
        .where("service_request_assignee.service_request_id", "=", numId)
        .execute(),
      db
        .selectFrom("user")
        .select(["id", "name"])
        .orderBy("name", "asc")
        .execute(),
      db
        .selectFrom("service_vendor")
        .select(["id", "name", "phone"])
        .orderBy("name", "asc")
        .execute(),
    ]);

  const assigneeIds = assignees.map((a) => a.user_id);
  const assigneeNames = assignees.map((a) => a.name).join(", ");

  const logIds = statusLogs.map((l) => l.id);
  const logImages =
    logIds.length > 0
      ? await db
          .selectFrom("document")
          .select(["id", "file_name", "file_url", "entity_id"])
          .where("entity_type", "=", "service_request_status_log")
          .where("entity_id", "in", logIds)
          .execute()
      : [];

  const logImageMap = new Map<number, typeof logImages>();
  for (const img of logImages) {
    const arr = logImageMap.get(img.entity_id) ?? [];
    arr.push(img);
    logImageMap.set(img.entity_id, arr);
  }

  const categoryMap: Record<string, string> = {};
  for (const cat of serviceCategories) {
    categoryMap[cat.value] = cat.label;
  }

  const deleteAction = deleteServiceRequest.bind(null, numId);

  const facts: Fact[] = [
    {
      label: "카테고리",
      value: categoryMap[sr.category] ?? sr.category,
      mono: false,
    },
    {
      label: "비용",
      value: sr.cost_krw ? formatKRW(Number(sr.cost_krw)) : "-",
    },
    { label: "등록일", value: formatDate(sr.created_at) },
    {
      label: "완료일",
      value: sr.resolved_at ? formatDate(sr.resolved_at) : "-",
      tone: sr.resolved_at ? "success" : "muted",
    },
  ];

  const readView = (
    <div className="space-y-4">
      <DefinitionGrid>
        <DefGroup label="요청 정보">
          <Def label="세입자">
            <Link
              href={`/tenants/${sr.tenant_id}`}
              className="text-brand hover:underline"
            >
              {sr.tenant_name}
            </Link>
          </Def>
          <Def label="주소">
            <Link
              href={`/properties/${sr.property_id}`}
              className="text-brand hover:underline"
            >
              {sr.address}
            </Link>
          </Def>
          <Def label="카테고리">{categoryMap[sr.category] ?? sr.category}</Def>
          <Def label="위치">{sr.location || "-"}</Def>
          <Def label="비용 부담">
            {sr.bearer ? (bearerMap[sr.bearer] ?? sr.bearer) : "-"}
          </Def>
          <Def label="담당자">{assigneeNames || "-"}</Def>
          <Def label="외부 업체">
            {sr.vendor_name
              ? sr.vendor_phone
                ? `${sr.vendor_name} · ${sr.vendor_phone}`
                : sr.vendor_name
              : "-"}
          </Def>
          <Def label="임대인 직접 처리">
            {sr.landlord_self ? (
              <span className="text-success">예</span>
            ) : (
              "아니오"
            )}
          </Def>
          {sr.assignee && (
            <Def label="기존 기록">
              <span className="text-muted-foreground">{sr.assignee}</span>
            </Def>
          )}
          <Def label="예약일" mono>
            {formatDate(sr.scheduled_date)}
          </Def>
          <Def label="완료일" mono>
            {formatDate(sr.completed_date ?? sr.resolved_at)}
          </Def>
          <Def label="예상 비용" mono>
            {sr.estimated_cost ? formatKRW(Number(sr.estimated_cost)) : "-"}
          </Def>
          <Def label="실제 비용" mono>
            {sr.actual_cost
              ? formatKRW(Number(sr.actual_cost))
              : sr.cost_krw
                ? formatKRW(Number(sr.cost_krw))
                : "-"}
          </Def>
          {sr.postpone_reason && (
            <Def label="연기/처리 사유" full>
              <span className="whitespace-pre-wrap">{sr.postpone_reason}</span>
            </Def>
          )}
          <Def label="등록자">{sr.logged_by_name}</Def>
          <Def label="등록일" mono>
            {formatDate(sr.created_at)}
          </Def>
        </DefGroup>
        <DefGroup label="내용">
          <Def label="요청 내용" full>
            <span className="whitespace-pre-wrap">{sr.description}</span>
          </Def>
          {sr.notes && (
            <Def label="비고" full>
              <span className="whitespace-pre-wrap">{sr.notes}</span>
            </Def>
          )}
        </DefGroup>
      </DefinitionGrid>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <DeleteButton
          action={deleteAction}
          title="AS 요청을 삭제하시겠습니까?"
          description="AS 요청을 삭제하면 되돌릴 수 없습니다."
        />
      </div>
    </div>
  );

  const editView = (
    <ServiceForm
      variant="plain"
      defaultValues={{
        lease_id: sr.lease_id,
        title: sr.title,
        description: sr.description,
        category: sr.category,
        status: sr.status,
        cost_krw: sr.cost_krw,
        location: sr.location,
        bearer: sr.bearer,
        assignee_user_ids: assigneeIds,
        vendor_name: sr.vendor_name,
        vendor_phone: sr.vendor_phone,
        landlord_self: sr.landlord_self,
        scheduled_date: sr.scheduled_date
          ? new Date(sr.scheduled_date).toISOString().split("T")[0]
          : null,
        estimated_cost: sr.estimated_cost,
        actual_cost: sr.actual_cost,
        postpone_reason: sr.postpone_reason,
        escalated_to_landlord: sr.escalated_to_landlord,
        notes: sr.notes,
      }}
      serviceId={numId}
      categories={serviceCategories}
      users={users}
      vendors={vendors}
    />
  );

  return (
    <DetailView
      back={{ href: "/services", label: "AS 요청" }}
      title={sr.title}
      badges={
        <>
          <StatusBadge
            status={sr.status}
            label={statusMap[sr.status] ?? sr.status}
          />
          {sr.escalated_to_landlord && (
            <Badge
              variant="outline"
              className="border-warning/30 bg-warning-weak text-warning"
            >
              임대인 전달
            </Badge>
          )}
        </>
      }
      facts={facts}
      info={{ read: readView, edit: editView }}
      tabs={[
        {
          label: "진행 상태",
          content: (
            <ServiceStatus
              serviceRequestId={numId}
              currentStatus={sr.status}
              logs={statusLogs.map((l) => ({
                ...l,
                created_at:
                  l.created_at instanceof Date
                    ? l.created_at.toISOString()
                    : String(l.created_at),
                images: (logImageMap.get(l.id) ?? []).map((img) => ({
                  id: img.id,
                  file_url: img.file_url,
                  file_name: img.file_name,
                })),
              }))}
            />
          ),
        },
        {
          label: "문서",
          count: documents.length,
          content: (
            <DocumentList
              entityType="service_request"
              entityId={numId}
              documents={documents.map((d) => ({
                ...d,
                title: d.title ?? null,
                comments: d.comments ?? null,
                created_at:
                  d.created_at instanceof Date
                    ? d.created_at.toISOString()
                    : String(d.created_at),
              }))}
            />
          ),
        },
      ]}
    />
  );
}
