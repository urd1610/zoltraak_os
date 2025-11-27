const fs = require('fs');
const path = require('path');
const { Pop3Client } = require('./pop3Client');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { simpleParser } = require('mailparser');
const { AiFormatter, DEFAULT_PROMPT } = require('./aiFormatter');

class AiMailMonitor {
  constructor(options = {}) {
    this.credentials = options.credentials ?? {
      user: 'ai-mail@shoeidenko.co.jp',
      pass: 's33sswyfh!',
    };
    this.pop3 = options.pop3 ?? {
      host: 'wx105.wadax-sv.jp',
      port: 995,
      enableTls: true,
    };
    this.smtp = options.smtp ?? {
      host: 'wx105.wadax-sv.jp',
      port: 587,
      secure: false,
      requireTLS: true,
    };
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.loadState = options.loadState;
    this.saveState = options.saveState;
    this.ensureWorkspaceDirectory = options.ensureWorkspaceDirectory;
    this.formatDateForFilename = typeof options.formatDateForFilename === 'function'
      ? options.formatDateForFilename
      : this.defaultFormatDateForFilename;
    this.currentFormatting = this.normalizeFormatting(options.formatting);

    this.state = {
      forwardTo: options.forwardTo ?? '',
      lastCheckedAt: null,
      lastForwardedAt: null,
      lastError: null,
      forwardedCount: options.forwardedCount ?? 0,
      running: false,
      seenUids: new Set(options.seenUids ?? []),
      formatting: this.currentFormatting,
    };

    this.timer = null;
    this.initialized = false;
    this.transporter = nodemailer.createTransport({
      host: this.smtp.host,
      port: this.smtp.port,
      secure: Boolean(this.smtp.secure),
      requireTLS: Boolean(this.smtp.requireTLS),
      auth: {
        user: this.credentials.user,
        pass: this.credentials.pass,
      },
    });
    this.aiFormatter = options.aiFormatter ?? new AiFormatter(this.currentFormatting);
  }

  getDefaultFormatting() {
    return {
      enabled: true,
      provider: 'openrouter',
      prompt: DEFAULT_PROMPT,
      openRouter: {
        apiKey: '',
        model: 'gpt-4o-mini',
      },
      lmStudio: {
        endpoint: 'http://localhost:1234/v1/chat/completions',
        model: 'gpt-4o-mini',
      },
      timeoutMs: 60000,
      maxRetries: 2,
    };
  }

  normalizeFormatting(value) {
    const defaults = this.getDefaultFormatting();
    const candidate = value ?? {};
    return {
      enabled: candidate.enabled !== false,
      provider: (candidate.provider || defaults.provider || 'openrouter').toLowerCase(),
      prompt: candidate.prompt || defaults.prompt,
      openRouter: {
        apiKey: candidate.openRouter?.apiKey ?? defaults.openRouter.apiKey,
        model: candidate.openRouter?.model || defaults.openRouter.model,
      },
      lmStudio: {
        endpoint: candidate.lmStudio?.endpoint || defaults.lmStudio.endpoint,
        model: candidate.lmStudio?.model || defaults.lmStudio.model,
      },
      timeoutMs: typeof candidate.timeoutMs === 'number' ? candidate.timeoutMs : defaults.timeoutMs,
      maxRetries: typeof candidate.maxRetries === 'number' ? candidate.maxRetries : defaults.maxRetries,
    };
  }

  applyFormatting(nextFormatting) {
    this.currentFormatting = this.normalizeFormatting(nextFormatting);
    this.state.formatting = this.currentFormatting;
    this.aiFormatter = new AiFormatter(this.currentFormatting);
  }

  async updateFormatting(nextFormatting) {
    this.applyFormatting({ ...this.state.formatting, ...(nextFormatting ?? {}) });
    await this.persistState();
    return this.getStatus();
  }

  getStatus() {
    return {
      forwardTo: this.state.forwardTo,
      lastCheckedAt: this.state.lastCheckedAt,
      lastForwardedAt: this.state.lastForwardedAt,
      lastError: this.state.lastError,
      forwardedCount: this.state.forwardedCount,
      running: this.state.running,
      formatting: this.state.formatting,
    };
  }

  async updateForwardTo(address) {
    this.state.forwardTo = (address ?? '').trim();
    await this.persistState();
    return this.getStatus();
  }

