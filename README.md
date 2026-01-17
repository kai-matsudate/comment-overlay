# Comment Overlay

Slackスレッドのコメントをニコニコ動画風にデスクトップ上にオーバーレイ表示するツール。Electronを使用して透明なオーバーレイウィンドウを表示し、全てのアプリケーション上でコメントを流すことができます。

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

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```
SLACK_BOT_TOKEN=xoxb-xxxx  # 手順4で取得したトークン
SLACK_APP_TOKEN=xapp-xxxx  # 手順2で取得したトークン
```

#### 複数人での利用

トークンの管理者と利用者間で暗号化した環境変数ファイルを共有してください。

**管理者の場合**:

1. `.env` ファイルを作成・編集:

```bash
cp .env.example .env
# トークンを設定
```

2. 暗号化:

```bash
npm run encrypt-env
```

スクリプトが自動的にパスワードを生成し、画面に表示します。

3. `.env.encrypted` と表示されたパスワードを安全に共有（オフラインで）

**利用者の場合**:

1. トークン管理者から `.env.encrypted` とパスワードを受け取る
2. `.env.encrypted` をプロジェクトルートに配置
3. 復号化:

```bash
export ENCRYPTION_PASSWORD='your-password'
npm run decrypt-env
```

### 7. Slackチャンネルへの招待

監視したいチャンネルで以下を実行:

```
/invite @Comment Overlay
```

（アプリ名は作成時に設定した名前に置き換えてください）

## 使い方

### オーバーレイの起動

監視したいスレッドのURLを引数に指定して起動:

```bash
npm run dev:overlay -- "https://xxx.slack.com/archives/C1234567890/p1705200000000000"
```

スレッドURLは、Slackでスレッドを開き「リンクをコピー」で取得できます。

このコマンドでサーバーとElectronオーバーレイが同時に起動し、デスクトップ全体に透明なオーバーレイウィンドウが表示されます。

#### サーバーのみ起動（ブラウザで確認）

```bash
npm run dev "https://xxx.slack.com/archives/C1234567890/p1705200000000000"
```

ブラウザで http://localhost:8000 を開いてコメントの流れを確認できます。

