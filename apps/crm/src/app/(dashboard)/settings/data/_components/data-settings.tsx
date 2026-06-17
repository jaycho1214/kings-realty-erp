"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataPanel } from "@/components/data-panel";
import { UtilityTypes } from "../../_components/utility-types";
import { BaseLocations } from "../../_components/base-locations";
import { ServiceCategories } from "../../_components/service-categories";
import { ExchangeVendors } from "../../_components/exchange-vendors";
import { OhaRates } from "../../_components/oha-rates";
import { RealtyFeeDefaults } from "../../_components/realty-fee-defaults";

interface UtilityTypeRow {
  id: number;
  name: string;
  is_default: boolean;
  created_at: Date;
}

interface BaseLocationRow {
  id: number;
  name: string;
  name_ko: string | null;
  sort_order: number;
}

interface ServiceCategoryRow {
  id: number;
  value: string;
  label: string;
  is_default: boolean;
  sort_order: number;
  created_at: Date;
}

interface ExchangeVendorRow {
  id: number;
  name: string;
  denominations: string | null;
  default_rate: string | null;
  phone: string | null;
}

interface DataSettingsProps {
  utilityTypes: UtilityTypeRow[];
  utilityUsageMap: Record<string, number>;
  baseLocations: BaseLocationRow[];
  baseLocationUsageMap: Record<string, number>;
  serviceCategories: ServiceCategoryRow[];
  serviceCategoryUsageMap: Record<string, number>;
  exchangeVendors: ExchangeVendorRow[];
  ohaRows: Record<string, { with: string; without: string }>;
  canEditOha: boolean;
  realtyFeeDefaults: { currency: string; amount: string }[];
}

export function DataSettings({
  utilityTypes,
  utilityUsageMap,
  baseLocations,
  baseLocationUsageMap,
  serviceCategories,
  serviceCategoryUsageMap,
  exchangeVendors,
  ohaRows,
  canEditOha,
  realtyFeeDefaults,
}: DataSettingsProps) {
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">데이터 관리</h2>
        <p className="text-sm text-muted-foreground">
          공과금 유형, 기지 위치, AS 카테고리를 관리합니다.
        </p>
      </div>

      <Tabs defaultValue="utility-types">
        <TabsList>
          <TabsTrigger value="utility-types">공과금 유형</TabsTrigger>
          <TabsTrigger value="base-locations">기지 위치</TabsTrigger>
          <TabsTrigger value="service-categories">AS 카테고리</TabsTrigger>
          <TabsTrigger value="exchange-vendors">환전업체</TabsTrigger>
          <TabsTrigger value="oha-rates">OHA 기준표</TabsTrigger>
          <TabsTrigger value="realty-fee">중개 수수료</TabsTrigger>
        </TabsList>
        <TabsContent value="utility-types">
          <DataPanel>
            <UtilityTypes types={utilityTypes} usageMap={utilityUsageMap} />
          </DataPanel>
        </TabsContent>
        <TabsContent value="base-locations">
          <DataPanel>
            <BaseLocations
              locations={baseLocations}
              usageMap={baseLocationUsageMap}
            />
          </DataPanel>
        </TabsContent>
        <TabsContent value="service-categories">
          <DataPanel>
            <ServiceCategories
              categories={serviceCategories}
              usageMap={serviceCategoryUsageMap}
            />
          </DataPanel>
        </TabsContent>
        <TabsContent value="exchange-vendors">
          <DataPanel>
            <ExchangeVendors vendors={exchangeVendors} />
          </DataPanel>
        </TabsContent>
        <TabsContent value="oha-rates">
          <DataPanel>
            <OhaRates rows={ohaRows} editable={canEditOha} />
          </DataPanel>
        </TabsContent>
        <TabsContent value="realty-fee">
          <DataPanel>
            <RealtyFeeDefaults rows={realtyFeeDefaults} />
          </DataPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}
