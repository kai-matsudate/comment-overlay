# Comment Overlay

Slackスレッドのコメントをニコニコ動画風にデスクトップ上にオーバーレイ表示するツール。

## 必要なもの

- Node.js 20以上
- Slackワークスペースの管理者権限

## セットアップ

### 1. Slack Appの作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **Create New App** → **From scratch** を選択
3. アプリ名（例: `Comment Overlay`）を入力し、ワークスペースを選択

### 2. Socket Modeの有効化

1. 左メニュー **Socket Mode** をクリック
2. **Enable Socket Mode** をONにする
3. Token名を入力（例: `socket-token`）→ **Generate**
4. 表示された `xapp-` で始まるトークンをメモ（後で使用）

### 3. Event Subscriptionsの設定

1. 左メニュー **Event Subscriptions** をクリック
2. **Enable Events** をONにする
3. **Subscribe to bot events** を展開し、以下を追加:
   - `message.channels`
   - `message.groups`
4. **Save Changes** をクリック

### 4. OAuth & Permissionsの設定

1. 左メニュー **OAuth & Permissions** をクリック
2. **Scopes** セクションの **Bot Token Scopes** に以下を追加:
   - `channels:history`
   - `groups:history`
   - `emoji:read`
   - `users:read`
3. ページ上部の **Install to Workspace** をクリック
4. 許可画面で **許可する** をクリック
5. 表示された `xoxb-` で始まるトークンをメモ

### 5. アプリのインストール

```bash
git clone git@github.com:kai-matsudate/comment-overlay.git
cd comment-overlay
npm install
```

### 6. 環境変数の設定

#### 管理者の場合（トークンを管理する人）

暗号化スクリプトを実行すると、対話形式でトークンを入力できます:

```bash
npm run encrypt-env
# → SLACK_BOT_TOKEN を入力してください: (入力は表示されません)
# → SLACK_APP_TOKEN を入力してください: (入力は表示されません)
# → ✓ Encrypted to .env.encrypted
# → パスワード: xxxxxx
```

生成された `.env.encrypted` とパスワードを利用者に共有してください。

#### 利用者の場合

1. トークン管理者から `.env.encrypted` とパスワードを受け取る
2. `.env.encrypted` をプロジェクトルートに配置
3. 「使い方」の手順に進む（WebGUIで復号化を行います）

### 7. Slackチャンネルへの招待

監視したいチャンネルで以下を実行:

```
/invite @Comment Overlay
```

（アプリ名は作成時に設定した名前に置き換えてください）

## 使い方

### セットアップウィザードの起動

```bash
npm run setup
```

ブラウザで http://localhost:8001 が自動的に開き、3ステップのセットアップウィザードが表示されます。

1. **Step 1: 環境変数の復号化**（`.env.encrypted`がある場合のみ）
   - 管理者から共有されたパスワードを入力
   - 「復号化」ボタンをクリック

2. **Step 2: スレッドURLの入力**
   - 監視したいSlackスレッドのURLを入力
   - URLはSlackでスレッドを開き「リンクをコピー」で取得

3. **Step 3: オーバーレイの起動**
   - 「起動」ボタンをクリック
   - デスクトップ全体に透明なオーバーレイウィンドウが表示されます

