# NTUEE Course

臺大電機系預選網站（<https://course.ntuee.org/>）：十選二實驗、數電實驗分組、一般課程預選、分發與通知信。

## Production

使用 `2024-fall` branch，以根目錄的 `docker-compose.yml` 部署（各服務的 Dockerfile 位於 `prod-support/`）。

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

更新：

```bash
git pull --ff-only origin 2024-fall
docker compose up -d --build
docker compose ps
```

部署後確認 <https://course.ntuee.org/> 可正常開啟並登入。停止服務：

```bash
docker compose down
```

自舊目錄切換、資料庫備份與還原：見 [docs/production.md](docs/production.md)。

## Development

本機預覽完整網站（<http://localhost:8080>，使用獨立的本機資料）：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

以原始碼開發：

```bash
docker compose -f docker-compose_dev.yml up -d   # MongoDB 與 Redis
cp .env.defaults .env
pnpm install
pnpm database reset   # 匯入範例資料
pnpm dev-server       # backend，http://localhost:8000（swagger）
pnpm start            # frontend，http://localhost:3000
```

分發程式另見 [distribute-server/README.md](distribute-server/README.md)。

## Contributors

前端：[朱哲廣](https://github.com/Kenchu123)，`b07901016@ntu.edu.tw`

後端：

- [劉奇聖](https://github.com/MortalHappiness)，`b07901069@ntu.edu.tw`
- [賴群貿](https://github.com/Mecoli1219)，`b09901186@ntu.edu.tw`
