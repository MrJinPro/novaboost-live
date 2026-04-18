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

## HTTP endpoints

- `GET /health`
- `GET /manifest`
- `GET /tracking/status`
- `GET /notifications/stream/:streamerId/preview?trigger=live_started|boost_needed|post_published`

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