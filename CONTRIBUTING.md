# Contributing to Comment Overlay

Comment Overlayへの改善提案や不具合報告、Pull Requestを歓迎します。

## Issueを作成する前に

- 既存のIssueに同じ内容がないか確認してください
- 不具合の場合は、再現手順、期待した結果、実際の結果、Node.jsとOSのバージョンを記載してください
- Slackトークン、復号化パスワード、非公開のスレッドURLやコメントを貼らないでください
- セキュリティ上の問題は公開Issueにせず、[SECURITY.md](SECURITY.md) の手順で報告してください

## 開発環境の準備

Node.js 20以上が必要です。

```bash
git clone https://github.com/kai-matsudate/comment-overlay.git
cd comment-overlay
npm install
npm run build
```

## 開発時の確認

変更内容に応じて、次のコマンドを実行してください。

```bash
npm test
npm run typecheck:all
npm run build:all
```

ブラウザ向けの生成物である次のファイルはGit管理対象外です。TypeScript側のソースを変更し、`npm run build` で動作を確認してください。

- `public/js/app.js`
- `public/js/app.js.map`
- `public/setup/js/app.js`
- `public/setup/js/app.js.map`

## 実装方針

- 変更の目的に必要な最小範囲へ絞る
- 既存の責務を保ち、不要な抽象化を増やさない
- 振る舞いを変更する場合は、対応するテストを追加・更新する
- Slackから受け取った値を、検証やエスケープなしにHTMLへ挿入しない
- 認証情報や利用者のデータをログ、fixture、スナップショットへ含めない

## Pull Request

Pull Requestには次の内容を記載してください。

- 何を、なぜ変更したか
- 主な変更点
- 実施したテストや手動確認
- 影響範囲や既知の制約

ひとつのPull Requestには、ひとつの目的だけを含めてください。
