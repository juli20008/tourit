# Tourit — Claude Code Project Context

## Stack
- **Backend**: Flask + SQLAlchemy, hosted on Render (`api.tourit.ca`)
- **Frontend**: React + Redux, subfolder `react-app/`, hosted on Vercel (`tourit.ca`)
- **Database**: Supabase (PostgreSQL free tier — 5 GB/month egress limit)
- **MLS data**: CREA DDF feed via RETS, synced by GitHub Actions

## Architecture
```
DDF (RETS)
  → lib/services/hourlySync.ts / ddfSync.ts   (fetch)
  → lib/adapters/ListingAdapter.ts             (mapDDFToSupabase)
  → Supabase mls_listings table
  → app/api/mls_listing_routes.py              (Flask API)
  → app/models/mls_listing.py to_frontend_light_dict()
  → react-app/src/utils/apiFetch.js
  → react-app/src/store/property.js            (Redux thunks)
  → SearchArea.js / Search/index.js            (client-side filter)
  → List/ + Map/                               (display)
```

## Key Files

### Backend
| File | Purpose |
|---|---|
| `app/__init__.py` | Flask app factory, CORS, blueprints, SPA catch-all |
| `app/models/mls_listing.py` | MLS listing model; `to_frontend_light_dict()` is what the map API returns |
| `app/api/mls_listing_routes.py` | `POST /api/listings/` — bounds query for map; `GET /api/listings/` — paginated list |
| `app/utils/mailer.py` | Resend HTTP API for magic-link emails; from address `NoReply@tourit.ca` |

### Frontend
| File | Purpose |
|---|---|
| `react-app/src/utils/apiFetch.js` | All API calls go through here; uses `REACT_APP_API_URL` in prod |
| `react-app/src/store/property.js` | `areaProperties` (map bounds), `searchProperties` (term search) |
| `react-app/src/components/Search/SearchArea.js` | `/area/...` route — map + list with Buy/Rent toggle, search bar, filter state |
| `react-app/src/components/Search/index.js` | `/search/:term` route — same layout, different data source |
| `react-app/src/components/Search/List/FilterPanel.js` | Slide-out filter panel (portal to body); price applies on-the-fly |
| `react-app/src/components/Search/Map/index.js` | Google Maps with clustering, InfoWindow |

### Sync (GitHub Actions / TypeScript)
| File | Purpose |
|---|---|
| `lib/services/hourlySync.ts` | Every 3h: incremental DDF sync + photo fetch (skips if photos_timestamp unchanged) |
| `lib/services/ddfSync.ts` | Daily: DDF sync with 26h lookback via `DDF_LAST_UPDATED` env var |
| `lib/adapters/ListingAdapter.ts` | `mapDDFToSupabase()` — all DDF field mappings live here |
| `lib/scripts/deactivateStale.ts` | Weekly: marks listings not in DDF as Inactive |
| `lib/scripts/geocodeListings.ts` | Weekly: geocodes listings with null lat/lng via Nominatim |
| `lib/scripts/imageBackfill.ts` | Weekly: fetches photos for listings with empty images[] |

## GitHub Actions Schedule
| Workflow | Schedule | Notes |
|---|---|---|
| `hourly-sync.yml` | Every 3h | Incremental listings + photos |
| `ddf-sync.yml` | Daily 7am UTC | 26h lookback, photo timestamp check |
| `deactivate-stale.yml` | Sunday 6am UTC | Full DDF inventory scan — heavy |
| `geocode-listings.yml` | Sunday 8am UTC | Exits early if nothing to do |
| `image-backfill.yml` | Sunday 9am UTC | Exits early if nothing to do |

## Environment Variables (Render)
| Var | Used by |
|---|---|
| `SUPABASE_URL` | All DB access |
| `SUPABASE_SERVICE_ROLE_KEY` | All DB access |
| `RESEND_API_KEY` | `app/utils/mailer.py` |
| `MAIL_FROM` | Override from address (default: `Tourit <NoReply@tourit.ca>`) |
| `REPLIERS_API_KEY` | `app/services/repliers_sync.py` (Repliers feed) |
| `FRONTEND_URL` | CORS allowed origin |
| `SECRET_KEY` | Flask session |

## Environment Variables (GitHub Secrets)
`DDF_LOGIN_URL`, `DDF_USERNAME`, `DDF_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Environment Variables (React / Vercel)
| Var | Value |
|---|---|
| `REACT_APP_API_URL` | `https://api.tourit.ca` |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Google Maps + Places API key |

## Important Decisions / Gotchas

- **`/area/...` vs `/search/:term`**: These are TWO separate components (`SearchArea.js` vs `Search/index.js`). Filter logic must be updated in both.
- **Buy/Rent filter**: Stored as `"For Sale"` / `"For Lease"` in DB `transaction_type` column. Frontend checks `.includes("lease")`.
- **Property type filter**: `prop.type` = `style || property_type` from DB. Filter panel uses slugs (`"condo"`, `"house"`, `"townhouse"`, `"multi"`) mapped via `matchesType()` in SearchArea.
- **Bed filter**: Exact match (`propBed === bed`) with `parseInt()` to handle type coercion. "5" means 5+.
- **Price filter**: Applied on-the-fly as slider moves (calls `setMin`/`setMax` directly). Other filters applied on Done.
- **FilterPanel**: Rendered as React portal to `document.body` (`ReactDOM.createPortal`). Reopening re-mounts — price preserved because it derives from parent state.
- **Google Maps**: Uses `withScriptjs`/`withGoogleMap` HOC from `react-google-maps`. Google Places Autocomplete initialized after `onMapReady` fires (to ensure API loaded).
- **Supabase egress**: Free tier = 5 GB/month. Key rule: always use `Prefer: return=minimal` on upserts. Never fetch `images[]` array just to check existence — use `photos_timestamp` instead.
- **Photo fetch**: Only call DDF GetObject if `photos_timestamp` changed. Comparison done before fetching.
- **Resend email**: `tourit.ca` domain must be verified in Resend dashboard (DNS TXT record). Magic link login for agents only.
- **CORS**: `app/__init__.py` allows `tourit.ca`, `www.tourit.ca`, `localhost:3000`, plus `FRONTEND_URL` env var.

## Local Dev
```bash
# Backend
pip install -r requirements.txt
flask run                          # port 5000

# Frontend  
cd react-app
npm install
npm start                          # port 3000, proxies /api/* to localhost:5000
```
