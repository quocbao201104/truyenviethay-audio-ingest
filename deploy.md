# Deploy Azure VPS x64

Tai lieu nay dung cho Azure VPS `x64`, chay service truc tiep bang `systemd`, khong dung Docker tren VPS.

## 1. Muc tieu deploy

Chay 2 process rieng:

- `audio-crawler`: quet playlist YouTube dinh ky, them truyện/video vao DB va day job vao Redis
- `audio-worker`: lay job tu Redis, tai audio, cat part, upload R2, ghi metadata vao DB

Kien truc runtime:

```text
Azure VPS
├─ crawler service
├─ worker service
└─ tmp audio files

DO production
├─ MySQL
├─ Redis
└─ backend API

Cloudflare R2
└─ audio parts
```

## 2. Thu muc de xuat tren VPS

```text
/opt/crawl-audio-youtube
/var/app/crawl-audio-youtube/tmp
/var/log/crawl-audio-youtube
```

## 3. Cau hinh VPS ban dau

SSH vao VPS roi chay:

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
sudo apt-get update
sudo apt-get install -y curl git unzip ca-certificates ffmpeg python3 python3-venv python3-pip pipx build-essential
```

### Cai Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

### Cai `yt-dlp`

Cach de on dinh tren Ubuntu:

```bash
sudo pipx ensurepath
sudo pipx install yt-dlp
sudo ln -sf /root/.local/bin/yt-dlp /usr/local/bin/yt-dlp
yt-dlp --version
ffmpeg -version
ffprobe -version
```

Neu ban khong muon cai bang `pipx`, co the dung binary:

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version
```

## 4. Tao user va thu muc chay service

```bash
sudo useradd -r -s /bin/bash -m audioingest
sudo mkdir -p /opt/crawl-audio-youtube
sudo mkdir -p /var/app/crawl-audio-youtube/tmp
sudo mkdir -p /var/log/crawl-audio-youtube
sudo chown -R audioingest:audioingest /opt/crawl-audio-youtube
sudo chown -R audioingest:audioingest /var/app/crawl-audio-youtube
sudo chown -R audioingest:audioingest /var/log/crawl-audio-youtube
```

## 5. Dua code len VPS

### Cach 1: git clone

```bash
cd /opt
sudo -u audioingest git clone <YOUR_REPO_URL> crawl-audio-youtube
cd /opt/crawl-audio-youtube
sudo -u audioingest npm install
```

### Cach 2: rsync/scp tu may local

Neu ban upload source bang `scp`/`rsync`, xong roi chay:

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest npm install
```

## 6. Tao file env production

Copy file mau:

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest cp .env.azure.example .env
sudo -u audioingest nano .env
```

Noi dung de xuat:

```env
NODE_ENV=production
LOG_LEVEL=info
DRY_RUN=0

DB_HOST=YOUR_DO_DB_HOST
DB_PORT=3306
DB_USER=audio_ingest_user
DB_PASSWORD=CHANGE_ME
DB_NAME=truyenviethay_prod

REDIS_URL=redis://YOUR_DO_REDIS_HOST:6379/0
REDIS_PREFIX=audio:prod
REDIS_COMMAND_TIMEOUT_MS=0

R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_REGION=auto
R2_BUCKET=truyenviethay-audio
R2_ACCESS_KEY_ID=CHANGE_ME
R2_SECRET_ACCESS_KEY=CHANGE_ME
R2_PUBLIC_BASE_URL=https://audio.truyenviethay.id.vn
R2_KEY_PREFIX=audio

PARTNER_ID=1
PARTNER_NAME=shuhaige
YOUTUBE_SOURCE_URL=https://www.youtube.com/@shuhaige/playlists
PLAYLIST_LIMIT=0
SYSTEM_USER_ID=13
ENABLE_STORY_CREATE=1

CRAWLER_LOOP_ENABLED=1
CRAWLER_INTERVAL_SECONDS=900
CRAWLER_STARTUP_DELAY_SECONDS=5

YTDLP_BIN=/usr/local/bin/yt-dlp
YTDLP_JS_RUNTIMES=node
YTDLP_COOKIES_FILE=/opt/crawl-audio-youtube/secrets/youtube-cookies.txt
FFMPEG_BIN=/usr/bin/ffmpeg
FFPROBE_BIN=/usr/bin/ffprobe

AUDIO_TMP_DIR=/var/app/crawl-audio-youtube/tmp
SEGMENT_SECONDS=1800
WORKER_POLL_SECONDS=5
WORKER_CONCURRENCY=1
WORKER_MAX_RETRIES=5
JOB_LIMIT=0
DOWNLOAD_DELAY_MS=5000
R2_UPLOAD_CONCURRENCY=4
TMP_CLEANUP_MAX_AGE_HOURS=24
RECOVER_PROCESSING_ON_START=1
```

### Thu muc secrets cho cookie YouTube

```bash
sudo mkdir -p /opt/crawl-audio-youtube/secrets
sudo chown -R audioingest:audioingest /opt/crawl-audio-youtube/secrets
sudo chmod 700 /opt/crawl-audio-youtube/secrets
```

Dat file cookie tai:

```text
/opt/crawl-audio-youtube/secrets/youtube-cookies.txt
```

Ghi chu:

- worker hien tai can cookie YouTube de tranh loi `Sign in to confirm you're not a bot`
- file cookie can o dinh dang Netscape cookies.txt
- sau khi dat file cookie, dung:

```bash
sudo -u audioingest ls -l /opt/crawl-audio-youtube/secrets/youtube-cookies.txt
```

de dam bao user `audioingest` doc duoc

## 7. Migration DB

