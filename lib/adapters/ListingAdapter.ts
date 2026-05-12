export interface DdfRaw {
  [key: string]: any;
}

export interface SupabaseListing {
  id?: number | null;
  external_id: string | null;
  mls_number: string | null;
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
  bath_half: number | null;
  sqft: string | null;
  building_area_units: string | null;
  year_built: number | null;
  style: string | null;
  property_type: string | null;
  category: string | null; // <-- 在这里加这一行
  description: string | null;
  images: string[];
  agent_name: string | null;
  agent_email: string | null;
  brokerage: string | null;
  cooling: string | null;
  heating: string | null;
  heating_fuel: string | null;
  parking_total: number | null;
  garage_yn: boolean | null;
  photos_count: number | null;
  photos_timestamp: string | null;
  board_id: string | null;
  realtor_link: string | null;
  updated_at: Date | null;
}

function firstDefined(...values: any[]): any {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
}

function firstEmail(...values: any[]): string | null {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s && s !== 'False' && s !== 'True' && s.includes('@')) return s;
  }
  return null;
}

// 纯逻辑判定，不依赖 PublicRemarks
function deriveCategory(raw: any): string {
  const pType = String(raw.PropertyType || "");
  const oType = String(raw.OwnershipType || "");
  const unit = String(raw.UnitNumber || "").trim();
  const fee = toNumber(raw.AssociationFee) || 0;

  // 1. 判定非住宅 (根据 PropertyType)
  if (pType === "303") return "Land";
  if (pType === "304" || pType === "305") return "Commercial";

  // 2. 判定 Condo (法律产权优先：12=Condo, 16=Strata)
  if (oType === "12" || oType === "16") return "Condo";

  // 3. 判定 Townhouse (代码 14)
  if (oType === "14") return "Townhouse";

  // 4. 判定 House (Freehold 产权 3 或 4，且没有单元号)
  if ((oType === "3" || oType === "4") && unit === "") return "House";

  // 5. 补充逻辑：只要有管理费且不属于上述分类，通常归为 Condo 体系
  if (fee > 0) return "Condo";

  return "House"; // 默认兜底为 House
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeInteger(value: any): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Math.floor(parsed || 0);
}

function toInteger(value: any): number | null {
  if (value === null || value === undefined || value === '') return 0;
  return safeInteger(value);
}

function parseIntSafe(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  return safeInteger(value);
}

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDotNetTicks(value: any): string | null {
  if (!value) return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  // BigInt arithmetic prevents float precision loss on 18-digit .NET tick values.
  // date.getTime() is ms since Unix epoch (~1.8e12 for 2026) — safely within
  // Number.MAX_SAFE_INTEGER, so BigInt(date.getTime()) is exact.
  const ticks = 621355968000000000n + BigInt(date.getTime()) * 10000n;
  return String(ticks);
}

function normalizePropertyType(value: any): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function cleanCity(value: any): string | null {
  if (!value) return null;
  return String(value).replace(/\s*\([^)]*\)\s*$/, '').trim() || null;
}

function parseSqft(value: any): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const rangeMatch = text.match(/^(\d[\d,]*)\s*-\s*(\d[\d,]*)$/);
  if (rangeMatch) {
    return rangeMatch[1].replace(/,/g, '');
  }

  const firstNumber = text.match(/\d[\d,]*/);
  return firstNumber ? firstNumber[0].replace(/,/g, '') : text;
}

function parseBoolean(value: any): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['n', 'no', 'false', '0'].includes(normalized)) return false;
  return null;
}

function standardStatusFromReplyCode(item: DdfRaw): { status: string | null; standard_status: string | null } {
  const replyCode = String(firstDefined(item.replyCode, item.ReplyCode) ?? '');
  if (replyCode === '0') {
    return { status: 'A', standard_status: 'Active' };
  }

  const status = firstDefined(item.Status, item.status);
  const standardStatus = firstDefined(item.StandardStatus, item.standard_status);
  return {
    status: status !== null ? String(status) : null,
    standard_status: standardStatus !== null ? String(standardStatus) : null,
  };
}

