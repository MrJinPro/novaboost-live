# Live Tracking: current status

## Что сделано сейчас

Сейчас live-метрики в проекте собираются в два слоя:

1. Polling snapshot layer
   - backend по расписанию опрашивает TikTok через `tiktok-live-connector`
   - для каждого стримера получает snapshot: `isLive`, `viewerCount`, `likeCount`, `followersCount`
   - snapshot сохраняется в live storage и обновляет текущую live session

2. Live event bridge layer
   - когда backend видит, что стример в эфире, он поднимает `TikTokLiveConnection`
   - bridge слушает события `CHAT`, `LIKE`, `GIFT`, `ROOM_USER`, `MEMBER`, `STREAM_END`
   - эти события должны обновлять:
     - `message_count`
     - `gift_count`
     - `like_count`
     - `current_viewer_count`
     - `peak_viewer_count`

Frontend сейчас уже умеет:

- брать live details со страницы стримера
- опрашивать их каждые 5 секунд
- подставлять `trackingDetails.state.viewer_count` и данные последней live session
- показывать лайв-метрики в реальном времени, если backend их реально сохраняет

## Что уже исправлено

За последние правки уже сделано:

- исправлен backend storage для режима postgres, чтобы tracked streamers читались корректно
- добавлен polling public streamer page каждые 5 секунд
- исправлен native backend fallback для мобильного приложения на `https://live.novaboost.cloud`
- в live event bridge добавлен initial room info sync при connect
- в live event bridge добавлены transport/websocket diagnostic logs

Последний commit по этой части:

- `1828db5` - Seed live session metrics from bridge connect

## Что подтверждено на проде

Проверено вручную:

- `https://live.novaboost.cloud/tracking/status`
  - сервис активен
  - scheduler работает
  - source = `tiktok-live-connector`

- в публичном каталоге реальный username стримера:
  - `novaboost.app`
  - а не `novaboostapp`

- реальный production streamer id:
  - `c9fb66e0-29b8-474b-a656-cef320a80122`

- `https://live.novaboost.cloud/tracking/stream/c9fb66e0-29b8-474b-a656-cef320a80122`
  уже возвращал:
  - `state`
  - `latestSession`
  - `recentEvents`

Это значит, что на проде tracking не мёртвый. Он реально создаёт session и пишет события.

## Где именно проблема сейчас

Основная проблема не в frontend и уже не в домене мобильного приложения.

Проблема сейчас выглядит так:

- backend видит факт эфира
- backend иногда создаёт/закрывает session
- но реальные live-метрики часто остаются нулевыми
- чат / подарки / лайки / viewer updates приходят не так, как мы ожидаем, либо не приходят вообще

Симптомы:

- `peak_viewer_count = 0`
- `current_viewer_count = 0`
- `like_count = 0`
- `gift_count = 0`
- `message_count = 0`

при том, что сама session уже существует.

## Моё текущее мнение, почему это не получается

Сейчас моя основная гипотеза такая:

1. `tiktok-live-connector` на production поднимает соединение не в том режиме, в котором TikTok реально отдаёт богатые live events.
2. Polling/snapshot path даёт только факт `isLive`, но не всегда отдаёт нормальные room stats.
3. WebSocket/event bridge либо:
   - не получает события вообще,
   - получает только часть служебных событий,
   - либо TikTok не отдаёт их без дополнительных cookie/session/sign условий.

Если коротко: эфир видим, а полноценный telemetry stream от TikTok не получаем.

## Почему я так думаю

Потому что уже подтверждены такие факты:

- backend активен и scheduler работает
- запись стримера в production есть
- live session создаётся
- `recentEvents` есть
- но полезные counters остаются нулевыми

Это обычно означает не проблему рендера, а проблему качества входящих данных от источника.

То есть узкое место сейчас, скорее всего, одно из этих:

1. TikTok websocket / request polling не отдаёт нужные сообщения на проде
2. для production окружения не хватает cookie/session/sign параметров
3. библиотека `tiktok-live-connector` в текущем режиме умеет определить только `isLive`, но не вытаскивает нужную статистику по конкретному эфиру
4. TikTok меняет формат room info / webcast payload, а наши extraction paths уже неполные

## Что уже сделано как временное улучшение

Чтобы не ждать полноценного решения, уже добавлено:

- initial sync метрик из `roomInfo` сразу после connect в live bridge
- дополнительные диагностические логи по transport/websocket state

Это нужно для двух целей:

1. Если TikTok всё-таки отдаёт room stats на connect, мы сразу увидим хотя бы viewer/like counters
2. Если websocket реально не поднимается или сразу отваливается, это будет видно в логах, а не только по нулевым счётчикам

## Что проверить дальше

Следующий полезный шаг после деплоя backend:

1. Проверить server logs по сообщениям:
   - `Live event bridge connected`
   - `Live event bridge transport connected`
   - `Live event bridge websocket connected`
   - `Live event bridge transport disconnected`
   - `Live event bridge transport error`

2. Повторно открыть:
   - `/tracking/stream/c9fb66e0-29b8-474b-a656-cef320a80122`

3. Посмотреть, меняются ли:
   - `current_viewer_count`
   - `peak_viewer_count`
   - `like_count`
   - `gift_count`
   - `message_count`

4. Если снова нули, проверить production env переменные для TikTok:
   - `TIKTOK_SIGN_API_KEY`
   - `TIKTOK_SESSION_ID`
   - `TIKTOK_TT_TARGET_IDC`
   - `TIKTOK_MS_TOKEN`
   - `TIKTOK_COOKIE_HEADER`

## Короткий вывод

Система сейчас уже настроена так, что frontend готов показывать live-метрики, backend умеет создавать tracking session, а мобильное приложение уже ходит в правильный backend.

Текущий блокер почти наверняка в том, что TikTok на production не отдаёт нам полноценный поток live telemetry: либо из-за режима подключения, либо из-за cookie/session/sign, либо из-за изменения формата ответа.

Если советоваться с кем-то ещё, то я бы формулировал вопрос так:

`Почему tiktok-live-connector в production подтверждает live session, но не даёт viewer/like/chat/gift counters и websocket events в достаточном виде для стабильного realtime tracking?`