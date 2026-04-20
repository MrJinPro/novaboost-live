# Real-time TikTok Live Tracking System

## Цель

Построить устойчивую систему real-time tracking для TikTok LIVE, которая:

- определяет старт эфира
- подключается к live-событиям
- обновляет viewer count в реальном времени
- считает лайки, сообщения и подарки
- эвристически отслеживает активность зрителей
- сохраняет все события по каждому стримеру отдельно
- автоматически начисляет очки пользователям без ручных действий

## Архитектурные слои

Система должна быть разделена на независимые слои:

1. Stream Detection
2. Live Ingestion
3. Event Queue
4. Event Processing
5. Realtime State Storage
6. Durable Storage
7. Gamification Engine

Слои не должны быть склеены в один сервисный поток `WebSocket -> сразу запись в БД -> сразу начисление наград`.

## 1. Stream Detection Layer

### Назначение

Определять момент старта эфира и инициировать ingest pipeline.

### Требования

- polling каждые 5 секунд
- источник: TikTok public endpoint или эквивалентный snapshot source
- detection layer не занимается начислением наград
- detection layer не пишет события чата напрямую в БД

### Логика

```ts
if (isLive && noActiveSession) {
  createStreamSession(streamerId)
  startLiveConnection(streamerId)
}

if (!isLive && hasActiveSession) {
  markStreamEnded(streamerId)
  stopLiveConnection(streamerId)
}
```

### Результат слоя

- создаётся stream session
- ingestion worker получает команду на подключение
- realtime state и processor знают актуальный `stream_id`

## 2. Live Ingestion Layer

### Назначение

Поднять устойчивое live-подключение к TikTok и получать все доступные события.

### Библиотека

- `tiktok-live-connector`

### Критические требования

- подключение должно использовать cookies через `TIKTOK_COOKIE_HEADER`
- нужен reconnect при disconnect/error/idle timeout
- нужно сохранять raw payload для диагностики изменений формата TikTok

### Подключение

Для текущего проекта допустимо использовать актуальный API библиотеки, но с обязательной передачей cookie headers и session/cookie параметров.

Пример целевой конфигурации:

```ts
new WebcastPushConnection(username, {
  requestHeaders: {
    Cookie: process.env.TIKTOK_COOKIE_HEADER,
  },
})
```

Примечание для текущего кода:

- в репозитории уже используется `TikTokLiveConnection`
- если библиотека изменила API, используется её актуальный класс, но требования к cookies, reconnect и raw logging остаются обязательными

### Обязательные события

Нужно обрабатывать:

- `chat`
- `like`
- `gift`
- `member` если доступен
- `roomUser` если доступен
- `streamEnd`

### Raw logging

Обязательно логировать сырой поток:

```ts
connection.on('rawData', (data) => {
  logRawEvent(data)
})
```

Минимум, который должен логироваться:

- `streamer_id`
- `stream_id`
- `event_type`
- timestamp
- raw payload
- source metadata

### Reconnect logic

Обязательно:

- on disconnect -> reconnect
- on error -> reconnect
- no events > 30 sec -> reconnect

### Ограничения слоя

Ingestion layer не должен:

- писать напрямую в Postgres каждое событие
- сам начислять очки
- напрямую обслуживать frontend

## 3. Event Queue Layer

### Назначение

Развязать ingestion от записи в БД и бизнес-логики.

### Требования

Использовать очередь между ingestion и processor:

- Redis Streams как основной рекомендуемый вариант
- Kafka или RabbitMQ допустимы как альтернатива

### Схема

```text
TikTok WebSocket / request polling
-> Ingestion worker
-> Redis Stream
-> Processor worker
-> Redis + Postgres + Gamification
```

### Почему это обязательно

Если писать события напрямую в БД из websocket handler:

- система начнёт терять события под нагрузкой
- reconnect и spikes будут ломать latency
- gamification начнёт конкурировать за время обработки с ingestion

## 4. Event Processing Layer

### Назначение

Обработать событие из очереди и разнести результат по отдельным хранилищам.

### Обязанности

На каждое событие processor должен:

1. обновить realtime state в Redis
2. сохранить событие в Postgres
3. обновить user activity heuristic
4. передать нормализованное событие в gamification engine

### Пример

```ts
onEvent(event) {
  updateRealtimeState(event)
  saveToDatabase(event)
  updateUserActivity(event)
  emitToGamification(event)
}
```

### Нормализация

События должны быть приведены к единой схеме:

- `streamer_id`
- `stream_id`
- `event_type`
- `tiktok_username`
- `occurred_at`
- `payload`
- `raw_payload`

## 5. Realtime State Layer

### Назначение

Хранить текущую картину live-stream в Redis.

### Источник для frontend

Frontend должен читать live state только из Redis или из backend endpoint, который читает Redis.

Frontend не должен строить realtime UI по Postgres history.

### Redis key

```text
stream:{streamerId}
```

### Минимальная структура

```json
{
  "stream_id": "uuid",
  "is_live": true,
  "viewer_count": 0,
  "like_count": 0,
  "message_count": 0,
  "gift_count": 0,
  "last_update": "2026-04-20T00:00:00.000Z"
}
```

### Обновление

Redis state обновляется:

