const logger = require("../config/logger");
const { env } = require("../config/env");
const { parseStoryTitle } = require("../parser/titleParser");
const { RedisQueue } = require("../queue/redisQueue");
const {
  findStoryBySlug,
  findStoryByTitle,
  createPartnerStory,
} = require("../repositories/storyRepository");
const {
  findVideoByYoutubeId,
  upsertVideo,
  enqueueReviewItem,
} = require("../repositories/audioRepository");
const { listChannelPlaylists, listPlaylistVideos } = require("../youtube/ytDlpClient");

const processQueue = new RedisQueue("process");

const isAlreadyManaged = (video) =>
  !!video &&
  ["queued", "downloading", "processing", "uploaded", "done"].includes(video.process_status);

const resolveStory = async (playlist) => {
  const parsed = parseStoryTitle(playlist.title);

  if (parsed.needsManualReview) {
    await enqueueReviewItem({
      partnerId: env.partnerId,
      sourceType: "playlist",
      sourceRef: playlist.id,
      rawTitle: playlist.title,
      parsedTitle: parsed.storyTitle,
      parsedAuthor: parsed.author,
      suggestedSlug: parsed.slug,
      note: "Parser confidence is too low for auto-create",
    });
    logger.warn(`Skipped playlist "${playlist.title}" because it needs manual review`);
    return null;
  }

  let story = await findStoryBySlug(parsed.slug);
  if (!story) {
    story = await findStoryByTitle(parsed.storyTitle);
  }

  if (!story) {
    logger.info(`Story not found for playlist "${playlist.title}", creating a new partner story`);
    story = await createPartnerStory({
      title: parsed.storyTitle,
      slug: parsed.slug,
      author: parsed.author,
      sourceUrl: playlist.url,
      coverUrl: null,
    });

    if (story._previewOnly) {
      logger.info(
        `Dry-run preview: using temporary story "${story.ten_truyen}" with slug "${story.slug}" without writing to DB`
      );
    }
  }

  return {
    story,
    parsed,
  };
};

const enqueuePlaylistVideos = async (playlist, story) => {
  logger.info(`Fetching videos for playlist "${playlist.title}" (${playlist.url})`);
  const videos = await listPlaylistVideos(playlist.url);
  let enqueuedCount = 0;
  let skippedCount = 0;

  for (const video of videos) {
    const existingVideo = await findVideoByYoutubeId(video.id);
    if (isAlreadyManaged(existingVideo)) {
      skippedCount += 1;
      continue;
    }

    const persistedVideo = await upsertVideo({
      youtubeVideoId: video.id,
      youtubePlaylistId: video.playlistId,
      partnerId: env.partnerId,
      truyenId: story.id,
      title: video.title,
      rawTitle: video.title,
      slug: null,
      videoIndex: video.index,
      durationSeconds: video.durationSeconds,
      thumbnail: video.thumbnail,
      sourceUrl: video.url,
    });

    await processQueue.enqueue({
      type: "process_video",
      partnerId: env.partnerId,
      truyenId: story.id,
      youtubeVideoId: video.id,
      youtubePlaylistId: video.playlistId,
      videoTitle: video.title,
      videoUrl: video.url,
      videoIndex: video.index,
      videoDbId: persistedVideo?.id || 0,
      attempts: 0,
      retryable: true,
    });

    enqueuedCount += 1;
  }

  return {
    totalVideos: videos.length,
    enqueuedCount,
    skippedCount,
  };
};

const runDiscoveryOnce = async () => {
  logger.info(`Starting discovery from ${env.youtubeSourceUrl}`);
  const allPlaylists = await listChannelPlaylists(env.youtubeSourceUrl);
  const playlists =
    env.playlistLimit > 0 ? allPlaylists.slice(0, env.playlistLimit) : allPlaylists;

  if (env.playlistLimit > 0) {
    logger.info(
      `Playlist limit is enabled: processing ${playlists.length}/${allPlaylists.length} playlists`
    );
  }

  let totalPlaylists = 0;
  let totalVideos = 0;
  let totalEnqueued = 0;

  for (const playlist of playlists) {
    totalPlaylists += 1;
    const resolved = await resolveStory(playlist);
    if (!resolved) {
      continue;
    }

    const result = await enqueuePlaylistVideos(playlist, resolved.story);
    totalVideos += result.totalVideos;
    totalEnqueued += result.enqueuedCount;

    logger.info(
      `Playlist processed: "${playlist.title}" -> story ${resolved.story.id}, totalVideos=${result.totalVideos}, enqueued=${result.enqueuedCount}, skipped=${result.skippedCount}`
    );
  }

  return {
    totalPlaylists,
    totalVideos,
    totalEnqueued,
  };
};

module.exports = {
  runDiscoveryOnce,
};
