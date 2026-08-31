# url-shortener — 短網址服務

一個基於 **NestJS** 建構的 URL Shortening Service（短網址服務），靈感來自 [roadmap.sh](https://roadmap.sh) 的 URL Shortening Service 專案。提供長網址縮短、短碼重定向與點擊統計等功能。

## 技術棧

| 類別              | 技術                               |
| ----------------- | ---------------------------------- |
| 框架              | [NestJS](https://nestjs.com/) 12   |
| 語言              | TypeScript 6                       |
| 資料庫            | PostgreSQL（預計搭配 Docker 運行） |
| ORM               | Prisma（規劃中）                   |
| 靜態檢查 / 格式化 | oxlint + Prettier                  |
| 測試              | Jest + Supertest                   |

## 核心功能（規劃中）

- **短網址生成** — `POST /api/shorten`：提交長網址，產生唯一短碼並儲存。
- **短網址重定向** — `GET /:shortCode`：依短碼查詢並重定向至原始網址。
- **點擊統計** — `GET /api/urls/:shortCode/stats`：回傳建立時間、原始網址與點擊次數。
- **請求限流** — 防止 API 被惡意大量請求癱瘓。

## 開發 Roadmap

專案以 Git Flow 精神拆解為 7 個核心功能分支，依序開發：

1. `feature/init-setup` — **專案初始化與基礎環境**（✅ 目前進度）
   - NestJS 初始化、Linter & Formatter 設定、Docker 環境配置
2. `feature/prisma-database` — **資料庫架構與 Prisma 整合**
   - Prisma 安裝與初始化、定義 `Url` 模型、建立遷移檔、`PrismaModule` / `PrismaService`
3. `feature/url-shortening` — **核心功能：短網址生成 API**
   - `POST /api/shorten`、URL 輸入驗證、短碼生成演算法、資料庫儲存
4. `feature/redirection` — **核心功能：短網址重定向**
   - `GET /:shortCode`、HTTP 301/302 重定向、404 錯誤處理
5. `feature/analytics` — **進階功能：點擊統計**
   - 點擊計數器 +1、`GET /api/urls/:shortCode/stats`
6. `feature/rate-limiting` — **安全防護：請求限流**
   - 整合 `@nestjs/throttler`、限制 `POST /api/shorten` 請求頻率
7. `feature/dockerize-app` — **應用程式容器化**
   - Multi-stage builds 的 Dockerfile、Docker Compose 串聯 App 與 PostgreSQL

## 專案結構

```
完成後待補
```

## 開始使用

```bash
# 安裝依賴
npm install

# 啟動開發模式（Watch 模式）
npm run start:dev

# 建立正式環境的 build
npm run build

# 執行正式環境
npm run start:prod
```

### 其他常用指令

```bash
npm run lint          # 執行靜態檢查（oxlint）
npm run format        # 格式化程式碼（Prettier）
npm run test          # 執行單元測試（Jest）
npm run test:e2e      # 執行端對端測試
```

## License

[MIT License](./LICENSE)
