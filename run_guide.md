## 🚀 Yillow Project - Running the Application

### Prerequisites Completed ✅

- Python virtual environment created
- All dependencies installed
- Database: **Supabase (PostgreSQL)** — `db.nrlkgzitxsclzasyofkp.supabase.co`
- Flask app configured

---

## **Step 1: Activate Virtual Environment**

```powershell
cd c:\Users\Hrana\OneDrive\MiaSoft\yillow
venv_yillow\Scripts\Activate.ps1
```

---

## **Step 2: Install / Sync Dependencies**

Run this once after pulling new changes.

If `pipenv` is installed, use it:

```powershell
pipenv install
```

If `pipenv` is not installed, use the active virtual environment instead:

```powershell
python -m pip install -r requirements.txt
```

If you need to install `pipenv` first:

```powershell
python -m pip install pipenv
```

---

## **Step 3: Apply Database Migrations**

Run once on first setup, or after pulling new migrations:

```powershell
flask db upgrade
```

This creates all tables in Supabase including the new `mls_agents` table.

---

## **Step 4: Start the Backend (Flask)**

In PowerShell/Terminal 1:

```powershell
flask run
```

The Flask server will start at: **[http://localhost:5000](http://localhost:5000)**

---

## **Step 5: Start the Frontend (React)**

In PowerShell/Terminal 2:

```powershell
cd react-app
npm start
```

The React app will start at: **[http://localhost:3000](http://localhost:3000)**

---

## **Accessing the Application**

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)

---

## **Repliers Agent Data Sync**

The `mls_agents` table is populated from the Repliers API. Run the sync manually from the terminal:

```powershell
# Test with 2 pages first (~1000 agents)
flask shell
>>> from app.services.repliers_sync import sync_agents
>>> sync_agents(max_pages=2, verbose=True)
>>> exit()

# Full sync (~70,000 agents, takes 20–30 minutes)
flask repliers sync-agents
```

The sync is safe to re-run at any time — it uses UPSERT, so existing records are updated, not duplicated.

---

## **MLS Agent API Endpoints**

| Endpoint | Description |
|----------|-------------|
| `GET /api/mls-agents/?name=john&city=toronto` | Search by name / city |
| `GET /api/mls-agents/?license_id=12345` | Lookup by license number |
| `GET /api/mls-agents/nearby?lat_min=43.6&lat_max=43.7&lng_min=-79.4&lng_max=-79.3` | Map bounding-box query |
| `GET /api/mls-agents/<repliers_id>` | Single agent detail |

---

## **Optional: Seed Database with Sample Data**

To add sample data for testing:

```powershell
flask seed all
```

---

## **Quick Start (One Command Per Terminal)**

### Terminal 1 (Backend):

```powershell
cd c:\Users\Hrana\OneDrive\MiaSoft\yillow; venv_yillow\Scripts\Activate.ps1; flask run
```

### Terminal 2 (Frontend):

```powershell
cd c:\Users\Hrana\OneDrive\MiaSoft\yillow\react-app; npm start
```

---

## **Fast Demo Deploy**

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from `render.yaml`.
3. Set `SECRET_KEY` and `DATABASE_URL` when Render prompts you.
4. Deploy the `yillow-demo` service.

The Docker image runs `flask db upgrade` and `flask seed all` during build, so the demo opens with sample data.

> ⚠️ The app no longer has a SQLite fallback. `DATABASE_URL` must be set to a PostgreSQL connection string in all environments.

---

**You're all set! 🎉**
