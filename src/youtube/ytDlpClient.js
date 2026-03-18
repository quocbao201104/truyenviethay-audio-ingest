const path = require("path");
const { env } = require("../config/env");
const { runCommand } = require("../utils/exec");
const { ensureDir, listFiles } = require("../utils/fs");

const parseJsonOutput = (stdout) => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed);
};

const runYtDlpJson = async (args, options = {}) => {
  const { stdout } = await runCommand(env.ytDlpBin, args, options);
  return parseJsonOutput(stdout);
};

const listChannelPlaylists = async (sourceUrl) => {
  const result = await runYtDlpJson(["--flat-playlist", "--dump-single-json", sourceUrl]);
  return (result.entries || []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url || `https://www.youtube.com/playlist?list=${entry.id}`,
  }));
};

const listPlaylistVideos = async (playlistUrl) => {
  const result = await runYtDlpJson(["--flat-playlist", "--dump-single-json", playlistUrl]);
  return (result.entries || []).map((entry, index) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
    playlistId: result.id,
    playlistTitle: result.title,
    index: index + 1,
    durationSeconds: entry.duration || null,
    thumbnail: entry.thumbnail || null,
  }));
};

const downloadAudio = async ({ videoUrl, videoId, outputDir }) => {
  await ensureDir(outputDir);

  const outputTemplate = path.join(outputDir, "%(id)s.%(ext)s");
  await runCommand(env.ytDlpBin, [
    "-f",
    "ba",
    "-o",
    outputTemplate,
    videoUrl,
  ]);

  const files = await listFiles(outputDir);
  const audioFile = files.find((file) => path.basename(file).startsWith(`${videoId}.`));

  if (!audioFile) {
    throw new Error(`Downloaded audio file not found for video ${videoId}`);
  }

  return audioFile;
};

const segmentAudio = async ({ inputPath, outputDir, segmentSeconds }) => {
  await ensureDir(outputDir);
  const outputPattern = path.join(outputDir, "part_%03d.mp3");

  await runCommand(env.ffmpegBin, [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ar",
    "22050",
    "-ac",
    "1",
    "-b:a",
    "64k",
    "-f",
    "segment",
    "-segment_time",
    String(segmentSeconds),
    "-reset_timestamps",
    "1",
    outputPattern,
  ]);

  const files = await listFiles(outputDir);
  return files
    .filter((file) => path.basename(file).startsWith("part_"))
    .sort((a, b) => a.localeCompare(b));
};

const probeDuration = async (filePath) => {
  const { stdout } = await runCommand(env.ffprobeBin, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  const parsed = Number.parseFloat(stdout.trim());
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

module.exports = {
  listChannelPlaylists,
  listPlaylistVideos,
  downloadAudio,
  segmentAudio,
  probeDuration,
};
