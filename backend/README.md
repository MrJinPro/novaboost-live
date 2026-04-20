# NovaBoost Backend Foundation

Этот backend-контур выделен отдельно от frontend и служит базой для следующих сервисов:

- API service
- stream tracking manager
- scoring engine
- notification fan-out
- Telegram bot и moderation

## Что уже есть

- отдельный TypeScript entrypoint
- env-конфиг через zod
- health endpoint
- manifest endpoint
- WebSocket gateway для live-status snapshots
- tracking scheduler каждые 15-30 секунд
- модули tracking, scoring, notifications, Telegram

## Команды

```bash
npm run build:backend
npm run start:backend
```

## Hybrid PostgreSQL rollout

Если live-tracking и stream events нужно хранить не в Supabase, а в собственном PostgreSQL:

1. В backend env установить `LIVE_STORAGE_DRIVER=postgres`
2. Указать `POSTGRES_URL=...`
3. Оставить доступ к Supabase для чтения списка стримеров на переходном этапе: достаточно либо `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`, либо `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
4. После `git pull` на сервере вручную применить SQL-схему из [backend/sql/001_live_tracking_postgres.sql](sql/001_live_tracking_postgres.sql)

Пример применения:

```bash
psql "$POSTGRES_URL" -f backend/sql/001_live_tracking_postgres.sql
```

Runtime backend больше не создаёт PostgreSQL-таблицы автоматически. Если схема не применена, postgres live-storage будет падать на запросах к отсутствующим таблицам.

## HTTP endpoints

- `GET /health`
- `GET /manifest`
- `GET /tracking/status`
- `GET /tracking/live?username=...`
- `GET /tracking/stream/:streamerId`
- `GET /notifications/stream/:streamerId/preview?trigger=live_started|boost_needed|post_published`
- `GET /growth/tiktok/services`
- `POST /growth/orders`

## Supplier env

- `PRMOTION_API_URL=https://api.prmotion.me/v1`
- `PRMOTION_API_KEY=...`
- `PRMOTION_REQUEST_TIMEOUT_MS=10000`

NovaBoost backend сам фильтрует каталог поставщика и отдаёт только TikTok-услуги без coin/монетных сервисов.

## TikTok signing

Backend теперь поддерживает два signing provider режима:

- `TIKTOK_SIGN_PROVIDER=euler`
- `TIKTOK_SIGN_PROVIDER=custom-http`

Режим `auto` выбирает `custom-http`, если задан `TIKTOK_SIGN_FETCH_URL`, иначе использует Euler-совместимый путь.

Для собственного signer endpoint нужны env:

- `TIKTOK_SIGN_PROVIDER=custom-http`
- `TIKTOK_SIGN_FETCH_URL=https://your-signer.example.com/webcast/fetch`
- `TIKTOK_SIGN_FETCH_AUTH_TOKEN=...` (опционально)

Контракт запроса:

```json
{
	"roomId": "1234567890",
	"uniqueId": null,
	"sessionId": null,
	"ttTargetIdc": null,
	"useMobile": false
}
```

Контракт ответа:

- либо `application/octet-stream` с protobuf `ProtoMessageFetchResult`
- либо `application/json` со структурой `ProtoMessageFetchResult`

То есть ваш signer должен вернуть минимум поля, которые ждёт `tiktok-live-connector`:

- `wsUrl`
- `cursor`
- `internalExt`
- `wsParams`
- `messages`

Это позволяет вынести реальную подпись и антибот-логику в отдельный свой сервис без жёсткой привязки backend-а к Euler SDK.

## WebSocket

- `ws://localhost:4310/ws/tracking`

Сообщение подписки:

```json
{
	"type": "subscribe",
	"streamerIds": ["streamer-id-1", "streamer-id-2"]
}
```

## Следующие шаги

- подключить Supabase service-role client
- добавить Redis и job queue
- реализовать routing уведомлений по streamer subscriptions и telegram routes
- подключить tracking scheduler и stream workers
- реализовать moderation executor для Telegram bot