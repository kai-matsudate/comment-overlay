# Comment Preview

SlackスレッドのコメントをOBSでニコニコ動画風にオーバーレイ表示するツール。

## 必要なもの

- Node.js 20以上
- OBS Studio
- Slackワークスペースの管理者権限

## セットアップ

### 1. Slack Appの作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **Create New App** → **From scratch** を選択
3. アプリ名（例: `Comment Preview`）を入力し、ワークスペースを選択

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
3. ページ上部の **Install to Workspace** をクリック
4. 許可画面で **許可する** をクリック
5. 表示された `xoxb-` で始まるトークンをメモ

### 5. アプリのインストール

```bash
git clone <repository-url>
cd comment-preview
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

### 7. Slackチャンネルへの招待

監視したいチャンネルで以下を実行:

```
/invite @Comment Preview
```

（アプリ名は作成時に設定した名前に置き換えてください）

## 使い方

### サーバーの起動

監視したいスレッドのURLを引数に指定して起動:

```bash
# 開発時（ホットリロード有効）
npm run dev "https://xxx.slack.com/archives/C1234567890/p1705200000000000"

# 本番実行
npm run build && npm start "https://xxx.slack.com/archives/C1234567890/p1705200000000000"
```

スレッドURLは、Slackでスレッドを開き「リンクをコピー」で取得できます。

### OBSの設定

1. OBS Studioを開く
2. ソース → **+** → **ブラウザ** を選択
3. 以下を設定:
   - URL: `http://localhost:3000`
   - 幅: `1920`
   - 高さ: `1080`
4. **OK** をクリック

これで、Slackスレッドに投稿されたコメントがOBS上に流れるように表示されます。

## 表示仕様

| 項目 | 値 |
|------|-----|
| フォント | 32px, sans-serif |
| 文字色 | 白（黒縁取り） |
| アニメーション | 右から左へ8秒で横断 |
| 背景 | 透明 |

## トラブルシューティング

### コメントが表示されない

- Slackアプリがチャンネルに招待されているか確認
- スレッドURLが正しいか確認（チャンネルのURLではなくスレッドのURL）
- コンソールにエラーが出ていないか確認

### WebSocket接続エラー

- サーバーが起動しているか確認
- ポート3000が他のアプリで使用されていないか確認

## ライセンス

MIT
