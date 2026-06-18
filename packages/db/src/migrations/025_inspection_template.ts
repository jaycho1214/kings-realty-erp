import { sql, type Kysely } from "kysely";

/**
 * 입주/퇴거 점검(inspection) 마스터 템플릿. 섹션(방/화장실/…) → 항목(체크 라인)을
 * 편집 가능한 카탈로그로 만든다(설정에서 관리). 점검 생성 시 이 템플릿을
 * inspection.checklist JSON 으로 "스냅샷" 복사하므로, 템플릿 수정은 과거 점검에
 * 영향을 주지 않는다. repeatable 섹션(방/화장실)은 매물의 rooms/bathrooms 로 N개
 * 인스턴스를 만든다. inspection.status(draft|finalized) 추가: 속성 상태 전환은
 * 완료(finalize) 시점에 일어난다.
 */

interface SeedItem {
  subgroup_ko: string | null;
  subgroup_en: string | null;
  label_ko: string;
  label_en: string | null;
}
interface SeedSection {
  key: string;
  label_ko: string;
  label_en: string | null;
  repeatable: boolean;
  items: SeedItem[];
}

const WALL = { ko: "벽/천장", en: "WALL/CEILING" };
const ELEC = { ko: "전기/에어컨", en: "ELECTRICAL/A·C" };
const WIN = { ko: "창문/블라인드", en: "WINDOW/BLIND" };
const STOR = { ko: "수납/바닥", en: "STORAGE/FLOOR" };
const sg = (
  g: { ko: string; en: string },
  ko: string,
  en: string,
): SeedItem => ({
  subgroup_ko: g.ko,
  subgroup_en: g.en,
  label_ko: ko,
  label_en: en,
});
const plain = (ko: string, en: string | null): SeedItem => ({
  subgroup_ko: null,
  subgroup_en: null,
  label_ko: ko,
  label_en: en,
});

