# 本番ビルド手順

## 概要

このプロジェクトはElectronベースのデスクトップアプリケーションです。electron-builderを使用して各プラットフォーム向けの本番ビルドを作成します。

## 前提条件

- Node.js と npm がインストールされていること
- ビルド対象のOSに応じた環境

## ビルド設定

### 依存関係のインストール

```bash
npm install
```

electron-builderは開発依存関係として含まれています。

## ビルドコマンド

### 全プラットフォーム向けビルド

```bash
npm run build
```

### Windows向けビルド

```bash
npm run build-win
```

出力先: `dist/` ディレクトリ
- インストーラー: `.exe` ファイル
- ポータブル版: `.zip` ファイル

### macOS向けビルド

```bash
npm run build-mac
```

出力先: `dist/` ディレクトリ
- `.dmg` ファイル
- `.app` バンドル

### Linux向けビルド

```bash
npm run build-linux
```

出力先: `dist/` ディレクトリ
- `.deb` パッケージ (Debian/Ubuntu)
- `.rpm` パッケージ (RedHat/CentOS)

## ビルド設定のカスタマイズ

`package.json` の `build` セクションで設定をカスタマイズできます：

```json
{
  "build": {
    "appId": "com.example.zoltraak-desktop-prototype",
    "copyright": "Copyright 2023",
    "mac": {
      "category": "public.app-category.productivity"
    },
    "win": {
      "target": "nsis"
    },
    "linux": {
      "target": "deb"
    }
  }
}
```

### 主な設定項目

- `appId`: アプリケーションの一意識別子
- `copyright`: 著作権情報
- `mac.category`: macOSのアプリケーションカテゴリ
- `win.target`: Windowsのパッケージ形式 (nsis, portable, etc.)
- `linux.target`: Linuxのパッケージ形式 (deb, rpm, appimage, etc.)

## 配布物

ビルド完成后、`dist/` ディレクトリに以下のファイルが生成されます：

- プラットフォーム固有のインストーラー
- アプリケーション本体
- 更新用のブロックマップファイル

## デバッグビルド

開発時のデバッグには以下のコマンドを使用します：

```bash
npm start
```

## 注意事項

1. **初回ビルド**: 初回ビルド時はElectronのバイナリダウンロードが行われるため時間がかかります
2. **コード署名**: 本番配布時はコード署名を設定してください
3. **自動更新**: 自動更新機能を実装する場合は別途設定が必要です
4. **環境変数**: 本番ビルドでは開発用の環境変数が含まれないよう注意してください

## トラブルシューティング

### ビルドが失敗する場合

1. Node.jsのバージョンを確認してください（推奨: LTS版）
2. `node_modules` を削除して再インストールしてください
3. ディスク容量を確認してください（ビルドには数GB必要）

### 特定プラットフォームのビルドが失敗する場合

1. 対応するビルドツールがインストールされているか確認してください
   - Windows: Visual Studio Build Tools
   - macOS: Xcode Command Line Tools
   - Linux: build-essential

2. 権限の問題がないか確認してください

## 詳細情報

- electron-builder公式ドキュメント: https://www.electron.build/
- Electron公式ドキュメント: https://www.electronjs.org/
