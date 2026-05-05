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
| `app/models/mls_listing.py` | MLS listing model; `to_frontend_light_dict()` for map API; `_determine_category()` classifies House/Condo/Other |
| `app/api/mls_listing_routes.py` | `POST /api/listings/` — bounds query for map; `GET /api/listings/` — paginated list; `GET /api/listings/<mls_number>` — single listing by MLS# |
| `app/api/appointment_routes.py` | Appointment CRUD; `POST /` accepts optional `agent_id` for referral bookings (checks conflict only, not schedule) |
| `app/utils/availability.py` | `agent_is_available`, `agent_has_conflict`, `pick_agent_for_appointment`, `_fallback_agent` |
| `app/utils/mailer.py` | Resend HTTP API for magic-link emails; from address `NoReply@tourit.ca` |
| `app/api/auth_routes.py` | Google OAuth; stores `return_to` path in Flask session so post-login redirect works |

### Frontend
| File | Purpose |
|---|---|
| `react-app/src/utils/apiFetch.js` | All API calls go through here; uses `REACT_APP_API_URL` in prod. Always use this — never bare `fetch()` |
| `react-app/src/store/property.js` | `areaProperties` (map bounds), `searchProperties` (term search), `getProperties` (keyed by `p.id`) |
| `react-app/src/components/Search/SearchArea.js` | `/area/...` route — map + list with Buy/Rent toggle, search bar, filter state |
| `react-app/src/components/Search/index.js` | `/search/:term` route — same layout, different data source |
| `react-app/src/components/Search/List/FilterPanel.js` | Slide-out filter panel (portal to body); price applies on-the-fly |
| `react-app/src/components/Search/Map/index.js` | Google Maps with clustering, InfoWindow |
| `react-app/src/components/Property/index.js` | Listing detail modal/page; `isPage` prop switches mobile Tour button from `absolute` to `fixed` |
| `react-app/src/components/Property/ListingPage.js` | Standalone page for `/listing/:mlsNumber` and `/a/:agentId/listing/:mlsNumber` routes |
| `react-app/src/components/Property/Tour/index.js` | Tour scheduling widget; `referralAgent` prop changes header label |
| `react-app/src/components/Appointments/ApptDetail/Agent.js` | Agent appointment detail modal — date/time edit, client info, reassign panel |
| `react-app/src/components/NavBar/index.js` | Nav bar; Google login passes `return_to` param; mobile has separate G-icon button |

### Sync (GitHub Actions / TypeScript)
| File | Purpose |
|---|---|
| `lib/services/hourlySync.ts` | Every 3h: incremental DDF sync + photo fetch (skips if photos_timestamp unchanged) |
| `lib/services/ddfSync.ts` | Daily: DDF sync with 26h lookback via `DDF_LAST_UPDATED` env var |
| `lib/adapters/ListingAdapter.ts` | `mapDDFToSupabase()` — all DDF field mappings live here |
| `lib/scripts/deactivateStale.ts` | Weekly: marks listings not in DDF as Inactive |
| `lib/scripts/geocodeListings.ts` | Weekly: geocodes listings with null lat/lng via Nominatim |
| `lib/scripts/imageBackfill.ts` | Weekly: fetches photos for listings with empty images[] |
| `lib/scripts/fullSyncOntario.ts` | One-time full Ontario sync (written, NOT yet run — awaiting user go-ahead) |

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
- **Property type filter**: Uses `matchesType(prop, slug)` in both SearchArea and Search/index. Checks `prop.category` first; falls back to regex on style/property_type for old listings without category set.
- **Category field**: `_determine_category(property_class, unit_number)` in `mls_listing.py` — class 300 + unit_number present → Condo; class 300 no unit → House; else Other. Both `category` and `type` keys in `_base_frontend_dict()` return this value.
- **Bed filter**: Exact match (`propBed === bed`) with `parseInt()` to handle type coercion. "5" means 5+.
- **Price filter**: Applied on-the-fly as slider moves (calls `setMin`/`setMax` directly). Other filters applied on Done.
- **FilterPanel**: Rendered as React portal to `document.body` (`ReactDOM.createPortal`). Reopening re-mounts — price preserved because it derives from parent state.
- **Google Maps**: Uses `withScriptjs`/`withGoogleMap` HOC from `react-google-maps`. Google Places Autocomplete initialized after `onMapReady` fires (to ensure API loaded).
- **Supabase egress**: Free tier = 5 GB/month. Key rule: always use `Prefer: return=minimal` on upserts. Never fetch `images[]` array just to check existence — use `photos_timestamp` instead.
- **Photo fetch**: Only call DDF GetObject if `photos_timestamp` changed. Comparison done before fetching.
- **Resend email**: `tourit.ca` domain must be verified in Resend dashboard (DNS TXT record). Magic link login for agents only.
- **CORS**: `app/__init__.py` allows `tourit.ca`, `www.tourit.ca`, `localhost:3000`, plus `FRONTEND_URL` env var.
- **MLS property IDs**: Frontend uses `"mls_<integer_pk>"` (not the mls_number string). `to_frontend_dict()` returns `id: f"mls_{self.id}"`. Redux `properties` store is keyed by this string. `appointment.to_dict()` returns the same format in `property_id`.
- **Shareable listing URLs**: `/listing/:mlsNumber` and `/a/:agentId/listing/:mlsNumber` both render `ListingPage`. Opening a listing from search uses `window.history.replaceState` (NOT `history.push`) so no navigation occurs — just URL bar update.
- **Agent referral links**: Agent share button copies `tourit.ca/a/:agentId/listing/:mlsNumber`. On that route, `referralAgent` prop flows: `ListingPage → Property → Tour → Contact → LoggedIn`. `agent_id` is included in the appointment POST, and the backend assigns the referral agent directly (skips `pick_agent_for_appointment`). Referral bookings only check for scheduling conflicts, not whether the agent has a configured availability schedule.
- **Google OAuth return-to**: Flask stores `return_to` path in `session['google_return_to']` (not OAuth state param, to avoid interfering with authlib CSRF). `LoginCard` also saves `tourReturn` to sessionStorage so the Tour widget can resume at the contact stage after login.
- **Mobile Tour button**: In `Property/index.js`, `isPage=true` (set by `ListingPage`) switches the mobile sticky button and slide-up panel from `absolute` to `fixed` positioning. Without this, `absolute bottom-0` lands at the bottom of the full-length page content, not the viewport.
- **Agent appointment detail**: `schedule` in `ApptDetail/Agent.js` must be memoized with `useMemo` — without it, a new object reference is created every render, causing `useEffect([schedule, today])` to loop infinitely and freeze the dropdowns. The `[appt]` reset effect uses `appt.id` as dependency (not the full object) so in-progress edits survive re-renders.
- **Always use `apiFetch`**: Never use bare `fetch()` in React components — it will hit the frontend domain in production instead of `api.tourit.ca`.

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
