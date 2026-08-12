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

## 部署

### Production

第一次從 2021 版切換至 2026 版：

```shell
cp ../NTUEECourseWebsite2021/.env .env
# 確認 .env，特別是 EMAIL_CREDENTIAL_KEY、WEBSITE_URL、CONTACT_EMAIL
./deploy_production.sh --check
./deploy_production.sh
```

之後更新版本：

```shell
git pull --ff-only
./deploy.sh --production --check
./deploy.sh --production
```

部署時會自動備份 MongoDB，並詢問要沿用目前資料或恢復 `.gz` 備份。備份位於 repo 同層的 `NTUEECourseWebsite2026-deploy-backups/`。

Production 服務位於 `http://127.0.0.1:3000`，正式網域需由主機 nginx 反向代理至此。

### Staging

```shell
cp .env.staging.example .env.staging  # 第一次執行時建立，並更換範例密碼
./deploy.sh --staging --check
./deploy.sh --staging
```

Staging 與 production 的容器及資料庫互相獨立，服務位於 `http://127.0.0.1:3001`。

### Rollback 至 2021 版

```shell
./deploy_old.sh --check
./deploy_old.sh
```

> 請勿執行 `docker compose down --volumes` 或 `docker-compose down -v`，否則會刪除資料庫 volume。

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
