import 'dotenv/config'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { DB } from './types'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const { Pool } = pg

// ─── Types ──────────────────────────────────────────────────────────────────

interface SalesPayment {
  date: string
  items: string
  amount: number
  bankAmount: number
}

interface SalesInfo {
  landlordRaw: string
  landlordPhone: string
  leaseStart: string
  leaseEnd: string
  familyPhone: string
  extraNotes: string
  payments: SalesPayment[]
}

interface ParsedLandlord {
  name: string
  birth: string | null
  sex: string | null
  notes: string | null
  phone: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizePhone(phone: string): string {
  if (!phone) return ''
  return phone.trim().replace(/\s+/g, '')
}

function normalizeRank(rank: string): string {
  if (!rank) return ''
  rank = rank.trim().toUpperCase()
  // Handle compound ranks: SFC/E7 → E7, SGT/E5 → E5, CW2/W2 → CW2, O4/maj → O4, E7 / C co. → E7
  if (rank.includes('/')) {
    const parts = rank.split('/').map(p => p.trim())
    // Prefer the first part if it starts with E, O, CW, WO, W, GS
    for (const p of parts) {
      if (/^(E\d|O\d|CW\d|WO\d|W\d|GS\d)/.test(p)) return p
    }
    return parts[0]
  }
  // Handle "E5 E5" (dual military)
  if (/^(E\d)\s+(E\d)$/.test(rank)) {
    return rank.split(/\s+/)[0]
  }
  // Handle Korean/non-standard
  if (rank === 'CONTRACTOR') return 'CONTRACTOR'
  if (rank === '오산군인') return ''
  return rank
}

function inferBranch(rank: string, notes: string): string {
  const notesUpper = (notes || '').toUpperCase()
  if (notesUpper.includes('NAVY')) return 'navy'
  if (notesUpper.includes('AIR FORCE') || notesUpper.includes('USAF')) return 'air_force'
  return 'army'
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null
  const s = String(dateStr).trim()
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Try YYYY-MM-DD HH:mm
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) return s.split(/\s+/)[0]
  return s
}

function parsePaymentDate(dateStr: string): string | null {
  if (!dateStr) return null
  const s = String(dateStr).trim()
  // "2026-03-13 10:40" → "2026-03-13"
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split(/\s+/)[0]
  return s
}

