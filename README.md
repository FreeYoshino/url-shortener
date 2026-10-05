# url-shortener — 短網址服務

一個基於 **NestJS** 建構的 URL Shortening Service（短網址服務），靈感來自 [roadmap.sh](https://roadmap.sh) 的 URL Shortening Service 專案。提供長網址縮短、短碼重定向與點擊統計等功能。

## 技術棧

| 類別              | 技術                             |
| ----------------- | -------------------------------- |
| 框架              | [NestJS](https://nestjs.com/) 12 |
| 語言              | TypeScript 6                     |
| 資料庫            | PostgreSQL 16                    |
| ORM               | Prisma 7                         |
| 容器化            | Docker + Docker Compose          |
| 靜態檢查 / 格式化 | oxlint + Prettier                |
| 測試              | Jest + Supertest                 |

## 核心功能（規劃中）

- **短網址生成** — `POST /api/urls`：提交長網址，產生唯一短碼並儲存。
- **短網址重定向** — `GET /:shortCode`：依短碼查詢並重定向至原始網址。
- **點擊統計** — `GET /api/urls/:shortCode/stats`：回傳建立時間、原始網址與點擊次數。
- **請求限流** — 防止 API 被惡意大量請求癱瘓。

## 開發 Roadmap

專案以 Git Flow 精神拆解為 7 個核心功能分支，依序開發：

1. `feature/init-setup` — **專案初始化與基礎環境**（✅）
   - NestJS 初始化、Linter & Formatter 設定、Docker 環境配置
2. `feature/prisma-database` — **資料庫架構與 Prisma 整合**（✅）
   - Prisma 安裝與初始化、定義 `Url` 模型、建立遷移檔、`PrismaModule` / `PrismaService`
3. `feature/url-shortening` — **核心功能：短網址生成 API**（✅）
   - `POST /api/urls`、URL 輸入驗證、短碼生成演算法、資料庫儲存
4. `feature/redirection` — **核心功能：短網址重定向**（✅）
   - `GET /:shortCode`、HTTP 301/302 重定向、404 錯誤處理
5. `feature/analytics` — **進階功能：點擊統計** （✅）
   - 點擊計數器 +1、`GET /api/urls/:shortCode/stats`
6. `feature/rate-limiting` — **安全防護：請求限流**
   - 整合 `@nestjs/throttler`、限制 `POST /api/urls` 請求頻率
7. `feature/dockerize-app` — **應用程式容器化**
   - Multi-stage builds 的 Dockerfile、Docker Compose 串聯 App 與 PostgreSQL

## 專案結構

```
完成後待補
```

## 開始使用

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數

複製範本，再依需求調整：

```bash
cp .env.example .env
```

`.env` 中有兩組設定，**必須指向同一個資料庫**：

- `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` / `DB_PORT` — 由 `docker-compose.yml` 讀取，用來建立容器內的資料庫。
- `DATABASE_URL` — 由應用程式與 Prisma CLI 讀取，用來連線。

> **注意**：Postgres 只在資料卷**第一次建立時**套用 `POSTGRES_*` 環境變數。之後修改 `.env` 的這些值不會生效，需先 `docker compose down -v` 刪除資料卷重建（**既有資料會一併清除**）。

### 3. 啟動資料庫（Docker）

```bash
# 啟動 PostgreSQL（背景執行）
docker compose up -d

# 確認容器狀態為 Up
docker compose ps

# 需要時查看資料庫日誌
docker compose logs -f postgres
```

### 4. 初始化 Prisma

Prisma 產生的 Client 位於 `src/generated/prisma`，該路徑列在 `.gitignore` 中，因此 clone 下來並不存在；。所以**首次取得專案、或 `schema.prisma` 有異動後**，都需手動執行：

```bash
# 依 schema 產生 Prisma Client（不需連線資料庫）
npx prisma generate

# 套用 prisma/migrations 中尚未執行的遷移
npx prisma migrate deploy

# 確認狀態，應顯示 Database schema is up to date!
npx prisma migrate status
```

> 服務啟動時**不會**自動執行遷移 —— `PrismaService` 只負責建立連線。忘記 `migrate deploy` 會在查詢時得到「資料表不存在」的錯誤。

### 5. 啟動服務

```bash
# 開發模式（Watch 模式）
npm run start:dev

# 建立正式環境的 build 並執行
npm run build
npm run start:prod
```

### 其他常用指令

```bash
npm run lint          # 執行靜態檢查（oxlint）
npm run format        # 格式化程式碼（Prettier）
npm run test          # 執行單元測試（Jest）
npm run test:e2e      # 執行端對端測試
```

## 指令速查

### Docker

| 指令                              | 說明                             |
| --------------------------------- | -------------------------------- |
| `docker compose up -d`            | 啟動 PostgreSQL（背景執行）      |
| `docker compose ps`               | 查看容器狀態與連接埠對應         |
| `docker compose logs -f postgres` | 持續輸出資料庫日誌               |
| `docker compose stop`             | 停止容器，保留容器與資料卷       |
| `docker compose down`             | 移除容器與網路，**保留**資料卷   |
| `docker compose down -v`          | 移除容器**與資料卷**（資料全毀） |

進入 psql 互動介面（容器名取自 `container_name`，帳號與庫名請依 `.env` 調整）：

```bash
docker exec -it url_shortener_postgres psql -U user -d url_shortener
```

### Prisma

Prisma CLI 透過 `prisma.config.ts` 載入 `.env`，因此不需額外指定連線字串。

| 指令                                   | 說明                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| `npx prisma generate`                  | 依 schema 產生 Prisma Client 至 `src/generated/prisma`          |
| `npx prisma migrate dev --name <名稱>` | 比對 schema 與資料庫，產生並套用遷移（開發用，會一併 generate） |
| `npx prisma migrate deploy`            | 套用既有遷移檔（CI / 正式環境用，**不會** generate）            |
| `npx prisma migrate status`            | 檢查是否有未套用的遷移                                          |
| `npx prisma migrate dev --create-only` | 只產生遷移檔、不套用，適合手寫 SQL                              |
| `npx prisma migrate reset`             | 清空資料庫並重新套用所有遷移（**資料全毀**）                    |
| `npx prisma studio`                    | 開啟瀏覽器 GUI 檢視與編輯資料                                   |
| `npx prisma format`                    | 格式化 `schema.prisma`                                          |

## License

[MIT License](./LICENSE)
