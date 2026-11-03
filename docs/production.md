# Production 維運

## 自舊目錄切換至 `~/productions/course`（一次性）

舊版部署在 `~/productions/NTUEECourseWebsite2026`。資料庫 volume（`ntueecoursewebsite2026_course-mongo-data`）
會被新版 `docker-compose.yml` 直接沿用，不需搬移資料。

```bash
cd ~/productions/NTUEECourseWebsite2026
docker compose -p ntueecoursewebsite2026 down   # 若舊容器仍在執行；不要加 -v
git clone --branch 2024-fall https://github.com/JuuuuuJu/NTUEECourseWebsite2026.git ~/productions/course
cp ~/productions/NTUEECourseWebsite2026/.env ~/productions/course/.env
cd ~/productions/course
vim .env   # 對照 .env.example 補上缺少的變數
docker compose config
docker compose up -d --build
docker compose ps
```

`.env` 的 `MONGO_USERNAME`／`MONGO_PASSWORD` 必須與既有資料庫相同。

## 備份後更新

`deploy.sh` 會先將 MongoDB 備份至 `../NTUEECourseWebsite2026-deploy-backups/`，再 pull、重建並檢查網站：

```bash
./deploy.sh
```

網站的 Maintenance 頁面也可建立與下載備份。

## 從備份還原

```bash
docker compose exec -T course-mongodb sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < ../NTUEECourseWebsite2026-deploy-backups/<備份檔>.archive.gz
```

> 任何 `docker compose down` 都不要加 `-v`／`--volumes`，否則會刪除資料庫 volume。

## Staging（獨立測試機，非資訊部伺服器）

```bash
cp .env.staging.example .env.staging
vim .env.staging
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
```