Truoc khi chay production, dam bao DB tren DO da co schema audio:

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest npm run migrate:audio
```

Neu DB production da co trigger/view dump cu va gap van de `DEFINER`, chay:

```bash
sudo -u audioingest npm run fix:local-definers
sudo -u audioingest npm run inspect:definers
```

Ghi chu:

- tren production moi, ban thuong chi can `migrate:audio`
- `fix:local-definers` chu yeu huu ich cho DB local dump tu Aiven

## 8. File `systemd`

### `/etc/systemd/system/audio-crawler.service`

```ini
[Unit]
Description=Audio Crawler Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=audioingest
Group=audioingest
WorkingDirectory=/opt/crawl-audio-youtube
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/npm run crawl:once
Restart=always
RestartSec=10
StandardOutput=append:/var/log/crawl-audio-youtube/crawler.log
StandardError=append:/var/log/crawl-audio-youtube/crawler.log

[Install]
WantedBy=multi-user.target
```

### `/etc/systemd/system/audio-worker.service`

```ini
[Unit]
Description=Audio Worker Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=audioingest
Group=audioingest
WorkingDirectory=/opt/crawl-audio-youtube
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=10
StandardOutput=append:/var/log/crawl-audio-youtube/worker.log
StandardError=append:/var/log/crawl-audio-youtube/worker.log

[Install]
WantedBy=multi-user.target
```

### Tao service files

```bash
sudo nano /etc/systemd/system/audio-crawler.service
sudo nano /etc/systemd/system/audio-worker.service
```

Paste noi dung tuong ung, roi chay:

```bash
sudo systemctl daemon-reload
sudo systemctl enable audio-crawler
sudo systemctl enable audio-worker
```

## 9. Chay thu batch dau tren Azure

Khuyen nghi batch dau rat nho de test:

Sua `.env` tam thoi:

```env
PLAYLIST_LIMIT=2
JOB_LIMIT=2
DOWNLOAD_DELAY_MS=5000
SEGMENT_SECONDS=1800
WORKER_CONCURRENCY=1
```

### Lam sach queue cu neu can

Kiem tra queue:

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest npm run queue:stats
```

Neu worker tung bi stop do dang, recover:

```bash
sudo -u audioingest npm run queue:recover
```

### Start tay de quan sat batch dau

Chay crawler tay:

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest npm run crawl:once
```

Kiem tra queue:

```bash
sudo -u audioingest npm run queue:stats
```

Chay worker tay:

```bash
sudo -u audioingest npm run worker
```

### Ky vong log

Crawler:

- `Crawler config: ...`
- `Starting discovery from ...`
- `Playlist processed: ...`
- `Discovery completed: ...`

Worker:

- `Worker config: ...`
- `Processing video ...`
- `starting download with yt-dlp`
- `download finished`
- `starting ffmpeg segmenting`
- `segmenting finished -> parts=N`
- `uploading part 1/N`
- `uploaded part 1/N`
- `completed successfully`

## 10. Checklist xac nhan batch dau

### DB

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest npm run db:check
```

Kiem tra:

- `truyen_new` co story partner moi
- `videos` co `process_status`
- `audio_parts` co du lieu sau khi worker chay xong

### Redis

```bash
sudo -u audioingest npm run queue:stats
```

Kiem tra:

- `processing` khong bi kẹt
- `dead` bang `0` hoac rat thap

### R2

Kiem tra bucket/prefix:

```text
audio/{partner_id}/{truyen_id}/{youtube_video_id}/part_001.mp3
```

Kiem tra:

- co file part duoc tao
- URL public mo duoc

### Tmp cleanup

Chay tay:

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest npm run cleanup:tmp
```

Neu muon dat cron moi ngay luc 3h sang:

```bash
sudo crontab -e -u audioingest
```

Them dong:

```cron
0 3 * * * cd /opt/crawl-audio-youtube && /usr/bin/npm run cleanup:tmp >> /var/log/crawl-audio-youtube/tmp-cleanup.log 2>&1
```

## 11. Bat `systemd` sau khi batch dau on

Khi batch dau da on, sua lai `.env`:

```env
PLAYLIST_LIMIT=0
JOB_LIMIT=0
DOWNLOAD_DELAY_MS=5000
```

Sau do start service:

```bash
sudo systemctl restart audio-crawler
sudo systemctl restart audio-worker
sudo systemctl status audio-crawler
sudo systemctl status audio-worker
```

Xem log live:

```bash
sudo journalctl -u audio-crawler -f
sudo journalctl -u audio-worker -f
```

Hoac xem file log:

```bash
tail -f /var/log/crawl-audio-youtube/crawler.log
tail -f /var/log/crawl-audio-youtube/worker.log
```

## 12. Lenh van hanh thuong dung

Restart:

```bash
sudo systemctl restart audio-crawler
sudo systemctl restart audio-worker
```

Stop:

```bash
sudo systemctl stop audio-crawler
sudo systemctl stop audio-worker
```

Status:

```bash
sudo systemctl status audio-crawler
sudo systemctl status audio-worker
```

Update code:

```bash
cd /opt/crawl-audio-youtube
sudo -u audioingest git pull
sudo -u audioingest npm install
sudo systemctl restart audio-crawler
sudo systemctl restart audio-worker
```

## 13. Khuyen nghi production

- Giu `WORKER_CONCURRENCY=1` o giai doan dau
- Giu `DOWNLOAD_DELAY_MS=5000`
- Giu `R2_UPLOAD_CONCURRENCY=4`
- Giu `SEGMENT_SECONDS=1800`
- Theo doi disk trong `/var/app/crawl-audio-youtube/tmp`
- Chi tang `WORKER_CONCURRENCY` sau khi da do CPU, RAM, network, R2 throughput
- Neu queue tang nhanh hon worker xu ly, khi do moi can nhac them 1 VPS worker rieng
