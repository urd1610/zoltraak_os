const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

const normalizeForSearch = (value) => String(value ?? '').normalize('NFKC');

const extractEmailAddresses = (value) => {
  const text = String(value ?? '');
  const matches = text.match(EMAIL_PATTERN);
  if (!matches) return [];
  const unique = [];
  const seen = new Set();
  matches.forEach((match) => {
    const normalized = match.trim().toLowerCase();
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    unique.push(match.trim());
  });
  return unique;
};

module.exports = {
  extractEmailAddresses,
  normalizeForSearch,
};
