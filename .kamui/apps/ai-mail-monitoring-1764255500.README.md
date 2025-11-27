# AIメール監視の仕様 - スライドアプリ

## 概要
AIメール監視システムの仕様を説明する6枚のスライドアプリです。

## 生成ファイル一覧

### 1. アイコン
- **ファイル**: `.kamui/apps/icons/ai-mail-monitoring-1764255500.svg`
- **サイズ**: 256×256px
- **デザイン**:
  - 背景: 青から紫へのグラデーション（#1E88E5 → #7E57C2）
  - メインモチーフ: メール封筒 + AI監視の目
  - アクセント: 緑色（#4CAF50）で「アクティブ監視」を表現
  - テキスト: "AI MAIL MONITORING"

### 2. HTMLファイル
- **ファイル**: `.kamui/apps/ai-mail-monitoring-1764255500.html`
- **内容**: 6枚のスライドを含むプレゼンテーション
- **ベース**: `kamui-os-intro-1732171200.html` をコピー

### 3. CSSファイル
- **ファイル**: `.kamui/apps/ai-mail-monitoring-1764255500.css`
- **内容**: ベースのスタイル（変更なし）

### 4. JavaScriptファイル
- **ファイル**: `.kamui/apps/ai-mail-monitoring-1764255500.js`
- **内容**: スライドナビゲーション、サイドバー制御（変更なし）

### 5. メタデータファイル
- **ファイル**: `.kamui/apps/ai-mail-monitoring-1764255500.json`
- **内容**: 各スライドのタイトル、説明、プロンプト、画像URL

## スライド構成

| # | タイトル | 説明 | 画像URL |
|---|---------|------|---------|
| 1 | タイトル | AIメール監視の仕様 | [リンク](https://v3b.fal.media/files/b/monkey/38c9KL1FOK62o2r1xX0EZ.png) |
| 2 | システム概要 | AIメール監視システムの全体像 | [リンク](https://v3b.fal.media/files/b/monkey/tnmJfFNc7e0PaksY_DNf1.png) |
| 3 | 監視フロー | メール受信から分析までの処理フロー | [リンク](https://v3b.fal.media/files/b/lion/9UUAqKwDrTZo3K8xTU9Wt.png) |
| 4 | AI分析機能 | スパム/フィッシング/異常検知 | [リンク](https://v3b.fal.media/files/b/tiger/_5yA2EAEVmRcKyS2dQ5gM.png) |
| 5 | アラート機能 | メール/Slack/ダッシュボード通知 | [リンク](https://v3b.fal.media/files/b/panda/tMbclU8SajP1fzb2o8AG6.png) |
| 6 | 運用と管理 | 管理ダッシュボードとレポート | [リンク](https://v3b.fal.media/files/b/koala/L3LH873tdvUT9O2rRjO8_.png) |

## 操作方法

### キーボードナビゲーション
- **→ (右矢印)**: 次のスライドへ
- **← (左矢印)**: 前のスライドへ

### マウス操作
- **画面下部のボタン**: ◀ (前へ) / ▶ (次へ)
- **サイドバーのスライド一覧**: クリックで直接移動
- **サイドバー折り畳み**: 左上の ◀ ボタンをクリック

### サイドバー
- 左側に全スライドの一覧を表示
- 現在のスライドがハイライト表示
- クリックで任意のスライドに直接ジャンプ
- 折り畳み可能

## 画像生成について

### 使用MCP
- **MCP名**: `t2i-kamui-fal-nano-banana-pro`
- **モデル**: Google Gemini 2.5 Flash Image
- **アスペクト比**: 16:9
- **出力形式**: PNG

### プロンプト方針
1. **プロフェッショナル**: 企業向けプレゼンテーション品質
2. **日本語ラベル**: UI要素は日本語表記
3. **色使い**: 各スライドで異なるカラーテーマ
4. **インフォグラフィック**: 図解中心のデザイン

## 画像の差し替え手順

画像を再生成する場合は、以下の手順で行います：

```bash
# 1. メタデータファイルからプロンプトを取得
cat .kamui/apps/ai-mail-monitoring-1764255500.json

# 2. MCPで画像を生成（Claude Code環境）
# Claude Codeに「スライド1の画像を再生成して」と指示

# 3. HTMLファイルの画像URLを更新
# 該当する<img src="...">のURLを新しいURLに置き換え

# 4. メタデータファイルのcurrent_urlも更新
# JSONファイル内のcurrent_urlフィールドを更新
```

## ベースとの差分

### 変更点
- タイトル: "KAMUI OS とは - 完全版" → "AIメール監視の仕様"
- スライド数: 33枚 → 6枚
- CSS/JSリンク: `kamui-os-intro-1732171200.*` → `ai-mail-monitoring-1764255500.*`
- スライド内容: KAMUI OS関連 → AIメール監視関連

### 維持した機能
- サイドバーの折り畳み機能
- キーボードナビゲーション
- マウスクリックナビゲーション
- スライド一覧からの直接ジャンプ
- レスポンシブデザイン

## 今後の拡張

### 画像の追加/削除
1. HTMLファイルに`<div class="slide">...</div>`を追加/削除
2. メタデータJSONファイルにスライド情報を追加/削除
3. スライド数表示を更新（`1 / 6` → `1 / N`）

### スタイルのカスタマイズ
- CSSファイルを編集（`.kamui/apps/ai-mail-monitoring-1764255500.css`）
- 色、フォント、レイアウトなどを自由に変更可能

### 機能の追加
- JavaScriptファイルを編集（`.kamui/apps/ai-mail-monitoring-1764255500.js`）
- アニメーション、トランジション、インタラクションを追加可能

## ライセンス・クレジット
- ベース: KAMUI OS Intro スライドシステム
- 画像生成: Google Gemini 2.5 Flash Image (via FAL nano-banana-pro)
- 作成日: 2025-11-27
