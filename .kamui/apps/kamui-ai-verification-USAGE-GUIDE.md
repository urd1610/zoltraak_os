# 高性能PC導入によるAI検証 - スライド管理・操作ガイド

**作成日**: 2025-12-15
**アプリ名**: Kamui AI Verification Report
**テーマ**: 手書き風ビジネスプレゼンテーション
**スライド数**: 11枚

---

## 📁 生成・配置ファイル一覧

### メインファイル
| ファイル | 場所 | 用途 |
|---------|------|------|
| `kamui-ai-verification-20251215.html` | `.kamui/apps/` | **メインスライドアプリ** |
| `kamui-ai-verification-20251215-metadata.json` | `.kamui/apps/` | スライド・画像URL・プロンプト管理 |
| `kamui-ai-verification-USAGE-GUIDE.md` | `.kamui/apps/` | このドキュメント（操作・更新ガイド） |

### リソースファイル
| ファイル | 場所 | 説明 |
|---------|------|------|
| `kamui-os-intro-1732171200.css` | `.kamui/apps/` | ベースCSS（読取専用） |
| `kamui-os-intro-1732171200.js` | `.kamui/apps/` | ベースJS（読取専用） |
| `kamui-os-intro-1732171200.html` | `.kamui/apps/` | ベースHTML参照用 |

### アイコン
| ファイル | 場所 | 説明 |
|---------|------|------|
| `kamui-os-intro-20251125.svg` | `.kamui/apps/icons/` | アプリアイコン（256×256px） |

---

## 🎨 アイコン設計情報

**ファイル**: `kamui-os-intro-20251125.svg`

### デザイン要素
- **背景**: 深紺グラデーション（`#1a1a2e` → `#16213e`）
  - 意図: 高性能PC・最先端技術のイメージ
- **PC本体**: ノート型、手書き風フィルタで線に揺らぎ
  - ディスプレイ: シアン (`#00d4ff`) ネオン調アウトライン
  - RGB光点（赤・緑・黄）: GPU/マルチスレッド処理表現
- **CPU/GPUチップ（右上）**: 赤 (`#ff6b6b`) で処理ユニット
- **グラフ（左下）**: 緑→青で「パフォーマンス向上」を示唆
- **検証済みチェック（右下）**: シアン ✓ マーク

### 色コード一覧
| 名称 | 色コード | 用途 |
|------|---------|------|
| 背景濃 | `#1a1a2e` | 深紺背景 |
| 背景薄 | `#16213e` | グラデーション終端 |
| ネオン青 | `#00d4ff` | ディスプレイ枠、ディテール |
| 警告赤 | `#ff6b6b` | CPUチップ、強調 |
| 成功緑 | `#4ecdc4` | グラフバー、肯定的要素 |
| アクセント黄 | `#ffe66d` | グラフバー、ハイライト |

---

## 📊 スライド構成（11枚）

### Slide 1: タイトル
- **タイトル**: 高性能PC導入によるAI検証
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb4/PxWVKn9S_8UtKRzSGXfhm.png`
- **説明**: PC・LM Studio・ローカルAI基盤の概要表示

### Slide 2: PCスペック
- **タイトル**: PCスペック - 検証用マシンの構成
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb7/FayjPFTfZjqYvgdlvjlNW.png`
- **内容**: CPU: Ryzen AI 7 350, GPU: RTX 5070, RAM: 64GB DDR5

### Slide 3: 検証概要
- **タイトル**: 検証概要 - 目的と前提条件
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/tmAww2E5ehOsmH_tyy3R8.png`
- **内容**: ローカルAI基盤実現性確認、LM Studio 前提

### Slide 4: 検証環境・ツール
- **タイトル**: 検証環境・ツール - OS・ハードウェア・LM Studio
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/v9d55x0qehz-i1sASfNZs.png`
- **内容**: LM Studio、GGUF形式、OpenAI互換API

