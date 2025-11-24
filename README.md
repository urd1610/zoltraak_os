# Zoltraak Desktop Prototype

Electronベースのデスクトップスタイルランチャーのプロトタイプです。

## 概要

このプロジェクトは、Electronを使用してデスクトップアプリケーションスタイルのランチャーを模倣するプロトタイプです。作業ディレクトリの選択や設定管理などの機能を提供します。

## インストール

```bash
# 依存関係をインストール
npm install
```

## 使い方

```bash
# アプリケーションを起動
npm start
```

## 機能

- 作業ディレクトリの選択と管理
- 設定の保存と読み込み
- デスクトップスタートのUI

## プロジェクト構造

```
zoltraak_os/
├── src/
│   ├── main.js      # メインプロセス
│   └── preload.js   # プリロードスクリプト
├── public/          # 静的ファイル
├── package.json     # プロジェクト設定
└── README.md        # このファイル
```

## 開発

- **フレームワーク**: Electron
- **言語**: JavaScript (CommonJS)
- **ライセンス**: ISC

## 設定

設定はユーザーデータディレクトリに `settings.json` として保存されます。

## ライセンス

ISC
