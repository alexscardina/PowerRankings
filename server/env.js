function envValue(name) {
  let value = process.env[name];
  if (value == null) return value;

  value = String(value).trim();

  // Netlify UI sometimes gets pasted as KEY=value instead of just value
  const prefix = `${name}=`;
  if (value.startsWith(prefix)) {
    value = value.slice(prefix.length).trim();
  }

  // Strip wrapping quotes from .env-style pastes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value;
}

module.exports = {
  envValue
};