export function mapDDFToSupabase(item: any): any {
  console.log('Mapping item:', item?.ListingKey);

  const raw = item ?? {};
  const { status, standard_status } = standardStatusFromReplyCode(raw);

  const lease = toNumber(raw.Lease);
  const listPrice = toNumber(raw.ListPrice);
  const price = lease !== null && lease > 0 ? lease : listPrice;

  const rawCityStr = String(raw.City ?? '');
  const city = cleanCity(rawCityStr);
  // Extract "(Doncrest)" style community from city string as neighbourhood fallback
  const cityNeighbourhood = rawCityStr.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() ?? null;
  const listingKey = toInteger(raw.ListingKey ?? raw.ListingID ?? raw.id);
  const listingId = firstDefined(raw.ListingId, raw.ListingID, raw.MLS_NUM, raw.MlsNumber, raw.ListingKey);
  const photosCount = parseIntSafe(firstDefined(raw.PhotosCount, raw.PhotoCount, raw.ImageCount));
  const photosTimestamp = firstDefined(raw.PhotosChangeTimestamp, raw.photosChangeTimestamp);
  const propertyCategory = deriveCategory(raw);
  return {
    id: listingKey,
    external_id: firstDefined(raw.ListingId, raw.ListingIdFormat, raw.ListingID, raw.MLS_NUM, raw.MlsNumber) !== null
      ? String(firstDefined(raw.ListingId, raw.ListingIdFormat, raw.ListingID, raw.MLS_NUM, raw.MlsNumber))
      : null,
    mls_number: listingId !== null ? String(listingId) : null,
    status,
    standard_status,
    property_class: firstDefined(raw.PropertyClass, raw.Class, raw.PropertyType),
    transaction_type: (lease !== null && lease > 0) ? 'For Lease' : (firstDefined(raw.TransactionType, raw.Transaction, raw.ListingType) ?? 'For Sale'),
    list_price: price,
    sold_price: toNumber(raw.SoldPrice),
    original_price: toNumber(firstDefined(raw.OriginalPrice, raw.OriginalListPrice, raw.OLstPrice)),
    list_date: firstDefined(raw.ListDate, raw.ListingDate) ? String(firstDefined(raw.ListDate, raw.ListingDate)) : null,
    sold_date: firstDefined(raw.SoldDate, raw.CloseDate) ? String(firstDefined(raw.SoldDate, raw.CloseDate)) : null,
    last_status: firstDefined(raw.LastStatus, raw.StatusDescription),
    street_number: firstDefined(raw.StreetNumber, raw.Address?.StreetNumber, raw.Addr?.match(/^\d+/)?.[0]),
    street_name: firstDefined(raw.StreetName, raw.Address?.StreetName),
    street_suffix: firstDefined(raw.StreetSuffix, raw.StreetAbbreviation, raw.Suffix),
    unit_number: firstDefined(raw.UnitNumber, raw.UnitNum, raw.Apt_Num, raw.Unit_Num),
    city,
    state: firstDefined(raw.StateOrProvince, raw.Prov_State, raw.State),
    zip: firstDefined(raw.PostalCode, raw.Zip),
    country: firstDefined(raw.Country),
    neighborhood: firstDefined(raw.Neighborhood, raw.Community, raw.Area) ?? cityNeighbourhood,
    lat: toNumber(firstDefined(raw.Address?.Latitude, raw.Latitude, raw.Lat, raw.lat)),
    lng: toNumber(firstDefined(raw.Address?.Longitude, raw.Longitude, raw.Lng, raw.lng)),
    bed: toInteger(firstDefined(raw.BedroomsTotal, raw.Bedrooms, raw.Beds)),
    bath: toInteger(firstDefined(raw.BathroomsTotal, raw.Bath_tot, raw.BathsTotal)),
    bath_half: parseIntSafe(firstDefined(raw.BathroomsHalf, raw.BathroomsPartial, raw.HalfBaths)),
    sqft: parseSqft(firstDefined(raw.BuildingAreaTotal, raw.Sqft, raw.TotFlArea, raw.ApproxSqFt)),
    building_area_units: firstDefined(raw.BuildingAreaUnits, raw.AreaUnits) ?? 'sqft',
    year_built: toInteger(firstDefined(raw.YearBuilt, raw.YrBuilt, raw.ConstructionYear)),
    style: firstDefined(raw.Style, raw.TypeDwel),
    property_type: normalizePropertyType(firstDefined(raw.PropertyType, raw.PropertyClass, raw.TypeDwel)),
    category: propertyCategory, // <-- 把分类存进数据库
    description: firstDefined(raw.PublicRemarks, raw.Description, raw.MLSComments, raw.Remarks_for_Clients),
    images: [],
    agent_name: firstDefined(raw.ListAgentFullName, raw.LA_Name_format, raw.ListAgentName),
    agent_email: firstEmail(raw.ListAgentEmail, raw.LA_email),
    brokerage: firstDefined(raw.ListOfficeName, raw.ListBrokerage, raw.BrokerageName),
    cooling: firstDefined(raw.Cooling, raw.CoolingType, raw.AC),
    heating: firstDefined(raw.Heating, raw.HeatingType),
    heating_fuel: firstDefined(raw.HeatingFuel, raw.HeatingFuelType),
    parking_total: parseIntSafe(firstDefined(raw.ParkingTotal, raw.ParkingSpaces, raw.Parking)),
    garage_yn: String(firstDefined(raw.GarageYN, raw.Garage, raw.HasGarage) ?? '') === 'True',
    photos_count: photosCount,
    photos_timestamp: toDotNetTicks(photosTimestamp),
    board_id: firstDefined(raw.ListAOR, raw.ListAor, raw.BoardId, raw.board_id) !== null
      ? String(firstDefined(raw.ListAOR, raw.ListAor, raw.BoardId, raw.board_id))
      : null,
    realtor_link: firstDefined(raw.MoreInformationLink, raw.MoreInfoLink, raw.Link) ? String(firstDefined(raw.MoreInformationLink, raw.MoreInfoLink, raw.Link)) : null,
    updated_at: toDate(firstDefined(raw.ModificationTimestamp, raw.LastUpdated, raw.UpdatedAt)),
    association_fee: toNumber(raw.AssociationFee),
    association_fee_frequency: firstDefined(raw.AssociationFeeFrequency) ? String(firstDefined(raw.AssociationFeeFrequency)) : null,
    lot_frontage: firstDefined(raw.FrontageLength) ? String(raw.FrontageLength).trim() : null,
    lot_size_area: toNumber(raw.LotSizeArea) || null,
    construction_materials: firstDefined(raw.ConstructionMaterials) ? String(raw.ConstructionMaterials).trim() : null,
    levels: firstDefined(raw.Levels) ? String(raw.Levels).trim() : null,
    ownership_type: firstDefined(raw.OwnershipType) ? String(raw.OwnershipType).trim() : null,
    last_seen_at: new Date().toISOString(),
  };
}

export function adaptListing(raw: DdfRaw, images: string[] = []): SupabaseListing {
  const listing = mapDDFToSupabase(raw);
  return {
    ...listing,
    images: images.length ? images : listing.images,
  };
}

export const mapToDb = mapDDFToSupabase;
