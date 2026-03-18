# crawl-audio-youtube

Repo nay la skeleton dau tien cho pipeline:

```text
yt-dlp -> Redis queue -> worker -> ffmpeg -> R2 -> MySQL
```

Rule nghiep vu da chot:

1. `1 playlist = 1 truyện`
2. Uu tien `playlist title` de map/tao truyện
3. Bo toan bo noi dung trong `[...]` khi parse
4. Format mong doi la `Ten truyện | Tác giả`
5. Khong ho tro private/unlisted trong phase dau
6. Truyện partner moi se gan `SYSTEM_USER_ID=13`
7. Khong dung thumbnail YouTube lam `anh_bia` tam

## Chay local bang Docker

1. Copy `.env.example` thanh `.env`
2. Sua `.env` cho dung DB/Redis/R2 local
3. Bao dam `truyenviethay_new` dang expose MySQL `3307` va Redis `6380`
   - Neu muon test nho, set `PLAYLIST_LIMIT=5`
4. Neu muon tao schema audio trong MySQL local:

```bash
docker compose run --rm crawler npm run migrate:audio
```

5. Neu DB local bi loi `DEFINER ('avnadmin'@'%') does not exist`, chay fix trigger local:

```bash
docker compose run --rm crawler npm run fix:local-definers
```

6. Neu van loi definer, inspect object trong DB:

```bash
docker compose run --rm crawler npm run inspect:definers
```

7. Chay crawler:

```bash
docker compose run --rm crawler
```

8. Chay worker:

```bash
docker compose up worker
```

   - Neu muon worker test nho, set `JOB_LIMIT=5`
   - Neu muon giam tan suat goi YouTube, set `DOWNLOAD_DELAY_MS=3000`

9. Kiem tra DB nhanh:

```bash
docker compose run --rm crawler npm run db:check
```

10. Xem queue hien tai:

```bash
docker compose run --rm crawler npm run queue:stats
```

11. Neu worker bi stop dot ngot va can dua job dang kẹt ve lai queue:

```bash
docker compose run --rm crawler npm run queue:recover
```

## Luu y

- Mac dinh `.env.example` dung `host.docker.internal` de container ket noi vao MySQL/Redis local cua `truyenviethay_new`
- `DRY_RUN=1` se bo qua phan ghi DB/R2, phu hop de test parser va luong crawl
- Neu muon auto tao truyen moi trong `truyen_new`, bat `ENABLE_STORY_CREATE=1`
- `PLAYLIST_LIMIT=0` nghia la crawl toan bo playlist; dat `5`, `10`... de test nho
- `JOB_LIMIT=0` nghia la worker xu ly het queue; dat `5`, `10`... de test nho
- `DOWNLOAD_DELAY_MS=0` nghia la khong nghi giua cac video; dat `3000`, `5000`... de giam toc do goi YouTube
- `RECOVER_PROCESSING_ON_START=1` se tu dong dua job dang kẹt o `processing` ve `queue` khi worker khoi dong
- Migration runner se tao bang `app_migrations` de tranh chay lai cung file `.sql`
## Cau hinh production cho Azure

File mau production nam o `.env.azure.example`

Gia tri production minh de xuat:

- `DRY_RUN=0`
- `ENABLE_STORY_CREATE=1`
- `PLAYLIST_LIMIT=0`
- `CRAWLER_LOOP_ENABLED=1`
- `CRAWLER_INTERVAL_SECONDS=900`
- `SEGMENT_SECONDS=1800`
- `WORKER_CONCURRENCY=1`
- `JOB_LIMIT=0`
- `DOWNLOAD_DELAY_MS=5000`

Y nghia:

- crawler chay lien tuc moi 15 phut
- worker chay lien tuc cho den khi het queue
- moi video nghi 5 giay truoc khi lay video tiep theo
- audio cat moi 30 phut de giam manh so object tren R2 va so dong trong `audio_parts`
