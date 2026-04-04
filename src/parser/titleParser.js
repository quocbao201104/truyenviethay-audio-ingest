const { normalizeText, toSlug } = require("../utils/slug");

const NOISE_PATTERNS = [/\[(.*?)\]/g, /\bfull\b/gi, /\bdich ai\b/gi, /\baudio\b/gi, /\btron bo\b/gi, /\bpodcast\b/gi];

const CHAPTER_PATTERNS = /\b(chuong|chapter|tap|phan|ep)\b/i;

const cleanupPart = (value) => {
  let output = String(value || "").trim();

  for (const pattern of NOISE_PATTERNS) {
    output = output.replace(pattern, " ");
  }

  output = output.replace(/^\d+\s*\|\s*/g, "");
  output = output.replace(/^[-|:]+|[-|:]+$/g, "");
  output = output.replace(/\s+/g, " ").trim();
  return output;
};

const pickAuthor = (parts) => {
  for (const part of parts) {
    if (!part || CHAPTER_PATTERNS.test(part)) {
      continue;
    }

    return part;
  }

  return null;
};

const parseStoryTitle = (rawTitle) => {
  const raw = String(rawTitle || "").trim();
  const splitParts = raw
    .split("|")
    .map(cleanupPart)
    .filter(Boolean);

  const firstPart = splitParts[0] || "";
  const storyTitle = cleanupPart(firstPart.replace(/^\d+\s*$/, "").trim());
  const author = pickAuthor(splitParts.slice(1));
  const slug = toSlug(storyTitle);
  const hasPipe = raw.includes("|");

  let confidence = 0.2;
  if (storyTitle) {
    confidence += 0.4;
  }
  if (author) {
    confidence += 0.2;
  }
  if (splitParts.length >= 2) {
    confidence += 0.1;
  }
  if (splitParts.length === 2 && storyTitle && author) {
    confidence += 0.1;
  }
  if (storyTitle && !CHAPTER_PATTERNS.test(storyTitle)) {
    confidence += 0.1;
  }

  if (storyTitle && !hasPipe) {
    confidence = Math.max(confidence, 0.8);
  }

  return {
    rawTitle: raw,
    cleanedTitle: splitParts.join(" | "),
    storyTitle,
    author,
    slug,
    confidence: Math.min(confidence, 1),
    needsManualReview: !storyTitle || (confidence < 0.75 && hasPipe),
    normalizedStoryTitle: normalizeText(storyTitle),
  };
};

module.exports = {
  cleanupPart,
  parseStoryTitle,
};
