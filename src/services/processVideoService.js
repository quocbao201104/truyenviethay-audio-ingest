const fs = require("fs/promises");
const path = require("path");
const pLimit = require("p-limit");
const logger = require("../config/logger");
const { env } = require("../config/env");
const { ensureDir, removeDir } = require("../utils/fs");
const { uploadAudioFile } = require("../storage/r2");
const { downloadAudio, segmentAudio, probeDuration } = require("../youtube/ytDlpClient");
const {
  findVideoByYoutubeId,
  updateVideoStatus,
  upsertAudioParts,
} = require("../repositories/audioRepository");
const { markStoryAudioReady } = require("../repositories/storyRepository");

const buildWorkingDir = (youtubeVideoId) =>
  path.join(env.audioTmpDir, `${youtubeVideoId}-${Date.now()}`);

const processVideoJob = async (job) => {
  const startedAt = Date.now();
  const workingDir = buildWorkingDir(job.youtubeVideoId);
  const downloadDir = path.join(workingDir, "download");
  const segmentDir = path.join(workingDir, "segments");

  await ensureDir(downloadDir);
  await ensureDir(segmentDir);

  try {
    logger.info(
      `Processing video ${job.youtubeVideoId} (title="${job.videoTitle}", truyenId=${job.truyenId}, partnerId=${job.partnerId})`
    );
    await updateVideoStatus(job.youtubeVideoId, "downloading");

    const downloadStartedAt = Date.now();
    logger.info(`Video ${job.youtubeVideoId}: starting download with yt-dlp`);
    const sourceFile = await downloadAudio({
      videoUrl: job.videoUrl,
      videoId: job.youtubeVideoId,
      outputDir: downloadDir,
    });
    logger.info(
      `Video ${job.youtubeVideoId}: download finished in ${Date.now() - downloadStartedAt}ms -> ${sourceFile}`
    );

    await updateVideoStatus(job.youtubeVideoId, "processing");
    const segmentStartedAt = Date.now();
    logger.info(
      `Video ${job.youtubeVideoId}: starting ffmpeg segmenting with segmentSeconds=${env.segmentSeconds}`
    );
    const segmentFiles = await segmentAudio({
      inputPath: sourceFile,
      outputDir: segmentDir,
      segmentSeconds: env.segmentSeconds,
    });
    logger.info(
      `Video ${job.youtubeVideoId}: segmenting finished in ${Date.now() - segmentStartedAt}ms -> parts=${segmentFiles.length}`
    );

    const videoRecord = await findVideoByYoutubeId(job.youtubeVideoId);
    const uploadLimit = pLimit(Math.max(1, env.r2UploadConcurrency));
    const uploadTasks = segmentFiles.map((filePath, index) =>
      uploadLimit(async () => {
        const partNumber = index + 1;
        const fileName = path.basename(filePath);
        const stat = await fs.stat(filePath);
        const durationSeconds = await probeDuration(filePath);
        logger.info(
          `Video ${job.youtubeVideoId}: uploading part ${partNumber}/${segmentFiles.length} (${fileName}, size=${stat.size}, durationSeconds=${durationSeconds})`
        );
        const uploaded = await uploadAudioFile({
          partnerId: job.partnerId,
          truyenId: job.truyenId,
          youtubeVideoId: job.youtubeVideoId,
          partFileName: fileName,
          filePath,
        });
        logger.info(
          `Video ${job.youtubeVideoId}: uploaded part ${partNumber}/${segmentFiles.length} -> ${uploaded.key}`
        );

        return {
          videoId: videoRecord?.id || job.videoDbId || 0,
          truyenId: job.truyenId,
          partnerId: job.partnerId,
          partNumber,
          audioUrl: uploaded.publicUrl,
          r2Key: uploaded.key,
          durationSeconds,
          fileSizeBytes: stat.size,
          bitrateKbps: 64,
        };
      })
    );

    const uploadResults = await Promise.allSettled(uploadTasks);
    const uploadFailures = uploadResults.filter((result) => result.status === "rejected");

    if (uploadFailures.length > 0) {
      const firstError = uploadFailures[0].reason;
      logger.error(
        `Video ${job.youtubeVideoId}: upload phase failed with ${uploadFailures.length} error(s)`,
        firstError
      );
      throw firstError;
    }

    const uploadedParts = uploadResults.map((result) => result.value);
    logger.info(
      `Video ${job.youtubeVideoId}: upload phase completed -> uploadedParts=${uploadedParts.length}, concurrency=${env.r2UploadConcurrency}`
    );
    await upsertAudioParts(uploadedParts);
    logger.info(`Video ${job.youtubeVideoId}: bulk inserted ${uploadedParts.length} audio_parts rows`);

    await updateVideoStatus(job.youtubeVideoId, "done");
    await markStoryAudioReady(job.truyenId);
    logger.info(
      `Video ${job.youtubeVideoId}: completed successfully in ${Date.now() - startedAt}ms`
    );
  } catch (error) {
    await updateVideoStatus(job.youtubeVideoId, "error", error.message);
    logger.error(`Video ${job.youtubeVideoId}: failed after ${Date.now() - startedAt}ms`, error);
    throw error;
  } finally {
    logger.info(`Video ${job.youtubeVideoId}: cleaning up temp directory ${workingDir}`);
    await removeDir(workingDir);
  }
};

module.exports = {
  processVideoJob,
};
