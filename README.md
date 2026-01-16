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
git clone <repository-url>
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

ブラウザで http://localhost:3000 を開いてコメントの流れを確認できます。

### Electronオーバーレイについて

- デスクトップ全体に透明なオーバーレイウィンドウを表示
- マウス操作は背後のアプリケーションに透過（クリックスルー）
- 全てのワークスペース、フルスクリーンアプリの上でも表示

## 表示仕様

| 項目 | 値 |
|------|-----|
| フォント | Noto Sans JP, 24-40px（文字数で自動調整） |
| 文字色 | ユーザーごとの固有色（黒縁取り） |
| アニメーション | 右から左へ8秒で横断 |
| 背景 | 透明 |
| レーン | 10本（画面高さ10%〜90%の範囲） |
| コメント数 | 左下に💬アイコン付きで表示 |

## 対応機能

### 絵文字対応

- 標準絵文字（Unicode絵文字）
- Slackカスタム絵文字
- 日本語名のカスタム絵文字（例: `:お疲れさま:`）

### テキスト処理

自動的に以下のSlack記法を処理:

- コードブロック → `[コード]` に置換
- リンク → `[リンク]` に置換
- メンション → 除去
- テキスト装飾（`*太字*`, `_斜体_`, `~打ち消し~`）→ 装飾記号を除去
- 引用、リスト → 整形

### フォントサイズ自動調整

| 文字数 | サイズ |
|--------|--------|
| 1〜10文字 | 40px |
| 11〜30文字 | 32px |
| 31文字以上 | 24px |

## 開発者向け情報

```bash
# 型チェック
npm run typecheck

# テスト実行
npm run test

# テスト監視モード
npm run test:watch
```

## トラブルシューティング

### コメントが表示されない

- Slackアプリがチャンネルに招待されているか確認
- スレッドURLが正しいか確認（チャンネルのURLではなくスレッドのURL）
- コンソールにエラーが出ていないか確認

### WebSocket接続エラー

- サーバーが起動しているか確認
- ポート3000が他のアプリで使用されていないか確認

### Electronウィンドウが表示されない

- `npm run dev:overlay` でサーバーとElectronが両方起動しているか確認
- macOSの場合、アクセシビリティ権限が必要な場合があります

## ライセンス

MIT
