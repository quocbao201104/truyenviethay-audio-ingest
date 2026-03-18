const db = require("../config/db");
const { env } = require("../config/env");

const ACTIVE_STORY_CLAUSE = "(is_deleted = 0 OR is_deleted IS NULL)";

const findStoryBySlug = async (slug) => {
  const [rows] = await db.query(
    `SELECT id, ten_truyen, slug, tac_gia
     FROM truyen_new
     WHERE slug = ?
       AND ${ACTIVE_STORY_CLAUSE}
     LIMIT 1`,
    [slug]
  );

  return rows[0] || null;
};

const findStoryByTitle = async (title) => {
  const [rows] = await db.query(
    `SELECT id, ten_truyen, slug, tac_gia
     FROM truyen_new
     WHERE ten_truyen = ?
       AND ${ACTIVE_STORY_CLAUSE}
     LIMIT 1`,
    [title]
  );

  return rows[0] || null;
};

const createPartnerStory = async ({ title, slug, author, sourceUrl, coverUrl }) => {
  if (env.dryRun) {
    return {
      id: 0,
      ten_truyen: title,
      slug,
      tac_gia: author,
      _previewOnly: true,
      _sourceUrl: sourceUrl || null,
      _coverUrl: coverUrl || null,
    };
  }

  if (!env.enableStoryCreate) {
    throw new Error(
      `Story "${title}" was not found and ENABLE_STORY_CREATE=0, so auto-create is blocked`
    );
  }

  const now = new Date();
  const [result] = await db.query(
    `INSERT INTO truyen_new (
      ten_truyen, slug, tac_gia, mo_ta, trang_thai, link_nguon, age_rating,
      thoi_gian_tao, thoi_gian_cap_nhat, anh_bia, trang_thai_kiem_duyet,
      user_id, ghi_chu_admin, source_type, source_partner_id, has_audio, audio_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      slug,
      author || "Unknown",
      `Auto-created from partner audio ingest (${env.partnerName})`,
      "dang_ra",
      sourceUrl || null,
      1,
      now,
      now,
      null,
      "duyet",
      env.systemUserId,
      "Auto-created by crawl-audio-youtube",
      "partner",
      env.partnerId,
      0,
      "none",
    ]
  );

  return {
    id: result.insertId,
    ten_truyen: title,
    slug,
    tac_gia: author,
  };
};

const markStoryAudioReady = async (truyenId) => {
  if (env.dryRun) {
    return;
  }

  await db.query(
    `UPDATE truyen_new
     SET has_audio = 1,
         audio_status = 'ready',
         source_type = 'partner',
         source_partner_id = ?,
         thoi_gian_cap_nhat = NOW()
     WHERE id = ?`,
    [env.partnerId, truyenId]
  );
};

module.exports = {
  findStoryBySlug,
  findStoryByTitle,
  createPartnerStory,
  markStoryAudioReady,
};