### Slide 5: LM Studio設定
- **タイトル**: LM Studio設定 - 軽量・高品質モデル構成
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/-lTwVN3btChUKGlHpSv3_.png`
- **内容**: Gemma3 vs gpt-oss-20B 構成

### Slide 6: 検証シナリオ
- **タイトル**: 検証シナリオ - メール生成・要約・翻訳・API検証
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/3UG0eVcY_giPDLzMVGPky.png`
- **内容**: 4つの検証ユースケース

### Slide 7: 結果サマリ（メール生成・要約）
- **タイトル**: 結果サマリ - メール生成・要約
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/Am1YliBWuUIIQuC-1LAyj.png`
- **内容**: Gemma3 vs gpt-oss-20B 定性的評価

### Slide 8: 結果サマリ（翻訳・API）
- **タイトル**: 結果サマリ - 翻訳・API検証
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/k4hXmqQBlkDzMDwLpmuZx.png`
- **内容**: 翻訳精度・API経由検証結果

### Slide 9: モデル別所感・総評
- **タイトル**: モデル別所感・総評
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/hbr1WnYMUdMqOUyChqih5.png`
- **内容**: Gemma3は即時レスポンス、gpt-oss-20Bは高品質

### Slide 10: リソース利用と運用上の注意
- **タイトル**: リソース利用と運用上の注意
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/gmOdFjLVN1umjFKlcTVFY.png`
- **内容**: GPU/メモリ・ストレージ・セキュリティ

### Slide 11: 今後の検討事項
- **タイトル**: 今後の検討事項
- **画像URL**: `https://v3b.fal.media/files/b/0a865fb8/Fi-81xKJRoTYTTuLK4WXc.png`
- **内容**: RAG・複数ユーザー・モデル拡充・監視

---

## 🖥️ 操作ガイド

### キーボード操作
| キー | 動作 |
|------|------|
| **→ / 右矢印** | 次スライドへ移動 |
| **← / 左矢印** | 前スライドへ移動 |
| **▶ ボタン** | 次スライド（クリック） |
| **◀ ボタン** | 前スライド（クリック） |

### サイドバー操作
- **スライド一覧**: スライド番号をクリックで直接移動
- **折りたたみボタン** (◀): サイドバーを折り畳む / 展開
  - 折りたたみ時は幅88px
  - 展開時は幅320px
- **ダウンロードボタン** (⬇️): 全スライドをPDFで一括ダウンロード
  - jsPDF 2.5.1利用
  - **絶対に変更しないこと**

### スライド表示
- **進捗表示**: 画面上部「1 / 11」形式で現在位置表示
- **画像サイズ**: レスポンシブ対応（ウィンドウサイズに自動調整）

---

## 📝 メタデータ更新手順

### 画像URL置き換え方法

```json
// kamui-ai-verification-20251215-metadata.json 内
"slides": [
  {
    "id": 1,
    "title": "スライドタイトル",
    "imageUrl": "https://v3b.fal.media/files/b/[新画像URL]",
    "imagePrompt": "生成時プロンプト（変更不要）"
  }
]
```

### 更新フロー
1. **新しい画像を生成**
   - MCP: `t2i-kamui-fal-nano-banana-pro` 使用
   - 手書き風スタイルで統一
   - 解像度: 2K（2752×1536px）
   - アスペクト比: 16:9

2. **画像URLをメタデータに記録**
   - `kamui-ai-verification-20251215-metadata.json` の `imageUrl` フィールド更新

3. **HTMLを同期更新**
   - `kamui-ai-verification-20251215.html` 内の `<img src="...">` を新URLで更新
   - **重要**: `<div class="slide">` 構造は変更しない

4. **ダウンロードボタン確認**
   - `<button id="downloadAllBtn">` が存在するか確認
   - ID と class 属性は絶対に変更しない

---

## ⚠️ 注意事項

### 禁止事項
- ❌ ベースCSS/JS (`kamui-os-intro-1732171200.*`) を編集
- ❌ HTML の `<div class="slide">` 構造を変更
- ❌ `id="downloadAllBtn"` の属性変更
- ❌ ダウンロードボタンの削除・リネーム
- ❌ スライド数変更時の DOM 構造への直接編集

