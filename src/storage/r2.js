const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { env, ensureEnv } = require("../config/env");

let client;

const getClient = () => {
  if (client) {
    return client;
  }

  ensureEnv(["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);

  client = new S3Client({
    region: env.r2Region,
    endpoint: env.r2Endpoint,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
    forcePathStyle: true,
    maxAttempts: 1,
  });

  return client;
};

const joinUrl = (baseUrl, key) =>
  `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;

const buildAudioKey = ({ partnerId, truyenId, youtubeVideoId, partFileName }) => {
  const prefix = env.r2KeyPrefix.replace(/^\/+|\/+$/g, "");
  return `${prefix}/${partnerId}/${truyenId}/${youtubeVideoId}/${partFileName}`;
};

const uploadAudioFile = async (params) => {
  const key = buildAudioKey(params);

  if (env.dryRun) {
    return {
      key,
      publicUrl: joinUrl(env.r2PublicBaseUrl || "https://example.invalid", key),
    };
  }

  const body = fs.createReadStream(params.filePath);
  const s3 = getClient();

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: key,
        Body: body,
        ContentType: "audio/mpeg",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  } finally {
    body.destroy();
  }

  return {
    key,
    publicUrl: joinUrl(env.r2PublicBaseUrl, key),
  };
};

module.exports = {
  uploadAudioFile,
  buildAudioKey,
};