function parseLandlordInfo(raw: string, phone: string): ParsedLandlord {
  if (!raw || !raw.trim()) {
    return { name: '미확인', birth: null, sex: null, notes: null, phone: normalizePhone(phone) }
  }

  const original = raw.trim()
  let name = ''
  let birth: string | null = null
  let sex: string | null = null
  let notes: string | null = null

  // Pattern: 6 digits + optional dash + 1 digit (YYMMDD-N)
  const rrnPattern = /(\d{6})-?([12])/g
  const matches: Array<{ full: string; digits: string; sexDigit: string; index: number }> = []
  let m: RegExpExecArray | null
  while ((m = rrnPattern.exec(original)) !== null) {
    matches.push({ full: m[0], digits: m[1], sexDigit: m[2], index: m.index })
  }

  if (matches.length > 0) {
    // Use the first match for birth/sex
    const first = matches[0]
    const yy = parseInt(first.digits.substring(0, 2), 10)
    const mm = first.digits.substring(2, 4)
    const dd = first.digits.substring(4, 6)
    const year = yy <= 30 ? 2000 + yy : 1900 + yy
    birth = `${year}-${mm}-${dd}`
    sex = first.sexDigit === '1' ? 'M' : 'F'

    // Strip all RRN patterns from the string to get the name
    let remaining = original
    for (const match of matches) {
      remaining = remaining.replace(match.full, '')
    }
    // Also strip standalone 6-digit patterns (YYMMDD without dash)
    remaining = remaining.replace(/\d{6}/g, '')
    // Clean up
    remaining = remaining.replace(/[,\s]+/g, ' ').trim()
    remaining = remaining.replace(/^[-,\s]+|[-,\s]+$/g, '').trim()

    if (remaining) {
      // If multiple names remain, take the first Korean-looking name
      const nameparts = remaining.split(/\s+/)
      name = nameparts[0]
      if (nameparts.length > 1) {
        notes = `추가 정보: ${nameparts.slice(1).join(' ')}`
      }
    }
  } else {
    // No RRN pattern found - check for 6 digits only (without sex digit)
    const sixDigitMatch = original.match(/(\d{6})/)
    if (sixDigitMatch) {
      const digits = sixDigitMatch[1]
      const yy = parseInt(digits.substring(0, 2), 10)
      const mm = digits.substring(2, 4)
      const dd = digits.substring(4, 6)
      // Validate it looks like a date
      if (parseInt(mm) >= 1 && parseInt(mm) <= 12 && parseInt(dd) >= 1 && parseInt(dd) <= 31) {
        const year = yy <= 30 ? 2000 + yy : 1900 + yy
        birth = `${year}-${mm}-${dd}`
      }
      let remaining = original.replace(digits, '').replace(/[,\s]+/g, ' ').trim()
      remaining = remaining.replace(/^[-,\s]+|[-,\s]+$/g, '').trim()
      if (remaining) {
        name = remaining.split(/\s+/)[0]
      }
    } else {
      // Pure name, no digits at all
      name = original.replace(/[,\s]+/g, ' ').trim()
      // If multiple names (like "이이정 김정옥"), take first
      const parts = name.split(/\s+/)
      if (parts.length > 1) {
        // Check if they look like names (Korean characters)
        name = parts[0]
        notes = `추가: ${parts.slice(1).join(' ')}`
      }
    }
  }

  if (!name) {
    name = original
  }

  return {
    name: name.trim(),
    birth,
    sex,
    notes,
    phone: normalizePhone(phone),
  }
}

function parseAddressParts(fullAddress: string): { address: string; addressDetail: string | null } {
  if (!fullAddress) return { address: '', addressDetail: null }
  const addr = fullAddress.trim().replace(/\s+/g, ' ')

  // Try to split on patterns like "1층", "2층", "3층", "201호", "101호", "301호", etc.
  // Also apartment detail patterns like "101-1301", "A동1906", "B2128"
  // Look for floor/room patterns
  const detailPatterns = [
    // "1층" at end or with spaces
    /\s+(\d+층\s*)$/,
    // "201호" pattern
    /\s+(\d+호\s*)$/,
    // Room patterns like "Rm101"
    /\s+(Rm\d+\s*)$/i,
    // Apartment patterns: "동 호" like "216-1103", "7303-504"
  ]

  // For addresses with parenthetical detail like "(신촌동) 2층, 신촌동 112-4"
  const parenDetailMatch = addr.match(/^(.+?\))\s+(.+)$/)
  if (parenDetailMatch) {
    const mainPart = parenDetailMatch[1]
    const detailPart = parenDetailMatch[2]
    // The detail part often has format "2층, 신촌동 112-4" or "101호, 심곡동 343-2"
    return { address: mainPart.trim(), addressDetail: detailPart.trim() }
  }

  // For addresses with apartment complex names containing 동/호
  // e.g., "위례풍경채어바니티101-1301" - the apartment unit number
  const aptUnitMatch = addr.match(/^(.+?)\s+(\d+동\s+\d+호.*)$/)
  if (aptUnitMatch) {
    return { address: aptUnitMatch[1].trim(), addressDetail: aptUnitMatch[2].trim() }
  }

  // Simple floor pattern at end
  for (const pattern of detailPatterns) {
    const match = addr.match(pattern)
    if (match) {
      return {
        address: addr.substring(0, match.index!).trim(),
        addressDetail: match[1].trim(),
      }
    }
  }

  // Look for floor/room info: "2층", "3층", "201호", "102호", etc. anywhere near end
  const floorMatch = addr.match(/^(.+?)\s+(\d+층.*)$/)
  if (floorMatch) {
    return { address: floorMatch[1].trim(), addressDetail: floorMatch[2].trim() }
  }

  const hoMatch = addr.match(/^(.+?)\s+(\d+[-]?\d*호.*)$/)
  if (hoMatch) {
    return { address: hoMatch[1].trim(), addressDetail: hoMatch[2].trim() }
  }

  return { address: addr, addressDetail: null }
}

