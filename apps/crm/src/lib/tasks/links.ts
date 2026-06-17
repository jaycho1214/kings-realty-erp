import type { LinkEntityType } from "./types";

/** Korean label for each linkable entity type. */
export const LINK_TYPE_LABEL: Record<LinkEntityType, string> = {
  tenant: "세입자",
  property: "매물",
  landlord: "임대인",
  lease: "계약",
  service_request: "AS",
  appliance: "비품",
};

/** Display order for the attach picker. */
export const LINK_TYPE_ORDER: LinkEntityType[] = [
  "tenant",
  "property",
  "landlord",
  "lease",
  "service_request",
  "appliance",
];

/** Deep-link to an attached entity's detail page. */
export function linkHref(type: LinkEntityType, id: number): string {
  switch (type) {
    case "tenant":
      return `/tenants/${id}`;
    case "property":
      return `/properties/${id}`;
    case "landlord":
      return `/landlords/${id}`;
    case "lease":
      return `/leases/${id}`;
    case "service_request":
      return `/services/${id}`;
    case "appliance":
      return `/appliances/${id}`;
  }
}
