# Comment Overlay

Slackスレッドのコメントをニコニコ動画風にデスクトップ上にオーバーレイ表示するツール。

## 必要なもの

- Node.js 20以上
- Slackワークスペースの管理者権限

## セットアップ

### 1. Manifest からアプリを作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **Create New App** → **From an app manifest** を選択
3. インストール先のワークスペースを選択 → **Next**
4. 表示されている **JSON** タブに `slack-app-manifest.json` の内容をすべて貼り付け → **Next**
5. 設定内容を確認して **Create**

アプリ名を変えたい場合は、貼り付けたJSONの `name` および `display_name` を編集してください。

### 2. App-Level Token（`xapp-`）の生成

Socket Mode 用のトークンはManifestに含められないため、手動で生成します。

1. 左メニュー **Basic Information** → **App-Level Tokens** → **Generate Token and Scopes**
2. Token名を入力（例: `socket-token`）し、Scope に `connections:write` を追加 → **Generate**
3. 表示された `xapp-` で始まるトークンをメモ（後で使用）

必要に応じて **Display Information** からアプリのアイコンを設定してください。

### 3. インストールして Bot Token（`xoxb-`）を取得

1. 左メニュー **Install App** → **Install to ${Your Workspace Name}** をクリック
2. 許可画面で **許可する** をクリック
3. 表示された `xoxb-` で始まるトークンをメモ

### 4. サーバーをビルド

```bash
git clone git@github.com:kai-matsudate/comment-overlay.git
cd comment-overlay
npm install
npm run build
```

### 5. 環境変数の設定

#### 管理者の場合（Slack トークンを管理する人）

暗号化スクリプトを実行すると、対話形式でトークンを入力できます:

```bash
npm run encrypt-credentials
# SLACK_BOT_TOKEN (xoxb-...): 🔒️ → 手順3 のインストール時に取得したトークンを入力してください
# SLACK_APP_TOKEN (xapp-...): 🔒️ → 手順2 で生成したトークンを入力してください
# → ✓ Encrypted to credentials.encrypted
# → パスワード: xxxxxx
```

生成された `credentials.encrypted` とパスワードを Comment Overlay の利用者に共有してください。

#### Comment Overlay の利用者の場合

1. トークン管理者から `credentials.encrypted` とパスワードを受け取る
2. `credentials.encrypted` をプロジェクトルートに配置
3. 「使い方」の手順に進む（WebGUIで復号化を行います）

### 6. Slackチャンネルへの招待

実況したいチャンネルで以下を実行:

```
/invite @Comment Overlay
```

（アプリ名は作成時に設定した名前に置き換えてください）

## 使い方

### セットアップウィザードの起動

```bash
npm start
```

ブラウザで http://localhost:8001 が自動的に開き、3ステップのセットアップウィザードが表示されます。

1. **Step 1: 認証情報の復号化**（`credentials.encrypted`がある場合のみ）
   - 管理者から共有されたパスワードを入力
   - 「復号化」ボタンをクリック

2. **Step 2: スレッドURLの入力**
   - 監視したいSlackスレッドのURLを入力
   - URLはSlackでスレッドを開き「リンクをコピー」で取得

3. **Step 3: オーバーレイの起動**
   - 「起動」ボタンをクリック
   - デスクトップ全体に透明なオーバーレイウィンドウが表示されます