  async initFromStorage() {
    if (this.initialized || !this.loadState) {
      this.initialized = true;
      return;
    }
    const saved = await this.loadState();
    if (saved) {
      if (saved.forwardTo) this.state.forwardTo = saved.forwardTo;
      if (Array.isArray(saved.seenUids)) {
        this.state.seenUids = new Set(saved.seenUids);
      }
      if (typeof saved.forwardedCount === 'number') {
        this.state.forwardedCount = saved.forwardedCount;
      }
      if (saved.formatting) {
        this.applyFormatting(saved.formatting);
      }
    }
    this.initialized = true;
  }

  async start() {
    await this.initFromStorage();
    if (this.state.running) {
      return this.getStatus();
    }
    this.state.running = true;
    await this.persistState();
    await this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
    return this.getStatus();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.running = false;
    return this.getStatus();
  }

  defaultFormatDateForFilename(date) {
    const pad = (value) => String(value).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());
    return `${year}${month}${day}_${hour}${minute}${second}`;
  }

  normalizeRawEmail(raw) {
    if (Buffer.isBuffer(raw)) {
      return Buffer.from(raw);
    }
    if (ArrayBuffer.isView(raw) && raw.buffer) {
      return Buffer.from(raw.buffer);
    }
    return Buffer.from(String(raw ?? ''), 'binary');
  }

  stripPop3Envelope(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return buffer;
    }

    let start = 0;
    let end = buffer.length;

    const okPrefix = Buffer.from('+OK ');
    if (buffer.slice(0, okPrefix.length).equals(okPrefix)) {
      const lfIndex = buffer.indexOf(0x0a);
      if (lfIndex !== -1) {
        start = lfIndex + 1;
      }
    }

    const terminator = Buffer.from('\r\n.\r\n');
    if (end - start >= terminator.length && buffer.slice(end - terminator.length, end).equals(terminator)) {
      end -= terminator.length;
    }

    return buffer.slice(start, end);
  }

  restoreStrippedUtf8(text) {
    if (!text) {
      return text;
    }
    const buffer = Buffer.from(String(text), 'binary');
    if (buffer.some((byte) => byte >= 0x80)) {
      return text;
    }
    const isJapaneseChar = (codePoint) => (
      (codePoint >= 0x3040 && codePoint <= 0x30ff) // Hiragana / Katakana
      || (codePoint >= 0x4e00 && codePoint <= 0x9fff) // CJK Unified Ideographs
      || (codePoint >= 0xff01 && codePoint <= 0xffe6) // Fullwidth variants
    );

    const restored = [];
    let changed = false;
    for (let i = 0; i < buffer.length; i += 1) {
      const byte = buffer[i];
      if (byte >= 0x60 && byte <= 0x6f && i + 2 < buffer.length && buffer[i + 1] <= 0x3f && buffer[i + 2] <= 0x3f) {
        const candidate = Buffer.from([byte | 0x80, buffer[i + 1] | 0x80, buffer[i + 2] | 0x80]);
        try {
          const decoded = candidate.toString('utf-8');
          if (decoded.length === 1 && isJapaneseChar(decoded.codePointAt(0))) {
            restored.push(...candidate);
            changed = true;
            i += 2;
            continue;
          }
        } catch (error) {
          // keep original bytes
        }
      }
      restored.push(byte);
    }

    if (!changed) {
      return text;
    }

    try {
      return Buffer.from(restored).toString('utf-8');
    } catch (error) {
      return text;
    }
  }

  escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  buildHtmlFromText(text) {
    if (!text) {
      return null;
    }
    const escaped = this.escapeHtml(text);
    const withBreaks = escaped.replace(/\r?\n/g, '<br>');
    return `<div style="white-space:pre-wrap;font-family:inherit;">${withBreaks}</div>`;
  }

  async ensureMailDirectory(kind) {
    if (!this.ensureWorkspaceDirectory) {
      throw new Error('作業ディレクトリが設定されていません');
    }
    const workspaceDir = await this.ensureWorkspaceDirectory();
    if (!workspaceDir) {
      throw new Error('作業ディレクトリが設定されていません');
    }
    const targetDir = path.join(workspaceDir, 'Mail', kind);
    await fs.promises.mkdir(targetDir, { recursive: true });
    return targetDir;
  }

  async buildMailFilePath(targetDir) {
    const baseName = this.formatDateForFilename(new Date());
    let candidate = path.join(targetDir, `${baseName}.eml`);
    let counter = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(targetDir, `${baseName}-${counter}.eml`);
      counter += 1;
    }
    return candidate;
  }

  async ensureReceivedDirectory() {
    return this.ensureMailDirectory('Received');
  }

  async buildReceivedFilePath(receivedDir) {
    return this.buildMailFilePath(receivedDir);
  }

  async saveRawEmail(raw) {
    if (!raw) {
      return { saved: false };
    }
    const buffer = this.stripPop3Envelope(this.normalizeRawEmail(raw));
    if (!buffer || buffer.length === 0) {
      return { saved: false };
    }
    const receivedDir = await this.ensureReceivedDirectory();
    const filePath = await this.buildReceivedFilePath(receivedDir);
    await fs.promises.writeFile(filePath, buffer);
    return { saved: true, filePath };
  }

  async ensureSentDirectory() {
    return this.ensureMailDirectory('Send');
  }

  async buildSentFilePath(sentDir) {
    return this.buildMailFilePath(sentDir);
  }

  async saveSentEmail(raw) {
    if (!raw) {
      return { saved: false };
    }
    const buffer = this.normalizeRawEmail(raw);
    if (!buffer || buffer.length === 0) {
      return { saved: false };
    }
    const sentDir = await this.ensureSentDirectory();
    const filePath = await this.buildSentFilePath(sentDir);
    await fs.promises.writeFile(filePath, buffer);
    return { saved: true, filePath };
  }

  async pollOnce(options = {}) {
    const force = Boolean(options.force);
    if (!this.state.running && !force) {
      return this.getStatus();
    }
    if (!this.state.forwardTo) {
      this.state.lastError = '転送先メールアドレスが設定されていません';
      this.state.lastCheckedAt = new Date().toISOString();
      await this.persistState();
      return this.getStatus();
    }

    let hadSaveError = false;
    let hadAiError = false;

    try {
      const newMessages = await this.fetchNewMessages();
      for (const message of newMessages) {
        const result = await this.forwardMessage(message);
        if (result?.saveFailed) {
          hadSaveError = true;
        }
        if (result?.aiFailed) {
          hadAiError = true;
        }
      }
      if (newMessages.length > 0) {
        this.state.lastForwardedAt = new Date().toISOString();
      }
      if (hadSaveError) {
        this.state.lastError = 'メールの保存に失敗しました';
      } else if (hadAiError) {
        this.state.lastError = 'AI整形に失敗したため原文を転送しました';
      } else {
        this.state.lastError = null;
      }
    } catch (error) {
      const message = error?.message ?? String(error);
      this.state.lastError = message;
    } finally {
      this.state.lastCheckedAt = new Date().toISOString();
      await this.persistState();
    }

    return this.getStatus();
  }

  async fetchNewMessages() {
    const client = new Pop3Client({
      host: this.pop3.host,
      port: this.pop3.port,
      enableTls: Boolean(this.pop3.enableTls),
      ignoreTlsErrors: Boolean(this.pop3.ignoreTlsErrors),
      timeoutMs: this.pop3.timeoutMs ?? 15000,
    });

    let shouldQuit = false;
    try {
      await client.login(this.credentials.user, this.credentials.pass);
      shouldQuit = true;
      const uidLines = await client.uidl();
      const uidEntries = this.parseUidl(uidLines);
      const newEntries = uidEntries.filter((entry) => entry.uid && !this.state.seenUids.has(entry.uid));
      const messages = [];

      for (const entry of newEntries) {
        const raw = await client.retr(entry.msgNumber);
        messages.push({ ...entry, raw });
        await client.dele(entry.msgNumber);
      }

      return messages;
    } catch (error) {
      throw error;
    } finally {
      if (shouldQuit && !client.closed) {
        try {
          await client.quit();
        } catch (quitError) {
          client.destroy();
        }
      } else {
        client.destroy();
      }
    }
  }

  parseUidl(data) {
    const entries = [];
    const addEntry = (msgNumber, uid) => {
      const number = Number(msgNumber);
      const trimmed = (uid ?? '').trim();
      if (!Number.isFinite(number) || !trimmed) return;
      entries.push({ msgNumber: number, uid: trimmed });
    };
    const parseLine = (line) => {
      if (!line) return null;
      const parts = String(line).trim().split(/\s+/);
      if (parts.length < 2) return null;
      const [numberPart, ...rest] = parts;
      const uid = rest.join(' ');
      if (!uid) return null;
      return { msgNumber: numberPart, uid };
    };

    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value !== 'string') return;
        const parsed = parseLine(value);
        if (parsed) {
          addEntry(parsed.msgNumber, parsed.uid);
          return;
        }
        addEntry(key, value);
      });
    }

    if (entries.length > 0) {
      return entries;
    }

    const lines = Array.isArray(data)
      ? data
      : typeof data === 'string'
        ? data.split(/\r?\n/)
        : [];

    lines.forEach((line) => {
      const parsed = parseLine(line);
      if (parsed) {
        addEntry(parsed.msgNumber, parsed.uid);
      }
    });

    return entries;
  }

  async forwardMessage(message) {
    const rawBuffer = this.stripPop3Envelope(this.normalizeRawEmail(message.raw));
    let saveFailed = false;
    let aiFailed = false;
    try {
      await this.saveRawEmail(rawBuffer);
    } catch (error) {
      // 保存に失敗しても転送は継続する
      console.error('Failed to save received email', error);
      saveFailed = true;
    }
    const parsed = await simpleParser(rawBuffer);
    const restoredText = this.restoreStrippedUtf8(parsed.text);
    const restoredHtml = this.restoreStrippedUtf8(parsed.html);

    let aiResult = null;
    if (this.state.formatting?.enabled && this.aiFormatter?.formatEmail) {
      try {
        aiResult = await this.aiFormatter.formatEmail({
          subject: parsed.subject,
          text: restoredText,
          html: restoredHtml,
        });
      } catch (error) {
        aiFailed = true;
        console.error('Failed to format email with AI', error);
      }
    }

    const aiText = (() => {
      if (aiResult?.body && aiResult.body.trim()) return aiResult.body;
      if (aiResult?.text && aiResult.text.trim()) return aiResult.text;
      return null;
    })();
    const formattedSubject = aiResult?.subject || parsed.subject;
    const formattedText = aiText || restoredText;
    const formattedHtml = aiResult?.html ?? (aiText ? this.buildHtmlFromText(aiText) : restoredHtml);
    const mailOptions = {
      from: this.credentials.user,
      to: this.state.forwardTo,
      subject: formattedSubject ? `[FW] ${formattedSubject}` : '転送メール',
      text: formattedText ?? '(本文なし)',
      html: formattedHtml ?? undefined,
      attachments: (parsed.attachments ?? []).map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
        cid: file.cid,
      })),
    };

    let forwardedRaw = null;
    try {
      forwardedRaw = await this.buildForwardedRaw(mailOptions);
    } catch (error) {
      console.error('Failed to build forwarded email', error);
      saveFailed = true;
    }

    await this.transporter.sendMail(mailOptions);

    if (forwardedRaw) {
      try {
        await this.saveSentEmail(forwardedRaw);
      } catch (error) {
        console.error('Failed to save forwarded email', error);
        saveFailed = true;
      }
    }

    this.state.forwardedCount += 1;
    this.state.seenUids.add(message.uid);
    this.trimSeenUids();
    return { saveFailed, aiFailed };
  }

  trimSeenUids() {
    const seen = Array.from(this.state.seenUids);
    const limit = 200;
    if (seen.length > limit) {
      const trimmed = seen.slice(seen.length - limit);
      this.state.seenUids = new Set(trimmed);
    }
  }

  buildRawEmail(data, rawData) {
    if (rawData) {
      if (Buffer.isBuffer(rawData)) {
        return this.stripPop3Envelope(Buffer.from(rawData));
      }
      return this.stripPop3Envelope(Buffer.from(String(rawData), 'binary'));
    }
    if (Buffer.isBuffer(data)) {
      return this.stripPop3Envelope(Buffer.from(data));
    }
    if (Array.isArray(data)) {
      const parts = data.map((line) => (Buffer.isBuffer(line) ? line : Buffer.from(String(line), 'binary')));
      const withBreaks = parts.flatMap((part, index) => (index === parts.length - 1 ? [part] : [part, Buffer.from('\r\n', 'binary')]));
      return this.stripPop3Envelope(Buffer.concat(withBreaks));
    }
    return this.stripPop3Envelope(Buffer.from(String(data ?? ''), 'binary'));
  }

  async buildForwardedRaw(mailOptions) {
    return new Promise((resolve, reject) => {
      const composer = new MailComposer(mailOptions);
      composer.compile().build((error, message) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(this.normalizeRawEmail(message));
      });
    });
  }

  async persistState() {
    const status = this.getStatus();
    if (this.saveState) {
      await this.saveState({
        forwardTo: this.state.forwardTo,
        forwardedCount: this.state.forwardedCount,
        seenUids: Array.from(this.state.seenUids),
        formatting: this.state.formatting,
      });
    }
    return status;
  }
}

module.exports = { AiMailMonitor };
