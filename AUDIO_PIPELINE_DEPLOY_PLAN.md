# Ke hoach trien khai crawl audio YouTube -> R2 -> DB `truyenviethay_new`

## 1. Huong chot cho phase 1

Kien truc nen dung:

```text
Azure VPS: crawler + audio worker
DO production: MySQL + Redis + backend API truyenviethay_new
R2: luu file mp3 part
FE: goi API lay metadata, phat truc tiep tu CDN/R2
```

Khuyen nghi quan trong:

1. Khong chay `ffmpeg`/`yt-dlp` tren DO VPS production.
2. Azure VPS moi nen chay ca `crawler` va `worker` trong giai doan dau.
3. Redis co the dat tren DO, nhung phai tach prefix `audio:*`.
4. Metadata co the ghi truc tiep vao MySQL production, nhung bat buoc dung user DB rieng.
5. FE khong stream audio qua backend, chi doc metadata roi phat URL R2/CDN.

Ly do:

- Backend hien tai da tu khoi dong nhieu cron/worker trong [backend/index.js](C:/Users/Admin/Downloads/web/truyenviethay_new/backend/index.js).
- Redis da duoc dung cho cache/queue/presence trong [docker-compose.yml](C:/Users/Admin/Downloads/web/truyenviethay_new/docker-compose.yml).
- Insert truyen moi cua app hien tai co cac field toi thieu trong [backend/models/story.model.js](C:/Users/Admin/Downloads/web/truyenviethay_new/backend/models/story.model.js).

## 2. Pham vi phase 1

1. Crawl playlist cua `https://www.youtube.com/@shuhaige/playlists`.
2. Parse playlist title -> ten truyen, tac gia, slug.
3. Neu truyện da co trong `truyen_new` thi dung lai `truyen_id`.
4. Neu chua co thi insert truyen moi voi `source_type = 'partner'`.
5. Dedupe video theo `youtube_video_id`.
6. Download audio, convert MP3, chia part, upload R2.
7. Insert metadata vao MySQL production.
8. FE hien tab nghe audio va phat truc tiep.

## 3. Thiet ke DB

Sua `truyen_new`:

```sql
ALTER TABLE truyen_new
ADD COLUMN source_type ENUM('user','crawl','partner') DEFAULT 'user',
ADD COLUMN source_partner_id INT NULL,
ADD COLUMN has_audio TINYINT(1) DEFAULT 0,
ADD COLUMN audio_status ENUM('none','processing','ready','error') DEFAULT 'none';
```

Bang `partners`:

```sql
id, name, youtube_channel_id, youtube_url, avatar, contact_email, is_active, created_at, updated_at
```

Bang `videos`:

```sql
id, youtube_video_id UNIQUE, youtube_playlist_id, partner_id, truyen_id, title, raw_title,
video_index, duration_seconds, thumbnail, source_url, processed, process_status, error_message,
created_at, updated_at
```

Bang `audio_parts`:

```sql
id, video_id, truyen_id, partner_id, part_number, audio_url, r2_key,
duration_seconds, file_size_bytes, bitrate_kbps, created_at
```

Bang `user_audio_progress`:

```sql
user_id, truyen_id, last_part_id, last_position_seconds, updated_at
```

Bang review tay khi parse title loi:

```sql
audio_ingest_review_queue(id, partner_id, source_type, source_ref, raw_title,
parsed_title, parsed_author, suggested_slug, status, note, created_at)
```

## 4. Rule parse va matching

1. Luon luu `raw_title`.
2. Bo token rac: `[Dich AI]`, `[Full]`, `Audio`, `Tron Bo`.
3. Tach theo `|`.
4. Bo so dau dong dang `1 |`.
5. Tao slug bang chu thuong, bo dau, thay space thanh `-`.
6. Match theo thu tu:
   - `slug` exact
   - `ten_truyen` normalized exact
   - match gan dung
7. Neu do tu tin thap thi day vao `audio_ingest_review_queue`, khong tu tao truyen moi.

## 5. Queue va job

Redis prefix:

```text
audio:queue:discover
audio:queue:process
audio:queue:dead
audio:lock:video:{youtube_video_id}
```

Payload:

```json
{
  "type": "process_video",
  "partnerId": 1,
  "truyenId": 123,
  "youtubeVideoId": "abc123",
  "youtubePlaylistId": "PLxxx",
  "videoTitle": "1 | [Full, Dich AI] Khanh Du Nien | Mieu Ni | Chuong 1-78",
  "videoUrl": "https://www.youtube.com/watch?v=abc123"
}
```

Retry:

1. Retry 5 lan.
2. Backoff: `1m -> 5m -> 15m -> 30m -> 2h`.
3. Loi parse va duplicate thi khong retry.
4. Loi mang/R2/YouTube rate limit thi retry.
5. Qua 5 lan -> `dead queue`.

## 6. Flow xu ly

Crawler moi 10 phut:

1. Lay danh sach playlist.
2. Parse title -> slug.
3. Tim `truyen_id` trong `truyen_new`.
4. Neu chua co:
   - parser tu tin cao -> insert `truyen_new`
   - parser tu tin thap -> review queue
5. Lay danh sach video trong playlist.
6. Video moi:
   - check `videos.youtube_video_id`
   - insert `videos`
   - push job process

Worker:

