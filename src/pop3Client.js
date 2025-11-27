const net = require('net');
const tls = require('tls');

const CRLF = Buffer.from('\r\n');

const findCrlf = (buffer) => {
  for (let i = 0; i < buffer.length - 1; i += 1) {
    if (buffer[i] === 0x0d && buffer[i + 1] === 0x0a) {
      return i;
    }
  }
  return -1;
};

class Pop3Client {
  constructor(options = {}) {
    this.host = options.host;
    this.port = options.port;
    this.enableTls = Boolean(options.enableTls);
    this.ignoreTlsErrors = Boolean(options.ignoreTlsErrors);
    this.timeoutMs = options.timeoutMs ?? 15000;

    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.lineResolvers = [];
    this.closed = false;
  }

  async connect() {
    if (this.socket) {
      return;
    }

    const socket = this.enableTls
      ? tls.connect({
        host: this.host,
        port: this.port,
        rejectUnauthorized: !this.ignoreTlsErrors,
      })
      : net.createConnection({
        host: this.host,
        port: this.port,
      });

    this.socket = socket;
    socket.on('data', (chunk) => this.handleData(chunk));
    socket.on('error', (err) => this.handleError(err));
    socket.on('end', () => this.handleClose());
    socket.on('close', () => this.handleClose());

    await new Promise((resolve, reject) => {
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        socket.off('error', onError);
        socket.off('connect', onConnect);
      };
      socket.once('error', onError);
      socket.once('connect', onConnect);
    });

    const greet = await this.readLine();
    const status = this.parseStatus(greet);
    if (!status.ok) {
      throw new Error(status.text || 'POP3接続に失敗しました');
    }
  }

  async login(user, pass) {
    await this.command(`USER ${user}`);
    await this.command(`PASS ${pass}`);
  }

  async uidl() {
    const { lines } = await this.command('UIDL', { multiline: true });
    return lines.map((line) => line.toString('ascii'));
  }

  async retr(msgNumber) {
    const { lines } = await this.command(`RETR ${msgNumber}`, { multiline: true });
    return this.joinLines(lines);
  }

  async dele(msgNumber) {
    await this.command(`DELE ${msgNumber}`);
  }

  async quit() {
    try {
      await this.command('QUIT');
    } catch (error) {
      // ignore quit errors
    } finally {
      this.destroy();
    }
  }

  destroy() {
    this.closed = true;
    this.rejectPending(new Error('POP3接続が切断されました'));
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
  }

  parseStatus(line) {
    const text = line.toString('ascii');
    return { ok: text.startsWith('+OK'), text };
  }

  async command(command, options = {}) {
    await this.connect();
    this.writeLine(command);
    const statusLine = await this.readLine();
    const status = this.parseStatus(statusLine);
    if (!status.ok) {
      throw new Error(status.text || `POP3コマンドに失敗しました: ${command}`);
    }
    if (!options.multiline) {
      return { status: status.text };
    }
    const lines = await this.readMultiline();
    return { status: status.text, lines };
  }

  joinLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return Buffer.alloc(0);
    }
    const parts = [];
    lines.forEach((line) => {
      parts.push(Buffer.from(line));
      parts.push(CRLF);
    });
    return Buffer.concat(parts);
  }

  writeLine(text) {
    if (!this.socket) {
      throw new Error('POP3ソケットが初期化されていません');
    }
    this.socket.write(`${text}\r\n`);
  }

  async readMultiline() {
    const lines = [];
    while (true) {
      const line = await this.readLine();
      // termination line
      if (line.length === 1 && line[0] === 0x2e) {
        break;
      }
      if (line[0] === 0x2e) {
        lines.push(line.slice(1));
      } else {
        lines.push(line);
      }
    }
    return lines;
  }

  async readLine() {
    const existing = this.takeLine();
    if (existing) {
      return existing;
    }

    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('POP3接続が切断されました'));
        return;
      }

      const timer = setTimeout(() => {
        this.removeResolver(resolver);
        reject(new Error('POP3応答の待機中にタイムアウトしました'));
      }, this.timeoutMs);

      const resolver = {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };

      this.lineResolvers.push(resolver);
    });
  }

  handleData(chunk) {
    if (this.closed) {
      return;
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flushLines();
  }

  handleError(err) {
    if (this.closed) {
      return;
    }
    this.rejectPending(err instanceof Error ? err : new Error(String(err)));
    this.destroy();
  }

  handleClose() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectPending(new Error('POP3接続が終了しました'));
  }

  rejectPending(error) {
    while (this.lineResolvers.length > 0) {
      const resolver = this.lineResolvers.shift();
      resolver.reject(error);
    }
  }

  flushLines() {
    while (this.lineResolvers.length > 0) {
      const line = this.takeLine();
      if (!line) {
        break;
      }
      const resolver = this.lineResolvers.shift();
      resolver.resolve(line);
    }
  }

  takeLine() {
    const crlfIndex = findCrlf(this.buffer);
    if (crlfIndex === -1) {
      return null;
    }
    const line = this.buffer.slice(0, crlfIndex);
    this.buffer = this.buffer.slice(crlfIndex + 2);
    return line;
  }

  removeResolver(target) {
    this.lineResolvers = this.lineResolvers.filter((resolver) => resolver !== target);
  }
}

module.exports = { Pop3Client };
