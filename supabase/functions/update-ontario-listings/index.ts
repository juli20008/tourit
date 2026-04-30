import { createClient } from "jsr:@supabase/supabase-js@2";

const REPLIERS_BASE = "https://csr-api.repliers.io";
const BATCH_SIZE = 100;
const REQUEST_DELAY_MS = 300;

interface ReplicrsAddress {
  streetNumber?: string;
  streetName?: string;
  streetSuffix?: string;
  unitNumber?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  neighborhood?: string;
}

interface RepliersListing {
  mlsNumber: string;
  status?: string;
  standardStatus?: string;
  class?: string;
  type?: string;
  listPrice?: number;
  soldPrice?: number;
  originalPrice?: number;
  listDate?: string;
  soldDate?: string;
  lastStatus?: string;
  address?: ReplicrsAddress;
  map?: { latitude?: number; longitude?: number };
  details?: {
    numBedrooms?: number;
    numBathrooms?: number;
    sqft?: number | string;
    yearBuilt?: number | string;
    style?: string;
    propertyType?: string;
    description?: string;
  };
  agents?: Array<{
    name?: string;
    email?: string;
    brokerage?: { name?: string };
  }>;
  office?: { brokerageName?: string };
  images?: string[];
}

interface RepliersResponse {
  numPages: number;
  count: number;
  listings: RepliersListing[];
}

function truncate(val: string | undefined | null, len: number): string | null {
  if (!val) return null;
  return val.slice(0, len) || null;
}

function parseDate(val: string | undefined | null): string | null {
  if (!val) return null;
  try {
    const iso = val.replace("Z", "+00:00").split("+")[0];
    return new Date(iso).toISOString();
  } catch {
    return null;
  }
}

function toDbRow(r: RepliersListing): Record<string, unknown> {
  const addr = r.address ?? {};
  const geo = r.map ?? {};
  const det = r.details ?? {};
  const firstAgent = r.agents?.[0] ?? {};
  const brokerage =
    firstAgent.brokerage?.name ?? r.office?.brokerageName ?? null;

  const images = (r.images ?? []).filter(
    (img) => img && !img.startsWith("sample/"),
  );

  const sqft =
    det.sqft != null
      ? truncate(String(det.sqft), 20)
      : null;
  const yearBuilt =
    det.yearBuilt != null
      ? truncate(String(det.yearBuilt), 10)
      : null;

  return {
    mls_number: r.mlsNumber,
    // mlsNumber doubles as external_id for Repliers listings
    // (photos_timestamp is not available from this source)
    external_id: r.mlsNumber,
    photos_timestamp: null,
    photos_count: null,
    status: r.status ?? null,
    standard_status: r.standardStatus ?? null,
    property_class: truncate(r.class, 50),
    transaction_type: truncate(r.type, 20),
    list_price: r.listPrice ?? null,
    sold_price: r.soldPrice ?? null,
    original_price: r.originalPrice ?? null,
    list_date: parseDate(r.listDate),
    sold_date: parseDate(r.soldDate),
    last_status: truncate(r.lastStatus, 50),
    street_number: truncate(addr.streetNumber, 20),
    street_name: truncate(addr.streetName, 100),
    street_suffix: truncate(addr.streetSuffix, 30),
    unit_number: truncate(addr.unitNumber, 20),
    city: truncate(addr.city, 100),
    state: truncate(addr.state, 10),
    zip: truncate(addr.zip, 15),
    country: truncate(addr.country, 10),
    neighborhood: truncate(addr.neighborhood, 100),
    lat: geo.latitude ?? null,
    lng: geo.longitude ?? null,
    bed: det.numBedrooms ?? null,
    bath: det.numBathrooms ?? null,
    sqft,
    year_built: yearBuilt,
    style: truncate(det.style, 100),
    property_type: truncate(det.propertyType, 50),
    description: det.description ?? null,
    images,
    agent_name: truncate(firstAgent.name, 100),
    agent_email: truncate(firstAgent.email, 255),
    brokerage: truncate(brokerage, 200),
    updated_at: new Date().toISOString(),
  };
}

async function fetchPage(
  apiKey: string,
  page: number,
): Promise<RepliersResponse> {
  const url = new URL(`${REPLIERS_BASE}/listings`);
  url.searchParams.set("pageNum", String(page));
  url.searchParams.set("resultsPerPage", String(BATCH_SIZE));
  // Repliers supports state-level filtering
  url.searchParams.set("state", "Ontario");

  const resp = await fetch(url.toString(), {
    headers: { "REPLIERS-API-KEY": apiKey },
  });

  if (!resp.ok) {
    throw new Error(`Repliers API error ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  if (Array.isArray(data)) {
    throw new Error(`Repliers API returned error array: ${JSON.stringify(data)}`);
  }
  return data as RepliersResponse;
}

async function upsertBatch(
  supabase: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("mls_listings")
    .upsert(rows, { onConflict: "mls_number", ignoreDuplicates: false });

  if (error) throw new Error(`Upsert failed: ${error.message}`);
  return rows.length;
}

async function logSync(
  supabase: ReturnType<typeof createClient>,
  params: {
    function_name: string;
    status: "success" | "error";
    rows_upserted: number;
    pages_processed: number;
    error_message: string | null;
    started_at: string;
    finished_at: string;
  },
) {
  await supabase.from("sync_logs").insert(params);
}

Deno.serve(async (_req: Request) => {
  const startedAt = new Date().toISOString();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("REPLIERS_API_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  let totalUpserted = 0;
  let pagesProcessed = 0;

  try {
    // Fetch page 1 to get total page count
    const firstPage = await fetchPage(apiKey, 1);
    const numPages = firstPage.numPages ?? 1;

    console.log(
      `[ontario-sync] ${firstPage.count} listings, ${numPages} pages`,
    );

    const processPage = async (pageNum: number, data: RepliersResponse) => {
      const rows = (data.listings ?? [])
        .filter((r) => r.mlsNumber)
        .map(toDbRow);

      const upserted = await upsertBatch(supabase, rows);
      totalUpserted += upserted;
      pagesProcessed++;
      console.log(
        `[ontario-sync] page ${pageNum}/${numPages}: ${upserted} upserted (total: ${totalUpserted})`,
      );
    };

    await processPage(1, firstPage);

    for (let page = 2; page <= numPages; page++) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      const data = await fetchPage(apiKey, page);
      await processPage(page, data);
    }

    const finishedAt = new Date().toISOString();
    await logSync(supabase, {
      function_name: "update-ontario-listings",
      status: "success",
      rows_upserted: totalUpserted,
      pages_processed: pagesProcessed,
      error_message: null,
      started_at: startedAt,
      finished_at: finishedAt,
    });

    console.log(`[ontario-sync] Done — ${totalUpserted} rows upserted.`);

    return new Response(
      JSON.stringify({ ok: true, rows_upserted: totalUpserted, pages_processed: pagesProcessed }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finishedAt = new Date().toISOString();

    console.error(`[ontario-sync] ERROR: ${message}`);

    await logSync(supabase, {
      function_name: "update-ontario-listings",
      status: "error",
      rows_upserted: totalUpserted,
      pages_processed: pagesProcessed,
      error_message: message,
      started_at: startedAt,
      finished_at: finishedAt,
    });

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
