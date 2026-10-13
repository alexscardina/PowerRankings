const crypto = require("crypto");

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret() {
  return process.env.ADMIN_PASSWORD || "";
}

function sign(payload) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function login(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || password !== expected) {
    return null;
  }

  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

function isValidToken(token) {
  if (!token || !getSecret()) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;

  try {
    const { exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

module.exports = {
  login,
  isValidToken
};
