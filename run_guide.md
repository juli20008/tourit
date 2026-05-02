## Yillow Project - Local Test Run

This repo runs from:

```powershell
C:\Users\Hrana\OneDrive\MiaSoft\tourit
```

### 1. Start the backend

```powershell
.\launch_backend.cmd
```

Backend URL:

```text
http://localhost:5000
```

### 2. Start the frontend

```powershell
.\launch_frontend.cmd
```

Frontend URL:

```text
http://localhost:3000
```

### 3. If you want a one-line test start

Open two terminals and run:

```powershell
cd C:\Users\Hrana\OneDrive\MiaSoft\tourit
.\launch_backend.cmd
```

```powershell
cd C:\Users\Hrana\OneDrive\MiaSoft\tourit\react-app
set NODE_OPTIONS=--openssl-legacy-provider
npm start
```

### Notes

- The backend uses Flask.
- The frontend uses CRA / `react-scripts`.
- If the frontend does not stay open in a background window, run it from a visible terminal with `npm start`.


update db mls_listings: npx ts-node lib/services/ddfSync.ts


  ⎿  OneDrive\MiaSoft\tourit\migrations\versions\20260430_000003_fix_photos_timestamp_type.py


# 假设你的虚拟环境文件夹叫 .venv 或 venv
.\.venv\Scripts\Activate.ps1

#直接run python
python -m flask repliers resync-cdn-fields



  DDF_CDN_SINCE=2000-01-01T00:00:00Z npx ts-node lib/scripts/resyncCdnFields.ts


python -m flask db upgrade

 npx ts-node lib/scripts/resyncCdnFields.ts 

 npx ts-node lib/scripts/checkCdnFields.ts
npx ts-node lib/scripts/ddfResearch.ts
   npx ts-node lib/scripts/ddfPhotos.ts
     npx ts-node lib/scripts/ddfMediaSearch.ts
       npx ts-node lib/scripts/ddfGetPhotos.ts

         npx ts-node lib/scripts/dwGetObject.ts
         npx ts-node lib/scripts/ddfRawGetObject.ts
npx ts-node lib/scripts/testTorontoPhotos.ts
        npx ts-node lib/services/ddfSync.ts

        npx ts-node test-ddf.ts


          npx ts-node lib/scripts/ddfDumpFields.ts --mls=C12975708

  输出里找 ListingKey: 12345678，然后用那个数字跑 ddfRawGetObject：

  npx ts-node lib/scripts/ddfRawGetObject.ts --mls=12345678

    ┌────────────┬────────────────────────────┐
  │ 时间 (EST) │          workflow          │
  ├────────────┼────────────────────────────┤
  │ 3:00       │ ddf-sync（全量同步）       │
  ├────────────┼────────────────────────────┤
  │ 4:00       │ geocode-listings（补坐标） │
  ├────────────┼────────────────────────────┤
  │ 5:00       │ image-backfill（补照片）   │
  └────────────┴────────────────────────────┘