### 推奨事項
- ✅ 画像変更は **メタデータ → HTML** の順で進める
- ✅ 毎回のコミットは **関数単位・日本語** で行う
- ✅ 新スライド追加時は Metadata/HTML/JS を同期
- ✅ 定期的に Metadata JSON の妥当性を確認

---

## 📋 スライド更新時チェックリスト

新スライドを追加 or 既存スライドを更新する場合:

```
□ 新画像をMCPで生成（手書き風、2K解像度、16:9比率）
□ 画像URL取得確認
□ メタデータファイルに imageUrl を記録
□ HTML に <img src="[新URL]"> を追加
□ スライド数を確認（<span id="slideNumber">1 / XX</span>）
□ ダウンロードボタンが有効か確認
□ ブラウザで表示テスト（全スライド閲覧、ナビゲーション動作確認）
□ コミット実施（日本語で）
```

---

## 🔍 ベース HTML / CSS / JS の継承情報

### CSS（読取専用）
- **ファイル**: `kamui-os-intro-1732171200.css`
- **主要クラス**:
  - `.app`: フレックスコンテナ
  - `.sidebar`: サイドバー（width: 320px / collapsed: 88px）
  - `.slide`: 個別スライド（アクティブ時: `active`）
  - `.progress`: スライド進捗表示
  - `.navigation`: 前後ボタン

### JS（読取専用）
- **ファイル**: `kamui-os-intro-1732171200.js`
- **主要機能**:
  - スライド遷移（`currentSlide` 管理）
  - サイドバー折りたたみ
  - キーボード/クリックナビゲーション
  - PDF一括ダウンロード（jsPDF）
  - Toast通知

### HTML 構造（継承・拡張）
```html
<div class="app">
  <aside class="sidebar">
    <!-- スライド一覧 -->
    <ul class="slide-list" id="slideList"></ul>
  </aside>

  <main class="slides-area">
    <div class="progress">
      <span id="slideNumber">1 / 11</span>
    </div>

    <div class="slide-container">
      <!-- 各スライド -->
      <div class="slide active">
        <img src="..." alt="...">
      </div>
    </div>

    <div class="navigation">
      <button id="prevBtn">◀</button>
      <button id="nextBtn">▶</button>
    </div>
  </main>
</div>
```

---

## 🚀 今後の拡張方針

### 可能な更新
- ✅ スライド画像の差し替え（URL更新）
- ✅ スライド数の追加（5→20など）
- ✅ メタデータの拡張フィールド追加（タグ、日付など）

### 非推奨
- ❌ CSS/JS の改造
- ❌ ダウンロード機能の変更
- ❌ DOM 構造の再編成

---

## 📞 トラブルシューティング

### スライドが表示されない
**確認項目**:
1. 画像URL が正しいか確認（`https://v3b.fal.media/...`）
2. HTML の `<img src="">` 属性が一致しているか
3. ブラウザコンソールにエラーがないか

### ダウンロードボタンが機能しない
**確認項目**:
1. `id="downloadAllBtn"` が存在するか
2. jsPDF ライブラリが読み込まれているか（`<script src="https://cdn.jsdelivr.net/...">`)
3. JS が `downloadAllBtn` を正しく参照しているか

### サイドバーが動作しない
**確認項目**:
1. `id="toggleSidebar"` と `id="slideList"` が存在するか
2. CSS の `transition` が適用されているか
3. JS が `.sidebar.collapsed` クラスを付与しているか

---

## 📄 ファイル一覧・バージョン

| ファイル | バージョン | 更新日 | ステータス |
|---------|-----------|--------|-----------|
| `kamui-ai-verification-20251215.html` | 1.0 | 2025-12-15 | ✅ 本番 |
| `kamui-ai-verification-20251215-metadata.json` | 1.0 | 2025-12-15 | ✅ 本番 |
| `kamui-os-intro-20251125.svg` | 1.0 | 2025-12-15 | ✅ アイコン |
| `kamui-os-intro-1732171200.css` | - | - | 読取専用 |
| `kamui-os-intro-1732171200.js` | - | - | 読取専用 |

---

**作成者**: Claude Code
**プロジェクト**: Zoltraak OS - Kamui Apps Collection
**ライセンス**: 内部用
