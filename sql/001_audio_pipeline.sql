ALTER TABLE truyen_new
ADD COLUMN source_type ENUM('user','crawl','partner') DEFAULT 'user',
ADD COLUMN source_partner_id INT NULL,
ADD COLUMN has_audio TINYINT(1) DEFAULT 0,
ADD COLUMN audio_status ENUM('none','processing','ready','error') DEFAULT 'none';

CREATE TABLE IF NOT EXISTS partners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  youtube_channel_id VARCHAR(128) NOT NULL,
  youtube_url VARCHAR(500) NOT NULL,
  avatar VARCHAR(500) NULL,
  contact_email VARCHAR(255) NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_partner_channel_id (youtube_channel_id)
);

CREATE TABLE IF NOT EXISTS videos (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  youtube_video_id VARCHAR(32) NOT NULL,
  youtube_playlist_id VARCHAR(64) NULL,
  partner_id INT NOT NULL,
  truyen_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NULL,
  video_index INT NULL,
  duration_seconds INT NULL,
  thumbnail VARCHAR(500) NULL,
  source_url VARCHAR(500) NOT NULL,
  raw_title VARCHAR(500) NULL,
  processed TINYINT(1) DEFAULT 0,
  process_status ENUM('queued','downloading','processing','uploaded','done','error') DEFAULT 'queued',
  error_message TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_youtube_video_id (youtube_video_id),
  KEY idx_videos_partner (partner_id),
  KEY idx_videos_truyen (truyen_id),
  KEY idx_videos_status (process_status)
);

CREATE TABLE IF NOT EXISTS audio_parts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  video_id BIGINT NOT NULL,
  truyen_id INT NOT NULL,
  partner_id INT NOT NULL,
  part_number INT NOT NULL,
  audio_url VARCHAR(700) NOT NULL,
  r2_key VARCHAR(700) NOT NULL,
  duration_seconds INT NULL,
  file_size_bytes BIGINT NULL,
  bitrate_kbps INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_video_part (video_id, part_number),
  KEY idx_audio_parts_truyen (truyen_id),
  KEY idx_audio_parts_partner (partner_id)
);

CREATE TABLE IF NOT EXISTS user_audio_progress (
  user_id INT NOT NULL,
  truyen_id INT NOT NULL,
  last_part_id BIGINT NOT NULL,
  last_position_seconds INT DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, truyen_id),
  KEY idx_audio_progress_part (last_part_id)
);

CREATE TABLE IF NOT EXISTS audio_ingest_review_queue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  partner_id INT NOT NULL,
  source_type ENUM('playlist','video') NOT NULL,
  source_ref VARCHAR(255) NOT NULL,
  raw_title VARCHAR(500) NOT NULL,
  parsed_title VARCHAR(255) NULL,
  parsed_author VARCHAR(255) NULL,
  suggested_slug VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  note VARCHAR(500) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
