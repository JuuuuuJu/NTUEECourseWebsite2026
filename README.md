# NTUEECourse2021

2021 年新版臺大電機系預選網站 (https://course.ntuee.org/)

## Usage

<div align="center">
<img src="assets/instruction_take3.gif" width=800>
</div>

## Contributors

前端：[朱哲廣](https://github.com/Kenchu123),
email: `b07901016@ntu.edu.tw`

後端：
- [劉奇聖](https://github.com/MortalHappiness), email: `b07901069@ntu.edu.tw`
- [賴群貿](https://github.com/Mecoli1219), email: `b09901186@ntu.edu.tw`

## Production

使用 `2024-fall` branch，以根目錄的 `docker-compose.yml` 部署（Service ID `course`）。

首次部署：

```bash
git clone --branch 2024-fall https://github.com/JuuuuuJu/NTUEECourseWebsite2026.git ~/productions/course
cd ~/productions/course
cp .env.example .env
vim .env
docker compose config
docker compose up -d --build
docker compose ps
```

更新（先備份 MongoDB 至 `../NTUEECourseWebsite2026-deploy-backups/`，再 pull、重建並檢查）：

```bash
./deploy.sh
```

或手動：

```bash
git pull --ff-only origin 2024-fall
docker compose up -d --build
docker compose ps
```

部署後確認 `https://course.ntuee.org/` 可正常登入。停止服務：

```bash
docker compose down
```

> 請勿加上 `--volumes`／`-v`，否則會刪除資料庫 volume。

從備份還原 MongoDB：

```bash
docker compose exec -T course-mongodb sh -c 'mongorestore -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < ../NTUEECourseWebsite2026-deploy-backups/<備份檔>.archive.gz
```

### 本機預覽

```bash
cp .env.example .env   # 填入本機測試用的值
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

網站位於 <http://localhost:8080>，使用獨立的本機 volume，不會碰到正式資料。

### Staging（獨立測試機）

```bash
cp .env.staging.example .env.staging
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

## Quick Start (Development mode)

### Start dataset
```shell
$ docker-compose -f docker-compose_dev.yml up -d
```
Check whether ```mongodb``` and ```redisdb``` are running
```shell
$ docker ps
```

### Base setup
```shell
$ cp .env.defaults .env                                  # Run one time
$ pnpm database reset                                    # Database reset, run whenever you want
$ pnpm install
```

### Start distribute server (OPTIONAL: If you want to test distribute)
Checkout ```distribute-server/README.md```

### Start backend first
```shell
$ pnpm dev-server           # This will run a develop server
```
Goto `http://localhost:8000` to see the swagger.

### Start frontend first
```bash
$ pnpm start
```
Goto `http://localhost:3000` to see the website.