1. Nhan job tu Redis.
2. Lock theo `youtube_video_id`.
3. `yt-dlp` tai audio.
4. `ffmpeg` convert MP3.
5. Chia nho moi 600 giay.
6. Upload tung file len R2.
7. Insert `audio_parts`.
8. Update `videos.process_status = done`.
9. Update `truyen_new.has_audio = 1`, `audio_status = 'ready'`.
10. Xoa file temp local.

Command tham khao:

```bash
yt-dlp -f ba -x --audio-format mp3 --audio-quality 0 "<youtube_url>"
ffmpeg -i input.mp3 -vn -ar 22050 -ac 1 -b:a 64k normalized.mp3
ffmpeg -i normalized.mp3 -f segment -segment_time 600 -reset_timestamps 1 part_%03d.mp3
```

## 7. Cach ghi DB production an toan

Nen tao user rieng:

```text
audio_ingest_user
```

Cap quyen:

1. `SELECT/INSERT/UPDATE` tren `partners`, `videos`, `audio_parts`, `user_audio_progress`, `audio_ingest_review_queue`.
2. `SELECT/UPDATE` tren `truyen_new`.
3. Neu can tao truyen moi thi cap them `INSERT` tren `truyen_new`.

Khong dung:

1. root MySQL
2. user backend full quyen
3. public DB cho moi IP

## 8. Tich hop backend va FE

API nen them:

1. `GET /api/audio/story/:truyenId`
2. `POST /api/audio/progress`
3. `GET /api/audio/continue/:truyenId`

FE flow:

1. Goi API story nhu cu.
2. Goi them API audio metadata.
3. Neu `has_audio = 1` thi hien player.
4. Player phat truc tiep `audio_url` tu R2/CDN.
5. Luu progress moi 15-30 giay.

## 9. Ke hoach trien khai tung buoc

Buoc 1. Chot ha tang

1. Xac nhan Azure VPS dung Linux.
2. Kiem tra `Standard B2ats v2` co phai ARM64 hay khong.
3. Neu la ARM64, cai dung ban `node`, `ffmpeg`, `yt-dlp` ARM64.
4. Mo outbound toi YouTube, R2, Redis, MySQL.

Buoc 2. Chuan bi DB

1. Them cot audio vao `truyen_new`.
2. Tao `partners`, `videos`, `audio_parts`, `user_audio_progress`.
3. Tao `audio_ingest_review_queue`.
4. Seed partner Shuhaige.
5. Tao MySQL user `audio_ingest_user`.

Buoc 3. Tao service moi trong repo nay

```text
/src/config
/src/crawler
/src/parser
/src/queue
/src/worker
/src/storage
/src/db
/src/utils
```

Process nen co:

1. `crawler.js`
2. `worker.js`
3. `backfill-playlists.js`
4. `retry-dead-jobs.js`

Buoc 4. Cai tren Azure

1. Cai Node 20.
2. Cai `ffmpeg`.
3. Cai `yt-dlp`.
4. Tao temp dir: `/var/app/crawl-audio-youtube/tmp`
5. Tao 2 service:
   - `audio-crawler.service`
   - `audio-worker.service`

Buoc 5. Env production

```env
NODE_ENV=production
TZ=Asia/Ho_Chi_Minh
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=audio_ingest_user
MYSQL_PASSWORD=
MYSQL_DATABASE=
REDIS_URL=redis://...
REDIS_PREFIX=audio
R2_ENDPOINT=
R2_REGION=auto
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=https://cdn-audio.example.com
YOUTUBE_CHANNEL_URL=https://www.youtube.com/@shuhaige/playlists
PARTNER_ID=1
AUDIO_TMP_DIR=/var/app/crawl-audio-youtube/tmp
SEGMENT_SECONDS=600
WORKER_CONCURRENCY=1
MAX_RETRY=5
```

Buoc 6. Tich hop backend production

1. Them route/controller/model audio.
2. Them auth cho progress endpoint.
3. Co the cache metadata audio bang Redis.

Buoc 7. Tich hop FE

1. Them block player audio.
2. Auto next part.
3. Luu progress dinh ky.

Buoc 8. Backfill va soft launch

1. Chay 1 video test.
2. Chay 1 playlist test.
3. Chay full partner.
4. Theo doi queue fail, Redis memory, CPU worker, disk temp.

## 10. Rui ro chinh

1. Sai slug, map sai truyen -> can review queue.
2. Worker anh huong production -> khong dat ffmpeg o DO production.
3. Redis chung bi day -> tach prefix, giam retention, tang bo nho hoac tach Redis.
4. Disk Azure day -> xoa temp ngay sau upload, co cleanup job.
5. YouTube rate limit -> crawl 10 phut, co jitter, retry backoff.

## 11. Checklist nghiem thu

1. Tao duoc partner Shuhaige.
2. Crawl ra dung playlist va video.
3. Khong insert duplicate `youtube_video_id`.
4. Audio upload du len R2.
5. `audio_url` public mo duoc.
6. `truyen_new.has_audio = 1`.
7. FE phat duoc tu part 1 sang part 2.
8. Worker restart khong tao duplicate.
9. Fail job retry duoc.

## 12. Thu tu nen lam ngay

1. Viet migration SQL.
2. Tao MySQL user rieng cho audio.
3. Tao service crawler/worker trong repo `crawl-audio-youtube`.
4. Test local 1 video.
5. Test Azure 1 video.
6. Them API audio vao backend production.
7. Them player vao FE.
8. Backfill full channel.
