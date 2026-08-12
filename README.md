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

## Production deployment

### Deploy

先確認 production 的 `.env` 已正確設定，再更新程式並執行部署：

```shell
$ git fetch
$ git pull --ff-only
$ ./deploy.sh --production
```

`deploy.sh` 會自動相容 `docker compose` 與舊版 `docker-compose`，依序備份目前非空的 MongoDB、停止舊容器、重建服務、恢復所選資料，最後檢查前端及 API。Docker named volume 會保留，不會因部署而清空。

部署前的 DB archive 固定存放於 repo 同層的 `NTUEECourseWebsite2026-deploy-backups/`。互動選單使用方向鍵選擇、Enter 確認，且只會列出此資料夾第一層的 `.gz`：

- `Keep existing Docker volume data`：沿用目前 DB，不從外部備份恢復。
- `*.gz`：直接恢復選定的 MongoDB archive。

請勿使用 `docker compose down --volumes` 或 `docker-compose down -v`，否則會刪除 DB volume。

只檢查設定而不變更 Docker：

```shell
$ ./deploy.sh --production --check
```

不重新 build image：

```shell
$ ./deploy.sh --production --no-build
```

Production compose 對外提供 `http://127.0.0.1:3000`；`https://course.ntuee.org` 仍須由真 server 外層 nginx 與 TLS 憑證反向代理至此服務。

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
