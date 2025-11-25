const POP3Client = require('poplib');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

class AiMailMonitor {
  constructor(options = {}) {
    this.credentials = options.credentials ?? {
      user: 'ai-mail@shoeidenko.co.jp',
      pass: 's33sswyfh!',
    };
    this.pop3 = options.pop3 ?? {
      host: 'wx105.wadax-sv.jp',
      port: 110,
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

    this.state = {
      forwardTo: options.forwardTo ?? '',
      lastCheckedAt: null,
      lastForwardedAt: null,
      lastError: null,
      forwardedCount: options.forwardedCount ?? 0,
      running: false,
      seenUids: new Set(options.seenUids ?? []),
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
  }

  getStatus() {
    return {
      forwardTo: this.state.forwardTo,
      lastCheckedAt: this.state.lastCheckedAt,
      lastForwardedAt: this.state.lastForwardedAt,
      lastError: this.state.lastError,
      forwardedCount: this.state.forwardedCount,
      running: this.state.running,
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

  async pollOnce() {
    if (!this.state.running) {
      return this.getStatus();
    }
    if (!this.state.forwardTo) {
      this.state.lastError = '転送先メールアドレスが設定されていません';
      this.state.lastCheckedAt = new Date().toISOString();
      await this.persistState();
      return this.getStatus();
    }

    try {
      const newMessages = await this.fetchNewMessages();
      for (const message of newMessages) {
        await this.forwardMessage(message);
      }
      if (newMessages.length > 0) {
        this.state.lastForwardedAt = new Date().toISOString();
      }
      this.state.lastError = null;
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
    const client = new POP3Client(this.pop3.port, this.pop3.host, {
      tlserrs: false,
      enabletls: Boolean(this.pop3.enableTls),
      debug: false,
    });

    const awaitEvent = (event, trigger) => new Promise((resolve, reject) => {
      const onError = (err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const onEvent = (...args) => {
        cleanup();
        resolve(args);
      };
      const cleanup = () => {
        client.removeListener('error', onError);
        client.removeListener(event, onEvent);
      };
      client.once('error', onError);
      client.once(event, onEvent);
      trigger();
    });

    const waitForConnect = () => new Promise((resolve, reject) => {
      const onError = (err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        client.removeListener('error', onError);
        client.removeListener('connect', onConnect);
      };
      client.once('error', onError);
      client.once('connect', onConnect);
    });

    const cleanupClient = () => {
      try {
        client.quit();
      } catch (error) {
        // noop
      }
    };

    try {
      await waitForConnect();
      const [loginStatus] = await awaitEvent('login', () => client.login(this.credentials.user, this.credentials.pass));
      if (!loginStatus) {
        throw new Error('POP3ログインに失敗しました');
      }
      const [uidlStatus, , uidlData] = await awaitEvent('uidl', () => client.uidl());
      if (!uidlStatus) {
        throw new Error('UIDLの取得に失敗しました');
      }

      const uidEntries = this.parseUidl(uidlData);
      const newEntries = uidEntries.filter((entry) => entry.uid && !this.state.seenUids.has(entry.uid));
      const messages = [];

      for (const entry of newEntries) {
        const [retrStatus, , data] = await awaitEvent('retr', () => client.retr(entry.msgNumber));
        if (!retrStatus) {
          continue;
        }
        const raw = Array.isArray(data) ? data.join('\n') : String(data);
        messages.push({ ...entry, raw });
      }

      cleanupClient();
      return messages;
    } catch (error) {
      cleanupClient();
      throw error;
    }
  }

  parseUidl(data) {
    const lines = Array.isArray(data)
      ? data
      : typeof data === 'string'
        ? data.split(/\r?\n/)
        : [];

    return lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [numberPart, uid] = line.split(' ');
        return {
          msgNumber: Number(numberPart),
          uid,
        };
      })
      .filter((item) => Number.isFinite(item.msgNumber) && item.uid);
  }

  async forwardMessage(message) {
    const parsed = await simpleParser(message.raw);
    await this.transporter.sendMail({
      from: this.credentials.user,
      to: this.state.forwardTo,
      subject: parsed.subject ? `[FW] ${parsed.subject}` : '転送メール',
      text: parsed.text ?? '(本文なし)',
      html: parsed.html ?? undefined,
      attachments: (parsed.attachments ?? []).map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
        cid: file.cid,
      })),
    });
    this.state.forwardedCount += 1;
    this.state.seenUids.add(message.uid);
    this.trimSeenUids();
  }

  trimSeenUids() {
    const seen = Array.from(this.state.seenUids);
    const limit = 200;
    if (seen.length > limit) {
      const trimmed = seen.slice(seen.length - limit);
      this.state.seenUids = new Set(trimmed);
    }
  }

  async persistState() {
    const status = this.getStatus();
    if (this.saveState) {
      await this.saveState({
        forwardTo: this.state.forwardTo,
        forwardedCount: this.state.forwardedCount,
        seenUids: Array.from(this.state.seenUids),
      });
    }
    return status;
  }
}

module.exports = { AiMailMonitor };
