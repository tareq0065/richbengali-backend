// src/utils/s3.js
import AWS from "aws-sdk";
import { randomUUID } from "crypto";
import path from "path";
import mime from "mime-types";

// --- Validate config early
function getS3Config() {
  const { S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, AWS_REGION, S3_ENDPOINT, S3_PUBLIC_URL } =
    process.env;

  if (!S3_BUCKET) {
    throw new Error("S3_BUCKET is not set. Please set it in your backend environment (.env).");
  }
  return {
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
    region: AWS_REGION || "us-east-1",
    endpoint: S3_ENDPOINT || null,
    publicBase: S3_PUBLIC_URL || null,
  };
}

const cfg = getS3Config();

const s3 = new AWS.S3({
  accessKeyId: cfg.accessKeyId,
  secretAccessKey: cfg.secretAccessKey,
  region: cfg.region,
  endpoint: cfg.endpoint || undefined,
  s3ForcePathStyle: !!cfg.endpoint, // needed for MinIO/Spaces style
  signatureVersion: "v4",
});

/**
 * Uploads a file to S3 and returns { url, key }.
 * Expects a multer file with buffer (memoryStorage).
 *
 * @param {Object} file - multer file { buffer, mimetype, originalname }
 * @param {Object} opts - { prefix?: string }
 */
export async function uploadToS3(file, opts = {}) {
  if (!file) throw new Error("No file provided to uploadToS3");
  const prefix = opts.prefix ?? "uploads/";
  const ext =
    mime.extension(file.mimetype) ||
    path.extname(file.originalname || "").replace(".", "") ||
    "bin";
  const key = `${prefix}${randomUUID()}.${ext}`;

  const params = {
    Bucket: cfg.bucket, // <-- never undefined now
    Key: key,
    Body: file.buffer ?? file.stream ?? file, // buffer from memoryStorage
    ContentType: file.mimetype || "application/octet-stream",
  };

  const out = await s3.upload(params).promise();

  // Prefer SDK Location; else build from publicBase
  const url =
    out.Location ||
    (cfg.publicBase
      ? `${cfg.publicBase.replace(/\/$/, "")}/${key}`
      : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`);

  return { url, key };
}

export async function deleteFromS3(key) {
  if (!key) return;
  await s3
    .deleteObject({
      Bucket: cfg.bucket,
      Key: key,
    })
    .promise()
    .catch(() => {});
}

export { s3 };
