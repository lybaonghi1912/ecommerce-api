import 'dotenv/config';

const rawPort = process.env.PORT;
const nodeEnv = process.env.NODE_ENV;

if (!rawPort || !/^\d+$/.test(rawPort)) {
  throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
}

if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV phải là development, test hoặc production.');
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL là cấu hình bắt buộc.');
}

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error('DATABASE_URL không phải URL hợp lệ.');
}

if (!['postgresql:', 'postgres:'].includes(parsedDatabaseUrl.protocol)) {
  throw new Error('DATABASE_URL phải sử dụng PostgreSQL.');
}

const jwtSecret = process.env.JWT_SECRET;
const rawJwtLifetime = process.env.JWT_EXPIRES_IN_SECONDS;
const jwtIssuer = process.env.JWT_ISSUER?.trim();
const jwtAudience = process.env.JWT_AUDIENCE?.trim();

if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET phải có ít nhất 32 byte.');
}
const jwtExpiresInSeconds = Number(rawJwtLifetime);
if (!rawJwtLifetime || !/^\d+$/.test(rawJwtLifetime) || !Number.isSafeInteger(jwtExpiresInSeconds) || jwtExpiresInSeconds < 1 || jwtExpiresInSeconds > 86400) {
  throw new Error('JWT_EXPIRES_IN_SECONDS phải là số nguyên từ 1 đến 86400.');
}
if (!jwtIssuer || !jwtAudience) {
  throw new Error('JWT_ISSUER và JWT_AUDIENCE là bắt buộc.');
}

export const config = { port, nodeEnv, databaseUrl, jwtSecret, jwtExpiresInSeconds, jwtIssuer, jwtAudience };


