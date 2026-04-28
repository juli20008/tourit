/**
 * Maps a raw CREA DDF RETS field hash to the shape of the Supabase
 * `mls_listings` table (mirrors app/models/mls_listing.py).
 *
 * Field names below are the standard RETS system names returned by
 * CREA DDF.  If your metadata differs, run GetMetadata first and
 * compare: client.metadata.getTable('Property', 'ResidentialProperty')
 */

export interface DdfRaw {
  [key: string]: string | undefined;
}

/** Row shape expected by the mls_listings Supabase table. */
export interface SupabaseListing {
  mls_number: string;
  status: string | null;
  standard_status: string | null;
  property_class: string | null;
  transaction_type: string | null;
  list_price: number | null;
  sold_price: number | null;
  original_price: number | null;
  list_date: string | null;
  sold_date: string | null;
  last_status: string | null;
  street_number: string | null;
  street_name: string | null;
  street_suffix: string | null;
  unit_number: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  bed: number | null;
  bath: number | null;
  sqft: string | null;
  year_built: string | null;
  style: string | null;
  property_type: string | null;
  description: string | null;
  images: string[];
  agent_name: string | null;
  agent_email: string | null;
  brokerage: string | null;
}

// CREA DDF single-letter codes → human-readable labels
const STATUS_MAP: Record<string, string> = {
  A:      'Active',
  Active: 'Active',
  U:      'Sold',
  Sc:     'Sold Conditional',
  Cs:     'Conditional Sale',
  Lc:     'Leased Conditional',
  Pc:     'Price Changed',
  Exp:    'Expired',
  Ter:    'Terminated',
  Sus:    'Suspended',
  Del:    'Deleted',
};

function parseIntField(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseFloatField(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseIsoDate(val: string | undefined): string | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Convert one raw DDF record into a Supabase-ready row.
 * Pass `images` as an array of public photo URLs (obtained separately
 * via GetObject) — defaults to [] when omitted.
 */
export function adaptListing(raw: DdfRaw, images: string[] = []): SupabaseListing {
  const status = raw['Status'] ?? null;

  return {
    mls_number:       raw['MLS_NUM'] ?? '',
    status,
    standard_status:  status ? (STATUS_MAP[status] ?? status) : null,
    property_class:   raw['PropertyClass'] ?? raw['Class'] ?? null,
    transaction_type: raw['TransactionType'] ?? null,

    list_price:     parseIntField(raw['ListPrice']),
    sold_price:     parseIntField(raw['SoldPrice']),
    original_price: parseIntField(raw['OLstPrice']),
    list_date:      parseIsoDate(raw['ListDate']),
    sold_date:      parseIsoDate(raw['SoldDate']),
    last_status:    raw['LastStatus'] ?? null,

    // CREA DDF exposes both split fields and a combined Addr.
    // Prefer the split fields; fall back to a regex on Addr for the number.
    street_number: raw['StreetNumber'] ?? raw['Addr']?.match(/^\d+/)?.[0] ?? null,
    street_name:   raw['StreetName']   ?? null,
    street_suffix: raw['StreetAbbreviation'] ?? null,
    unit_number:   raw['Apt_Num']  ?? raw['Unit_Num']  ?? null,

    city:         raw['Municipality'] ?? raw['City']    ?? null,
    state:        raw['Prov_State']   ?? null,
    zip:          raw['PostalCode']   ?? null,
    country:      raw['Country']      ?? 'CA',
    neighborhood: raw['Community']    ?? raw['Area']    ?? null,

    lat: parseFloatField(raw['Latitude']),
    lng: parseFloatField(raw['Longitude']),

    bed:        raw['Beds']     ? parseIntField(raw['Beds'])     : null,
    bath:       raw['Bath_tot'] ? parseIntField(raw['Bath_tot']) : null,
    sqft:       raw['TotFlArea'] ?? raw['ApproxSqFt'] ?? null,
    year_built: raw['YrBuilt']  ?? null,
    style:      raw['TypeDwel'] ?? raw['Style'] ?? null,
    property_type: raw['PropertyClass'] ?? raw['TypeDwel'] ?? null,
    description:   raw['MLSComments'] ?? raw['Remarks_for_Clients'] ?? null,

    images,
    agent_name:  raw['LA_Name_format'] ?? raw['ListAgentName'] ?? null,
    agent_email: raw['LA_email']       ?? null,
    brokerage:   raw['ListBrokerage']  ?? null,
  };
}