const SECTIONS: SeedSection[] = [
  {
    key: "master_bedroom",
    label_ko: "안방",
    label_en: "MASTER BEDROOM",
    repeatable: false,
    items: [
      sg(WALL, "4면의 모든 벽지", "WALL PAPER"),
      sg(WALL, "벽면 낙서 여부 확인", "WALL GRAFFITI"),
      sg(WALL, "천장 얼룩 여부 확인", "CEILING STAIN"),
      sg(WALL, "천장 도배 상태 체크", "CEILING WALLPAPER"),
      sg(WALL, "거미줄 여부 확인", "SPIDER WEBS"),
      sg(ELEC, "스위치 작동", "SWITCH OPERATION"),
      sg(ELEC, "전등 작동 확인", "LIGHT OPERATION"),
      sg(ELEC, "전등 주변 거미줄 여부 확인", "LIGHT SPIDER WEB"),
      sg(ELEC, "콘센트 상태 확인", "OUTLET"),
      sg(ELEC, "에어컨 작동 여부 확인", "A/C OPERATION"),
      sg(ELEC, "에어컨 리모컨 확인 및 작동 여부", "A/C REMOTE"),
      sg(ELEC, "보일러 리모컨 확인 및 작동 여부", "BOILER CONTROL"),
      sg(WIN, "창문 잘 열리는지 확인", "WINDOW CHECK"),
      sg(WIN, "창문틀 상태 확인", "WINDOW FRAME"),
      sg(WIN, "창문 청소 상태 확인", "WINDOW CLEANING"),
      sg(WIN, "방충망 상태 확인", "WINDOW SCREEN"),
      sg(WIN, "블라인드 청소 여부 확인", "BLIND CLEANING"),
      sg(WIN, "블라인드 데미지 여부 확인", "BLIND DAMAGE"),
      sg(STOR, "빌트인 옷장 문 작동 확인", "BUILT-IN CLOSET DOOR"),
      sg(STOR, "옷장 경첩 상태 확인", "CLOSET HINGE"),
      sg(STOR, "서랍장 작동 확인", "DRAWER CHECK"),
      sg(STOR, "워킹클로젯 데미지 여부 확인", "WALKING CLOSET CHECK"),
      sg(STOR, "워킹클로젯 청소 상태 확인", "WALKING CLOSET CLEANING"),
      sg(STOR, "바닥 타일 상태 체크", "FLOOR/TILE"),
      sg(STOR, "바닥 찍힘 및 손상 여부 확인", "FLOOR DAMAGE"),
      sg(STOR, "바닥 오염 여부 확인", "FLOOR STAINS"),
    ],
  },
  {
    key: "bedroom",
    label_ko: "방",
    label_en: "BEDROOM",
    repeatable: true,
    items: [
      sg(WALL, "4면 벽지 상태 확인", "WALL PAPER CONDITION"),
      sg(WALL, "벽면 낙서 여부 확인", "WALL GRAFFITI"),
      sg(WALL, "천장 얼룩 여부 확인", "CEILING STAIN"),
      sg(WALL, "천장 도배 상태 체크", "CEILING WALLPAPER"),
      sg(WALL, "거미줄 여부 확인", "SPIDER WEBS"),
      sg(ELEC, "스위치 작동 확인", "SWITCH"),
      sg(ELEC, "전등 작동 확인", "LIGHT OPERATION"),
      sg(ELEC, "콘센트 상태 확인", "OUTLET"),
      sg(ELEC, "에어컨 작동 여부 확인", "A/C OPERATION"),
      sg(WIN, "창문 잘 열리는지 확인", "WINDOW CHECK"),
      sg(WIN, "창문틀 상태 확인", "WINDOW FRAME"),
      sg(WIN, "방충망 상태 확인", "SCREEN CONDITION"),
      sg(WIN, "블라인드 작동 상태 확인", "BLIND OPERATION"),
      sg(STOR, "옷장 문 작동 확인", "BUILT-IN CLOSET DOOR"),
      sg(STOR, "경첩 상태 확인", "CLOSET HINGE"),
      sg(STOR, "서랍장 작동 확인", "DRAWER CHECK"),
      sg(STOR, "바닥 상태 확인", "FLOOR CHECK"),
    ],
  },
  {
    key: "bathroom",
    label_ko: "화장실",
    label_en: "BATHROOM",
    repeatable: true,
    items: [
      plain("샤워기 작동 확인", "SHOWER OPERATION"),
      plain("샤워기 부식 상태 확인", "SHOWER CORROSION CHECK"),
      plain("변기 작동 확인", "TOILET OPERATION"),
      plain("변기 뚜껑 상태 확인", "TOILET SEAT"),
      plain("세면대 금 여부 확인", "SINK CRACK"),
      plain("변기 금 여부 확인", "TOILET CRACK"),
      plain("세면대 배수 확인", "SINK DRAINAGE"),
      plain("욕조 청소 상태 확인", "BATH CLEANING"),
      plain("욕조 배수 확인", "BATH DRAINAGE"),
      plain("샤워부스 청소 상태 확인", "SHOWER STALL CLEANING"),
      plain("타일 금 여부 확인", "TILE CRACK"),
      plain("수건장 데미지 여부 확인", "TOWEL CABINET"),
      plain("배수 상태 확인", "DRAINAGE CHECK"),
      plain("천장 팬 작동 여부 확인", "CEILING FAN"),
      plain("바닥 상태 확인", "FLOOR CHECK"),
      plain("청소 상태 확인", "CLEANING"),
      plain("천장 상태 확인", "CEILING CHECK"),
    ],
  },
  {
    key: "laundry",
    label_ko: "세탁실",
    label_en: "LAUNDRY ROOM",
    repeatable: false,
    items: [
      plain("세탁기 청소 상태 확인", "WASHER CLEANING"),
      plain("건조기 청소 상태 확인", "DRYER CLEANING"),
      plain("보일러 작동 여부 확인", "BOILER OPERATION"),
      plain("보일러 누수 여부 확인", "BOILER LEAKS"),
      plain("보일러 회사명 기록", "BRAND NAME"),
      plain("보일러 모델명 기록", "MODEL NAME"),
    ],
  },
  {
    key: "entryway",
    label_ko: "현관",
    label_en: "ENTRYWAY",
    repeatable: false,
    items: [
      plain("현관문 앞뒤 데미지 여부", "DOOR CHECK"),
      plain("도어락 작동 여부", "DOOR LOCK CHECK"),
      plain("신발장 데미지 여부", "SHOE CABINET"),
    ],
  },
  {
    key: "storage",
    label_ko: "창고",
    label_en: "STORAGE",
    repeatable: false,
    items: [plain("데미지 여부 확인", "DAMAGE")],
  },
  {
    key: "parking",
    label_ko: "주차장",
    label_en: "PARKING AREA",
    repeatable: false,
    items: [
      plain("데미지 여부 확인", "DAMAGE"),
      plain("비밀번호 확인", "PIN NUMBER"),
      plain("오일 누유 여부 확인", "OIL LEAKS CHECK"),
    ],
  },
  {
    key: "keys",
    label_ko: "키 및 리모컨",
    label_en: "KEYS & REMOTES",
    repeatable: false,
    items: [
      plain("현관 키 개수 확인", "ENTRY DOOR KEY CHECK"),
      plain("카드키 개수 확인", "CARD KEY CHECK"),
      plain("주차 리모컨 확인", "PARKING REMOTE KEY CHECK"),
      plain("각 방 에어컨 리모컨 확인", "A/C REMOTE CHECK"),
      plain("안내 책자 확인", "WELCOME GUIDE BOOK CHECK"),
    ],
  },
  {
    key: "appliances",
    label_ko: "가전 및 가구",
    label_en: "APPLIANCES & FURNITURE",
    repeatable: false,
    items: [
      plain("세탁기", "WASHER"),
      plain("건조기", "DRYER"),
      plain("냉장고", "REFRIGERATOR"),
      plain("전자레인지", "MICROWAVE"),
      plain("오븐", "OVEN"),
      plain("정수기", "WATER-PURIFIER"),
      plain("식탁 및 의자", "TABLE/CHAIR"),
      plain("쇼파", "SOFA"),
      plain("TV", "TV"),
      plain("TV 스탠드", "TV STAND"),
      plain("책상 및 의자", "DESK"),
      plain("침대 및 협탁", "BED"),
      plain("스탠드 라이트", "STAND LIGHT"),
      plain("간이 테이블", "SMALL TABLE"),
      plain("옷장", "CLOSET"),
      plain("서랍장", "DRAWER"),
      plain("전신거울", "FULL-LENGTH MIRROR"),
      plain("그릇 종류 확인", "BOWLS"),
    ],
  },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("inspection_section")
    .addColumn("id", "serial", (c) => c.primaryKey())
    .addColumn("key", "varchar", (c) => c.notNull())
    .addColumn("label_ko", "varchar", (c) => c.notNull())
    .addColumn("label_en", "varchar")
    .addColumn("repeatable", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("is_builtin", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("inspection_item")
    .addColumn("id", "serial", (c) => c.primaryKey())
    .addColumn("section_id", "integer", (c) =>
      c.notNull().references("inspection_section.id").onDelete("cascade"),
    )
    .addColumn("subgroup_ko", "varchar")
    .addColumn("subgroup_en", "varchar")
    .addColumn("label_ko", "varchar", (c) => c.notNull())
    .addColumn("label_en", "varchar")
    .addColumn("sort_order", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_inspection_item_section")
    .on("inspection_item")
    .column("section_id")
    .execute();

  await db.schema
    .alterTable("inspection")
    .addColumn("status", "varchar", (c) => c.notNull().defaultTo("finalized"))
    .execute();

  // Seed the Humphreys template (idempotent: skip if a builtin section exists).
  const existing = await sql<{
    n: number;
  }>`select count(*)::int as n from inspection_section where is_builtin = true`.execute(
    db,
  );
  if (Number(existing.rows[0]?.n ?? 0) > 0) return;

  for (let s = 0; s < SECTIONS.length; s++) {
    const sec = SECTIONS[s];
    const row = await sql<{ id: number }>`
      insert into inspection_section
        (key, label_ko, label_en, repeatable, sort_order, is_builtin)
      values
        (${sec.key}, ${sec.label_ko}, ${sec.label_en}, ${sec.repeatable}, ${s}, true)
      returning id
    `.execute(db);
    const sectionId = row.rows[0].id;
    for (let i = 0; i < sec.items.length; i++) {
      const it = sec.items[i];
      await sql`
        insert into inspection_item
          (section_id, subgroup_ko, subgroup_en, label_ko, label_en, sort_order)
        values
          (${sectionId}, ${it.subgroup_ko}, ${it.subgroup_en}, ${it.label_ko}, ${it.label_en}, ${i})
      `.execute(db);
    }
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("inspection").dropColumn("status").execute();
  await db.schema.dropTable("inspection_item").ifExists().execute();
  await db.schema.dropTable("inspection_section").ifExists().execute();
}