function detectPropertyType(address: string): string {
  if (address.includes('아파트') || address.includes('아프트')) return 'apartment'
  if (address.includes('빌라')) return 'villa'
  if (address.includes('오피스텔')) return 'officetel'
  if (address.includes('푸르지오') || address.includes('자이') || address.includes('호반써밋') ||
      address.includes('우미린') || address.includes('레빌') || address.includes('힐스테이트') ||
      address.includes('헤리티지') || address.includes('래미안') || address.includes('풍림') ||
      address.includes('더힐') || address.includes('센터레빌')) return 'apartment'
  return 'house'
}

function determinePaymentType(items: string): string {
  // If includes rent pattern like "2026년3월" or "2026년2월"
  if (/\d{4}년\d{1,2}월/.test(items)) return 'rent'
  if (items.includes('전기요금') || items.includes('수도요금') || items.includes('가스요금') ||
      items.includes('아파트공과금') || items.includes('인터넷') || items.includes('집주인관리공과금')) return 'utility'
  if (items.includes('훅업') || items.includes('과속') || items.includes('주차위반') ||
      items.includes('티켓')) return 'service'
  return 'utility'
}

function findMonthlyRent(salesInfo: SalesInfo | undefined): number {
  if (!salesInfo) return 0
  for (const p of salesInfo.payments) {
    if (/\d{4}년3월/.test(p.items)) {
      // This payment includes March rent - but may also include utilities
      // Try to find a payment that is ONLY rent
      const itemList = p.items.split(',').map(s => s.trim())
      const rentItems = itemList.filter(i => /\d{4}년\d{1,2}월/.test(i))
      if (rentItems.length > 0 && itemList.length === 1) {
        // Pure rent payment
        return p.amount
      }
    }
  }
  // Fallback: find any payment with rent
  for (const p of salesInfo.payments) {
    if (/\d{4}년3월/.test(p.items)) {
      return p.amount
    }
  }
  // Try February
  for (const p of salesInfo.payments) {
    if (/\d{4}년2월/.test(p.items)) {
      return p.amount
    }
  }
  return 0
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: url }),
    }),
  })

  try {
    // ─── Step 1: Get admin user ─────────────────────────────────────────
    console.log('Step 1: Getting admin user...')
    const admin = await db.selectFrom('user').select('id').where('role', '=', 'admin').executeTakeFirstOrThrow()
    const adminId = admin.id
    console.log(`  Admin ID: ${adminId}`)

    // ─── Step 2: Parse SALES.xlsx ───────────────────────────────────────
    console.log('\nStep 2: Parsing SALES.xlsx...')
    const salesPath = '/Users/jay/Codes/kingsrealty/apps/crm/examples/SALES.xlsx'
    const salesWb = XLSX.readFile(salesPath)
    const salesSheet = salesWb.Sheets[salesWb.SheetNames[0]]
    const salesRows: any[][] = XLSX.utils.sheet_to_json(salesSheet, { header: 1 })

    const salesMap = new Map<string, SalesInfo>()

    // Skip row 0 (title) and row 1 (headers), process row 2..113 (skip row 114 = summary)
    for (let i = 2; i < salesRows.length; i++) {
      const row = salesRows[i]
      if (!row || !row[0]) continue // Skip empty/summary rows

      const dateStr = String(row[0] || '').trim()
      if (!dateStr) continue // Skip summary row

      const tenantName = String(row[1] || '').trim()
      if (!tenantName) continue

      const items = String(row[3] || '').trim()
      const amount = Number(row[5]) || 0
      const bankAmount = Number(row[7]) || 0
      const landlordRaw = String(row[8] || '').trim()
      const landlordPhone = String(row[9] || '').trim()
      const leaseStart = String(row[10] || '').trim()
      const leaseEnd = String(row[11] || '').trim()
      const familyPhone = String(row[12] || '').trim()
      const extraNotes = String(row[13] || '').trim()

      const key = normalizeName(tenantName)
      const payment: SalesPayment = { date: dateStr, items, amount, bankAmount }

      if (salesMap.has(key)) {
        salesMap.get(key)!.payments.push(payment)
      } else {
        salesMap.set(key, {
          landlordRaw,
          landlordPhone,
          leaseStart,
          leaseEnd,
          familyPhone,
          extraNotes,
          payments: [payment],
        })
      }
    }
    console.log(`  Parsed ${salesMap.size} unique tenants from SALES.xlsx`)

    // ─── Step 3: Parse landlord info ────────────────────────────────────
    console.log('\nStep 3: Parsing landlord info from SALES data...')
    const landlordMap = new Map<string, ParsedLandlord>()

    for (const [, salesInfo] of salesMap) {
      if (!salesInfo.landlordRaw) continue
      const parsed = parseLandlordInfo(salesInfo.landlordRaw, salesInfo.landlordPhone)
      const key = normalizeName(parsed.name)
      if (!landlordMap.has(key)) {
        landlordMap.set(key, parsed)
      }
    }

    // Add placeholder landlord for tenants without SALES data
    if (!landlordMap.has(normalizeName('미확인'))) {
      landlordMap.set(normalizeName('미확인'), {
        name: '미확인',
        birth: null,
        sex: null,
        notes: 'Placeholder for tenants without sales data',
        phone: '',
      })
    }

    console.log(`  Found ${landlordMap.size} unique landlords`)

    // ─── Step 4: Create landlords ───────────────────────────────────────
    console.log('\nStep 4: Creating landlords...')
    const landlordIdMap = new Map<string, number>() // normalized name → id

    for (const [key, info] of landlordMap) {
      try {
        const result = await db.insertInto('landlord').values({
          name: info.name,
          phone: info.phone || '',
          birth: info.birth,
          sex: info.sex,
          notes: info.notes,
          created_by: Number(adminId),
        }).returning('id').executeTakeFirstOrThrow()
        landlordIdMap.set(key, result.id)
      } catch (err: any) {
        console.warn(`  Warning: Failed to insert landlord "${info.name}": ${err.message}`)
      }
    }
    console.log(`  Created ${landlordIdMap.size} landlords`)

    // ─── Step 5: Parse DATA.xlsx and create properties ──────────────────
    console.log('\nStep 5: Parsing DATA.xlsx and creating properties...')
    const dataPath = '/Users/jay/Codes/kingsrealty/apps/crm/examples/DATA.xlsx'
    const dataWb = XLSX.readFile(dataPath)
    const dataSheet = dataWb.Sheets[dataWb.SheetNames[0]]
    const dataRows: any[][] = XLSX.utils.sheet_to_json(dataSheet, { header: 1 })

    interface TenantRow {
      name: string
      group: string
      phone: string
      address: string
      memo: string
      rank: string
    }

    const tenantRows: TenantRow[] = []

    // Skip row 0 (title) and row 1 (headers), process from row 2
    for (let i = 2; i < dataRows.length; i++) {
      const row = dataRows[i]
      if (!row || !row[0]) continue

      tenantRows.push({
        name: String(row[0] || '').trim(),
        group: String(row[1] || '').trim(),
        phone: normalizePhone(String(row[2] || '')),
        address: String(row[3] || '').trim(),
        memo: String(row[4] || '').replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
        rank: String(row[5] || '').trim(),
      })
    }
    console.log(`  Found ${tenantRows.length} tenant rows in DATA.xlsx`)

    // Build: tenant name → property ID map
    const tenantPropertyMap = new Map<string, number>()
    const tenantSalesLookup = new Map<string, SalesInfo>() // for quick access
    let propertiesCreated = 0

    // Get the placeholder landlord ID
    const placeholderLandlordId = landlordIdMap.get(normalizeName('미확인'))!

    for (const tr of tenantRows) {
      const tenantKey = normalizeName(tr.name)
      const salesInfo = salesMap.get(tenantKey)
      if (salesInfo) tenantSalesLookup.set(tenantKey, salesInfo)

      // Find landlord for this tenant
      let landlordId = placeholderLandlordId
      if (salesInfo && salesInfo.landlordRaw) {
        const parsedLL = parseLandlordInfo(salesInfo.landlordRaw, salesInfo.landlordPhone)
        const llKey = normalizeName(parsedLL.name)
        if (landlordIdMap.has(llKey)) {
          landlordId = landlordIdMap.get(llKey)!
        }
      }

      const { address, addressDetail } = parseAddressParts(tr.address)
      const propertyType = detectPropertyType(tr.address)
      const isInactive = tr.group === 'MOVE OUT'
      const monthlyRent = findMonthlyRent(salesInfo)

      try {
        const result = await db.insertInto('property').values({
          landlord_id: landlordId,
          address: address || tr.address,
          address_detail: addressDetail,
          property_type: propertyType,
          monthly_rent_krw: monthlyRent,
          deposit_krw: 0,
          status: isInactive ? 'vacant' : 'occupied',
          permission_status: 'approved',
          notes: null,
          created_by: Number(adminId),
        }).returning('id').executeTakeFirstOrThrow()
        tenantPropertyMap.set(tenantKey, result.id)
        propertiesCreated++
      } catch (err: any) {
        console.warn(`  Warning: Failed to create property for "${tr.name}": ${err.message}`)
      }
    }
    console.log(`  Created ${propertiesCreated} properties`)

    // ─── Step 6: Create tenants ─────────────────────────────────────────
    console.log('\nStep 6: Creating tenants...')
    const tenantIdMap = new Map<string, number>() // normalized name → tenant ID
    let tenantsCreated = 0

    for (const tr of tenantRows) {
      const tenantKey = normalizeName(tr.name)
      const isInactive = tr.group === 'MOVE OUT'
      const rank = normalizeRank(tr.rank)
      const branch = inferBranch(tr.rank, tr.memo)

      try {
        const result = await db.insertInto('tenant').values({
          name: tr.name,
          phone: tr.phone || '',
          rank: rank || null,
          status: isInactive ? 'inactive' : 'active',
          base_location_id: 1,
          notes: tr.memo || null,
          branch,
          created_by: Number(adminId),
        }).returning('id').executeTakeFirstOrThrow()
        tenantIdMap.set(tenantKey, result.id)
        tenantsCreated++
      } catch (err: any) {
        console.warn(`  Warning: Failed to create tenant "${tr.name}": ${err.message}`)
      }
    }
    console.log(`  Created ${tenantsCreated} tenants`)

    // ─── Step 7: Create leases ──────────────────────────────────────────
    console.log('\nStep 7: Creating leases...')
    const leaseIdMap = new Map<string, number>() // normalized tenant name → lease ID
    let leasesCreated = 0

    for (const tr of tenantRows) {
      const tenantKey = normalizeName(tr.name)
      const salesInfo = tenantSalesLookup.get(tenantKey)
      const propertyId = tenantPropertyMap.get(tenantKey)
      const tenantId = tenantIdMap.get(tenantKey)

      if (!propertyId || !tenantId) continue

      const isInactive = tr.group === 'MOVE OUT'
      const monthlyRent = findMonthlyRent(salesInfo)

      let startDate = salesInfo?.leaseStart ? parseDate(salesInfo.leaseStart) : null
      let endDate = salesInfo?.leaseEnd ? parseDate(salesInfo.leaseEnd) : null

      // If no lease dates, use defaults
      if (!startDate) startDate = '2026-01-01'
      if (!endDate) endDate = '2027-12-31'

      try {
        const result = await db.insertInto('lease').values({
          property_id: propertyId,
          tenant_id: tenantId,
          start_date: startDate,
          end_date: endDate,
          monthly_rent_krw: monthlyRent,
          deposit_krw: 0,
          status: isInactive ? 'expired' : 'active',
          notes: null,
          created_by: Number(adminId),
        }).returning('id').executeTakeFirstOrThrow()
        leaseIdMap.set(tenantKey, result.id)
        leasesCreated++
      } catch (err: any) {
        console.warn(`  Warning: Failed to create lease for "${tr.name}": ${err.message}`)
      }
    }
    console.log(`  Created ${leasesCreated} leases`)

    // ─── Step 8: Create payments from SALES.xlsx ────────────────────────
    console.log('\nStep 8: Creating payments from SALES.xlsx...')
    let paymentsCreated = 0
    let paymentsSkipped = 0

    for (let i = 2; i < salesRows.length; i++) {
      const row = salesRows[i]
      if (!row || !row[0]) continue

      const dateStr = String(row[0] || '').trim()
      if (!dateStr) continue

      const tenantName = String(row[1] || '').trim()
      if (!tenantName) continue

      const tenantKey = normalizeName(tenantName)
      const leaseId = leaseIdMap.get(tenantKey)

      if (!leaseId) {
        paymentsSkipped++
        continue
      }

      const items = String(row[3] || '').trim()
      const amount = Number(row[5]) || 0
      const bankAmount = Number(row[7]) || 0
      const extraNotes = String(row[13] || '').trim()
      const paymentDate = parsePaymentDate(dateStr)

      if (!paymentDate) {
        paymentsSkipped++
        continue
      }

      const paymentType = determinePaymentType(items)
      const paymentMethod = bankAmount > 0 ? 'transfer' : 'cash'

      // Build notes
      let notes = items
      if (extraNotes) notes += ` | 추가: ${extraNotes}`

      // Determine billing month - extract from items or default to March 2026
      let billingMonth = '2026-03-01'
      const monthMatch = items.match(/(\d{4})년(\d{1,2})월/)
      if (monthMatch) {
        const y = monthMatch[1]
        const m = monthMatch[2].padStart(2, '0')
        billingMonth = `${y}-${m}-01`
      }

      try {
        await db.insertInto('payment').values({
          lease_id: leaseId,
          payment_type: paymentType,
          billing_month: billingMonth,
          amount_krw: amount,
          currency_paid: 'KRW',
          amount_paid: amount,
          payment_method: paymentMethod,
          payment_date: paymentDate,
          status: 'paid',
          received_by: Number(adminId),
          notes,
        }).execute()
        paymentsCreated++
      } catch (err: any) {
        console.warn(`  Warning: Failed to create payment for "${tenantName}" on ${paymentDate}: ${err.message}`)
        paymentsSkipped++
      }
    }
    console.log(`  Created ${paymentsCreated} payments (skipped ${paymentsSkipped})`)

    // ─── Summary ────────────────────────────────────────────────────────
    console.log('\n========================================')
    console.log('Import complete!')
    console.log(`  Landlords:   ${landlordIdMap.size}`)
    console.log(`  Properties:  ${propertiesCreated}`)
    console.log(`  Tenants:     ${tenantsCreated}`)
    console.log(`  Leases:      ${leasesCreated}`)
    console.log(`  Payments:    ${paymentsCreated}`)
    console.log('========================================')

    await db.destroy()
  } catch (err) {
    console.error('Import failed:', err)
    await db.destroy()
    process.exit(1)
  }
}

main()
