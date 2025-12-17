const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

const normalizeForSearch = (value) => String(value ?? '').normalize('NFKC');

const stripQuotePrefix = (line) => String(line ?? '').replace(/^[>\s]+/, '');

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

const looksLikeReplyToLabel = (line) => {
  const normalized = normalizeForSearch(stripQuotePrefix(line)).toLowerCase();
  return normalized.includes('返信先') || normalized.includes('reply-to') || normalized.includes('replyto');
};

const looksLikeAiDecodeMarker = (line) => {
  const normalized = normalizeForSearch(stripQuotePrefix(line)).toLowerCase().replace(/\s+/g, '');
  return normalized.includes('ai解読用');
};

const splitLines = (value) => normalizeForSearch(value).replace(/\r\n/g, '\n').split('\n');

const pickReplyToFromSectionLines = (lines) => {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!looksLikeReplyToLabel(line)) continue;

    const emailsInLine = extractEmailAddresses(line);
    if (emailsInLine.length > 0) {
      return emailsInLine[0];
    }

    const lookahead = lines.slice(index + 1, index + 4);
    for (const candidate of lookahead) {
      const emails = extractEmailAddresses(candidate);
      if (emails.length > 0) {
        return emails[0];
      }
    }
  }

  const allEmails = extractEmailAddresses(lines.join('\n'));
  if (allEmails.length === 1) {
    return allEmails[0];
  }
  return null;
};

const extractReplyToFromAiDecodeSection = (bodyText, options = {}) => {
  if (!bodyText) return null;

  const maxSectionLines = Number.isFinite(options.maxSectionLines) ? options.maxSectionLines : 60;
  const lines = splitLines(bodyText);
  const startIndexes = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (looksLikeAiDecodeMarker(lines[index])) {
      startIndexes.push(index);
    }
  }

  for (const start of startIndexes) {
    const sectionLines = lines.slice(start, start + maxSectionLines);
    const replyTo = pickReplyToFromSectionLines(sectionLines);
    if (replyTo) {
      return replyTo;
    }
  }

  return null;
};

const stripHtmlToText = (html) => {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const resolveForwardToFromBody = (payload) => {
  const text = payload?.text ?? '';
  const html = payload?.html ?? '';
  const fallback = payload?.fallback ?? '';

  const replyToFromText = extractReplyToFromAiDecodeSection(text);
  if (replyToFromText) {
    return { address: replyToFromText, source: 'ai-decode:text' };
  }

  const replyToFromHtml = extractReplyToFromAiDecodeSection(stripHtmlToText(html));
  if (replyToFromHtml) {
    return { address: replyToFromHtml, source: 'ai-decode:html' };
  }

  const trimmedFallback = String(fallback).trim();
  if (trimmedFallback) {
    return { address: trimmedFallback, source: 'fallback' };
  }

  return { address: null, source: 'none' };
};

module.exports = {
  extractEmailAddresses,
  extractReplyToFromAiDecodeSection,
  resolveForwardToFromBody,
  normalizeForSearch,
};
