# Claude Code

> Claude CodeでGLM Coding Planを使用する方法

Claude Codeは、ターミナル上で動作するエージェント型コーディングツールです。コードベースを理解し、ルーチンタスクの実行、複雑なコードの説明、gitワークフローの処理など、自然言語コマンドを通じてより速くコーディングできるようサポートします。

<Tip>
  Claude Codeは[GLM Coding Plan](https://z.ai/subscribe?utm_source=zai\&utm_medium=link\&utm_term=devpack-integration\&utm_campaign=Platform_Ops&_channel_track_key=w3mNdY8g)と組み合わせることでさらに強力になります。低コストで3倍の使用量を実現。より多くのトークンと安定した信頼性で、より速くコーディングし、よりスマートにデバッグし、ワークフローをシームレスに管理できます。

  **ブラックフライデー**: 初回GLM Coding Plan購入で50%オフ、さらに20%/30%の追加割引！
</Tip>

<Warning>
  2025-09-30以前にサービスを利用したユーザーへ: \
  GLM Coding Planのデフォルトモデルは、シームレスなユーザー体験を維持しながらGLM-4.6にアップグレードされました。\
  ただし、以前`settings.json`でGLM-4.5の固定モデルマッピングを設定していた場合は、以下のFAQの「使用モデルの切り替え方法」セクションを参照して調整し、最新のGLM-4.6モデルを使用していることを確認してください。
</Warning>

## ステップ1: Claude Codeのインストール

<Tabs>
  <Tab title="推奨インストール方法">
    前提条件: [Node.js 18以降](https://nodejs.org/en/download/)

    ```
    # Claude Codeをインストール
    npm install -g @anthropic-ai/claude-code

    # プロジェクトに移動
    cd your-awesome-project

    # 完了
    claude
    ```
  </Tab>

  <Tab title="Cursorガイド付きインストール方法">
    npmに慣れていないがCursorを使用している場合は、Cursorでコマンドを入力すると、CursorがClaude Codeのインストールをガイドしてくれます。

    ```bash  theme={null}
    https://docs.anthropic.com/en/docs/claude-code/overview Help me install Claude Code
    ```
  </Tab>
</Tabs>

<Note>
  **注意**: インストール中に権限の問題が発生した場合は、`sudo`（MacOS/Linux）を使用するか、コマンドプロンプトを管理者として実行（Windows）してインストールコマンドを再実行してください。
</Note>

## ステップ2: GLM Coding Planの設定

<Steps>
  <Step title="APIキーの取得">
    * [Z.AI Open Platform](https://z.ai/model-api)にアクセスし、登録またはログインします。
    * [APIキー](https://z.ai/manage-apikey/apikey-list)管理ページでAPIキーを作成します。
    * APIキーをコピーして使用します。
  </Step>

  <Step title="環境変数の設定">
    **macOS Linux**または**Windows**で、**以下のいずれかの方法**で環境変数を設定します:

    <Tip>
      **注意**: 環境変数を設定する際、一部のコマンドは出力を表示しません。エラーが表示されなければ正常です。
    </Tip>

    <Tabs>
      <Tab title="自動化Coding Tool Helper">
        Coding Tool Helperは、お気に入りの**コーディングツール**に**GLM Coding Plan**を素早く読み込むコーディングツールコンパニオンです。インストールして実行し、画面の指示に従ってツールの自動インストール、プランの設定、MCPサーバーの管理を行います。

        ```bash  theme={null}
        # ターミナルでCoding Tool Helperを直接実行
        npx @z_ai/coding-helper
        ```

        詳細については、[Coding Tool Helper](/devpack/tool/coding-tool-helper)ドキュメントを参照してください。

        ![説明](https://cdn.bigmodel.cn/markdown/1764749390483image.png?attname=image.png)
      </Tab>

      <Tab title="自動化スクリプト">
        ターミナルで以下のコマンドを実行するだけです \
        注意: macOS Linux環境のみサポートされており、この方法はWindowsをサポートしていません

        ```bash  theme={null}
        curl -O "https://cdn.bigmodel.cn/install/claude_code_zai_env.sh" && bash ./claude_code_zai_env.sh
        ```

        スクリプトは自動的に`~/.claude/settings.json`を変更し、以下の環境変数を設定します（手動で編集する必要はありません）:

        ```json  theme={null}
        {
            "env": {
                "ANTHROPIC_AUTH_TOKEN": "your_zai_api_key",
                "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
                "API_TIMEOUT_MS": "3000000"
            }
        }
        ```
      </Tab>

      <Tab title="手動設定">
        以前Claude Codeの環境変数を設定したことがある場合は、以下のように手動で設定できます。変更を有効にするには新しいウィンドウが必要です。

        <CodeGroup>
          ```bash MacOS & Linux theme={null}
          # Claude Code設定ファイル `~/.claude/settings.json` を編集
          # envフィールドのANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKENを追加または変更
          # `your_zai_api_key`を前のステップで取得したAPIキーに置き換えてください

          {
              "env": {
                  "ANTHROPIC_AUTH_TOKEN": "your_zai_api_key",
                  "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
                  "API_TIMEOUT_MS": "3000000"
              }
          }
          ```

          ```cmd Windows Cmd theme={null}
          # Cmdで以下のコマンドを実行
          # `your_zai_api_key`を前のステップで取得したAPIキーに置き換えてください

          setx ANTHROPIC_AUTH_TOKEN your_zai_api_key
          setx ANTHROPIC_BASE_URL https://api.z.ai/api/anthropic
          ```

          ```powershell Windows PowerShell theme={null}
          # PowerShellで以下のコマンドを実行
          # `your_zai_api_key`を前のステップで取得したAPIキーに置き換えてください

          [System.Environment]::SetEnvironmentVariable('ANTHROPIC_AUTH_TOKEN', 'your_zai_api_key', 'User')
          [System.Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', 'https://api.z.ai/api/anthropic', 'User')
          ```
        </CodeGroup>
      </Tab>
    </Tabs>
  </Step>
</Steps>

## ステップ3: Claude Codeの開始

設定が完了したら、ターミナルまたはcmdで**Claude Code**を使用開始できます:

```
cd your-project-directory
claude
```

> 「このAPIキーを使用しますか」と表示されたら、「はい」を選択してください。

起動後、以下のようにClaude Codeにフォルダ内のファイルへのアクセス権限を付与してください:

![説明](https://cdn.bigmodel.cn/markdown/1753631613096claude-2.png?attname=claude-2.png)

これでClaude Codeを開発に使用できます！

***

## FAQ

### 使用モデルの切り替え方法

<Check>
  Claude Code内部モデル環境変数とGLMモデルのマッピング。デフォルト設定は以下の通りです:

  * `ANTHROPIC_DEFAULT_OPUS_MODEL`: `GLM-4.6`
  * `ANTHROPIC_DEFAULT_SONNET_MODEL`: `GLM-4.6`
  * `ANTHROPIC_DEFAULT_HAIKU_MODEL`: `GLM-4.5-Air`
</Check>

調整が必要な場合は、設定ファイル（例: Claude Codeの\~/.claude/settings.json）を直接変更して他のモデルに切り替えることができます。

<Note>
  モデルマッピングを手動で調整することは一般的に推奨されません。モデルマッピングをハードコーディングすると、GLM Coding Planのモデルが更新された際に最新モデルへの自動更新が不便になります。
</Note>

<Note>
  最新のデフォルトマッピングを使用したい場合（古いモデルマッピングを設定している既存ユーザー向け）、`settings.json`のモデルマッピング設定を削除するだけで、Claude Codeは自動的に最新のデフォルトモデルを使用します。
</Note>

1. `~/.claude/settings.json`に以下の内容を設定:

```text  theme={null}
{
  "env": {
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.6",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-4.6"
  }
}
```

2. 新しいターミナルウィンドウを開き、`claude`を実行してClaude Codeを起動し、`/status`を入力して現在のモデル状態を確認します。

![説明](https://cdn.bigmodel.cn/markdown/1759420390607image.png?attname=image.png)

### Vision Search Reader MCP

[Vision MCP Server](../mcp/vision-mcp-server)、[Search MCP Server](../mcp/search-mcp-server)、[Web Reader MCP Server](../mcp/reader-mcp-server)のドキュメントを参照してください。設定後、Claude Codeで使用できます。

### 手動設定が機能しない場合

`~/.claude/settings.json`設定ファイルを手動で変更したが変更が反映されない場合は、以下のトラブルシューティング手順を参照してください。

* すべてのClaude Codeウィンドウを閉じ、新しいコマンドラインウィンドウを開き、再度`claude`を実行して起動します。
* 問題が解決しない場合は、`~/.claude/settings.json`ファイルを削除してから環境変数を再設定してください。Claude Codeは自動的に新しい設定ファイルを生成します。
* 設定ファイルのJSON形式が正しいことを確認し、変数名をチェックし、カンマの過不足がないことを確認してください。オンラインJSONバリデーターツールを使用して確認できます。

### 推奨Claude Codeバージョン

最新バージョンのClaude Codeを使用することを推奨します。以下のコマンドで現在のバージョンを確認し、アップグレードできます:

> Claude Code 2.0.14およびその他のバージョンとの互換性を確認済みです。

```bash  theme={null}
# 現在のバージョンを確認
claude --version

2.0.14 (Claude Code)

# 最新版にアップグレード
claude update
```


---

> このドキュメントのナビゲーションやその他のページを見つけるには、llms.txtファイルを取得してください: https://docs.z.ai/llms.txt