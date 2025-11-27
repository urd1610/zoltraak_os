const DEFAULT_PROMPT = [
  'あなたは日本語のメール文面を整形するアシスタントです。',
  '以下のJSON形式だけで出力してください:',
  '{"subject":"短く要点を示す件名","body":"本文（敬体・箇条書き主体）"}',
  '条件:',
  '- 件名は50文字以内で、要約キーワードを含める',
  '- 本文は敬体で、重要項目は箇条書きにまとめる',
  '- 元メールの署名や引用は必要な場合だけ簡潔に反映する',
  '- 出力は必ずUTF-8のJSON文字列のみ。余分なテキストやコードブロックは付けない',
].join('\n');

class AiFormatter {
  constructor(options = {}) {
    this.setOptions(options);
  }

  setOptions(options = {}) {
    this.options = {
      enabled: options.enabled !== false,
      provider: options.provider ?? 'openrouter',
      prompt: options.prompt ?? DEFAULT_PROMPT,
      openRouter: {
        apiKey: options.openRouter?.apiKey ?? '',
        model: options.openRouter?.model ?? 'gpt-4o-mini',
      },
      lmStudio: {
        endpoint: options.lmStudio?.endpoint ?? 'http://localhost:1234/v1/chat/completions',
        model: options.lmStudio?.model ?? 'gpt-4o-mini',
      },
      timeoutMs: options.timeoutMs ?? 60000,
    };
  }

  getOptions() {
    return this.options;
  }

  buildMessages(payload) {
    const subject = (payload.subject ?? '').trim();
    const textBody = (payload.text ?? '').trim();
    const htmlBody = (payload.html ?? '').trim();
    const limitedText = this.truncate(textBody || this.stripHtml(htmlBody), 4000);
    const limitedHtml = this.truncate(htmlBody, 2000);

    const userContent = [
      subject ? `元の件名: ${subject}` : '元の件名: (なし)',
      '',
      '本文(テキスト優先・上限付き):',
      limitedText || '(本文なし)',
    ];

    if (limitedHtml && !limitedText) {
      userContent.push('', 'HTMLプレビュー(必要なら参考にしてください):', limitedHtml);
    }

    return [
      { role: 'system', content: this.options.prompt },
      { role: 'user', content: userContent.join('\n') },
    ];
  }

  truncate(value, limit) {
    if (!value || typeof value !== 'string' || value.length <= limit) {
      return value || '';
    }
    return `${value.slice(0, limit)}\n...（省略）`;
  }

  stripHtml(html) {
    if (!html) return '';
    return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async formatEmail(payload) {
    if (!this.options.enabled) {
      return null;
    }

    const messages = this.buildMessages(payload ?? {});
    const provider = (this.options.provider ?? 'openrouter').toLowerCase();

    if (provider === 'lmstudio') {
      return this.callLmStudio(messages);
    }

    return this.callOpenRouter(messages);
  }

  async callOpenRouter(messages) {
    const apiKey = this.options.openRouter?.apiKey ?? '';
    if (!apiKey) {
      throw new Error('OpenRouterのAPIキーが設定されていません');
    }
    const model = this.options.openRouter?.model || 'gpt-4o-mini';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`OpenRouterリクエストに失敗しました: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      return this.parseCompletion(content);
    } finally {
      clearTimeout(timer);
    }
  }

  async callLmStudio(messages) {
    const endpoint = this.options.lmStudio?.endpoint || 'http://localhost:1234/v1/chat/completions';
    const model = this.options.lmStudio?.model || 'gpt-4o-mini';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`LM Studioリクエストに失敗しました: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      return this.parseCompletion(content);
    } finally {
      clearTimeout(timer);
    }
  }

  parseCompletion(content) {
    if (!content) return null;
    const trimmed = String(content).trim();
    const jsonString = this.extractJson(trimmed);

    if (jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        return {
          subject: (parsed.subject ?? '').trim(),
          body: (parsed.body ?? '').trim(),
          raw: trimmed,
        };
      } catch (error) {
        // fallthrough to plain text handling
      }
    }

    return { body: trimmed, raw: trimmed };
  }

  extractJson(content) {
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      return fenceMatch[1];
    }
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return braceMatch[0];
    }
    return null;
  }
}

module.exports = {
  AiFormatter,
  DEFAULT_PROMPT,
};
