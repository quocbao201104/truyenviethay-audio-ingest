const db = require("../config/db");
const { env } = require("../config/env");

const findVideoByYoutubeId = async (youtubeVideoId) => {
  if (env.dryRun) {
    return null;
  }

  const [rows] = await db.query(
    `SELECT *
     FROM videos
     WHERE youtube_video_id = ?
     LIMIT 1`,
    [youtubeVideoId]
  );

  return rows[0] || null;
};

const upsertVideo = async (video) => {
  if (env.dryRun) {
    return {
      id: 0,
      youtube_video_id: video.youtubeVideoId,
      truyen_id: video.truyenId,
      partner_id: video.partnerId,
      title: video.title,
      raw_title: video.rawTitle,
      source_url: video.sourceUrl,
      processed: 0,
      process_status: "queued",
    };
  }

  await db.query(
    `INSERT INTO videos (
      youtube_video_id, youtube_playlist_id, partner_id, truyen_id, title, slug,
      video_index, duration_seconds, thumbnail, source_url, raw_title, processed, process_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      youtube_playlist_id = VALUES(youtube_playlist_id),
      partner_id = VALUES(partner_id),
      truyen_id = VALUES(truyen_id),
      title = VALUES(title),
      slug = VALUES(slug),
      video_index = VALUES(video_index),
      duration_seconds = VALUES(duration_seconds),
      thumbnail = VALUES(thumbnail),
      source_url = VALUES(source_url),
      raw_title = VALUES(raw_title),
      updated_at = NOW()`,
    [
      video.youtubeVideoId,
      video.youtubePlaylistId,
      video.partnerId,
      video.truyenId,
      video.title,
      video.slug || null,
      video.videoIndex || null,
      video.durationSeconds || null,
      video.thumbnail || null,
      video.sourceUrl,
      video.rawTitle || video.title,
      0,
      "queued",
    ]
  );

  return findVideoByYoutubeId(video.youtubeVideoId);
};

const updateVideoStatus = async (youtubeVideoId, status, errorMessage = null) => {
  if (env.dryRun) {
    return;
  }

  const isDone = status === "done" ? 1 : 0;
  await db.query(
    `UPDATE videos
     SET process_status = ?,
         processed = ?,
         error_message = ?,
         updated_at = NOW()
     WHERE youtube_video_id = ?`,
    [status, isDone, errorMessage, youtubeVideoId]
  );
};

const upsertAudioParts = async (parts) => {
  if (env.dryRun) {
    return;
  }

  if (!parts || parts.length === 0) {
    return;
  }

  const placeholders = parts.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const values = parts.flatMap((part) => [
    part.videoId,
    part.truyenId,
    part.partnerId,
    part.partNumber,
    part.audioUrl,
    part.r2Key,
    part.durationSeconds || null,
    part.fileSizeBytes || null,
    part.bitrateKbps || null,
  ]);

  await db.query(
    `INSERT INTO audio_parts (
      video_id, truyen_id, partner_id, part_number, audio_url, r2_key,
      duration_seconds, file_size_bytes, bitrate_kbps
    ) VALUES ${placeholders}
    ON DUPLICATE KEY UPDATE
      audio_url = VALUES(audio_url),
      r2_key = VALUES(r2_key),
      duration_seconds = VALUES(duration_seconds),
      file_size_bytes = VALUES(file_size_bytes),
      bitrate_kbps = VALUES(bitrate_kbps)`,
    values
  );
};

const enqueueReviewItem = async (item) => {
  if (env.dryRun) {
    return;
  }

  await db.query(
    `INSERT INTO audio_ingest_review_queue (
      partner_id, source_type, source_ref, raw_title, parsed_title,
      parsed_author, suggested_slug, status, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.partnerId,
      item.sourceType,
      item.sourceRef,
      item.rawTitle,
      item.parsedTitle || null,
      item.parsedAuthor || null,
      item.suggestedSlug || null,
      "pending",
      item.note || null,
    ]
  );
};

module.exports = {
  findVideoByYoutubeId,
  upsertVideo,
  updateVideoStatus,
  upsertAudioParts,
  enqueueReviewItem,
};