- при каждом live event
- при snapshot polling
- при reconnect
- при завершении эфира

## 6. Durable Storage Layer

### Основное правило

- Redis хранит realtime state
- Postgres хранит историю и аналитику

### Таблица streams

```sql
id
streamer_id
started_at
ended_at
status
source
```

### Таблица events

```sql
id
stream_id
streamer_id
event_type
tiktok_username
payload jsonb
raw_payload jsonb
created_at
```

### Таблица user_stream_activity

```sql
id
stream_id
streamer_id
tiktok_username
joined_at
last_seen_at
message_count
like_count
gift_count
```

### Требования к сохранению

- все события пишутся отдельно по каждому стримеру
- запись должна быть идемпотентной по event identity, если такая identity доступна
- raw payload должен сохраняться хотя бы для отладки и переобработки

## 7. User Activity Tracking

### Ограничение TikTok

TikTok не даёт надёжный полный список viewers и не даёт точный join/leave.

Поэтому tracking строится эвристически по событиям.

### Логика

Пользователь считается зашедшим:

```ts
on first event from user {
  if activity does not exist {
    create activity
    joined_at = now
  }
}
```

Пользователь считается активным:

```ts
on any event from user {
  update last_seen_at = now
}
```

Пользователь считается ушедшим:

```ts
if now - last_seen_at > 60 sec {
  consider user left
}
```

### Что считаем по пользователю

- first_seen / joined_at
- last_seen_at
- message_count
- like_count
- gift_count
- total_gift_value если доступно

## 8. Gamification Engine

### Принцип

Gamification должен быть отдельным модулем, который работает на нормализованных событиях после ingestion.

Его нельзя смешивать с websocket transport code.

### Примеры правил

1. Первое появление на стриме

```ts
if user detected first time and user exists in app {
  give points
}
```

2. Сообщения

```ts
if message_count >= 10 {
  give reward
}
```

3. Активность

```ts
increase score based on likes and gifts
```

### Требования

- не блокировать ingestion
- работать идемпотентно
- поддерживать повторную обработку событий

## 9. Ограничения TikTok, которые надо принять как данность

Система не должна рассчитывать на:

- полный список всех зрителей
- точный join/leave
- точное время просмотра

Система должна строиться на:

- live events
- snapshots
- heuristic activity tracking

## 10. Критические must-have требования

### Обязательно

- `TIKTOK_COOKIE_HEADER`
- стабильный websocket или его эквивалентный live transport
- reconnect logic
- очередь между ingestion и processing
- Redis как realtime state storage
- разделение detection / ingestion / processing / gamification

### Fail condition

Система считается архитектурно неправильной, если:

- события пишутся напрямую в БД из websocket handler
- нет cookies для live connection
- нет reconnect logic
- frontend читает realtime state из исторической таблицы вместо Redis

## 11. Масштабирование

Система должна поддерживать:

- до 1000 стримеров одновременно
- тысячи событий в секунду

### Для этого нужны

- горизонтальное масштабирование ingestion workers
- отдельные processor workers
- Redis Streams
- Redis state cache
- backpressure и retry policy

## 12. Definition of Done

Система считается готовой, если одновременно выполняются все условия:

1. При старте эфира создаётся session
2. Frontend видит `LIVE`
3. `viewer_count` обновляется в реальном времени
4. лайки, сообщения и подарки считаются
5. пользователь определяется по `tiktok_username`
6. очки начисляются автоматически
7. все события сохраняются в БД
8. система не падает при нагрузке

## 13. Дополнительно

Если останется время:

- ClickHouse для аналитики
- retention analysis
- AI recommendations

## 14. Gap analysis относительно текущей реализации

### Что уже есть

- detection layer в базовом виде уже есть
- live ingestion в базовом виде уже есть через `tiktok-live-connector`
- backend уже создаёт live session
- backend уже сохраняет часть session state и recent events
- frontend уже умеет polling live details

### Чего не хватает до целевой архитектуры

1. Нет полноценной очереди между ingestion и processing
2. Нет Redis-only realtime layer как единственного источника для frontend
3. Ingestion, processing и gamification пока ещё слишком тесно связаны
4. Нет полноценной стратегии reconnect по idle timeout > 30s
5. Нет гарантированного raw event capture pipeline для последующей переобработки
6. Нет полноценного масштабирующегося контура под 1000 стримеров одновременно

## 15. Моё текущее мнение по проблеме проекта

Сейчас главная практическая проблема не в UI и не в том, что backend вообще не работает.

Проблема в том, что текущий live ingestion получает недостаточно богатый поток данных от TikTok:

- факт эфира видим
- session часто создаётся
- но viewer / like / chat / gift counters остаются нулевыми или неполными

Моя рабочая гипотеза:

1. без корректных cookies/session/sign параметров TikTok отдаёт только урезанный live state
2. текущий transport режим библиотеки не всегда даёт стабильные websocket events на production
3. даже когда connection поднимается, полезные payload fields могут отличаться от ожидаемых extraction paths

Если это подтвердится, правильный путь не в бесконечном патчинге UI, а в перестройке backend на архитектуру из этого документа: detection -> ingestion -> queue -> processing -> redis -> postgres -> gamification.