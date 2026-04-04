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

const buildYtDlpArgs = (args = []) => {
  const prefixArgs = [];

  if (env.ytDlpJsRuntimes) {
    prefixArgs.push("--js-runtimes", env.ytDlpJsRuntimes);
  }

  if (env.ytDlpCookiesFile) {
    prefixArgs.push("--cookies", env.ytDlpCookiesFile);
  }

  return [...prefixArgs, ...args];
};

const runYtDlpJson = async (args, options = {}) => {
  const { stdout } = await runCommand(env.ytDlpBin, buildYtDlpArgs(args), options);
  return parseJsonOutput(stdout);
};

const normalizeDescription = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || null;
};

const listChannelPlaylists = async (sourceUrl) => {
  const result = await runYtDlpJson(["--flat-playlist", "--dump-single-json", sourceUrl]);
  return (result.entries || []).map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url || `https://www.youtube.com/playlist?list=${entry.id}`,
    description: normalizeDescription(entry.description || entry.playlist_description || null),
  }));
};

const getPlaylistMetadata = async (playlistUrl) => {
  const result = await runYtDlpJson(["--flat-playlist", "--playlist-items", "1", "--dump-single-json", playlistUrl]);

  return {
    id: result.id || null,
    title: result.title || null,
    description: normalizeDescription(result.description || null),
  };
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
  await runCommand(
    env.ytDlpBin,
    buildYtDlpArgs(["-f", "ba", "-o", outputTemplate, videoUrl])
  );

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
  getPlaylistMetadata,
  listPlaylistVideos,
  downloadAudio,
  segmentAudio,
  probeDuration,
};
