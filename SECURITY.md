# Security Policy

## Supported Versions

現在サポートされているバージョン:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

脆弱性を発見した場合は、以下の方法で報告をお願いします。

### 報告方法

1. **GitHub Issues を使用しないでください** - セキュリティ上の問題を公開Issueで報告しないでください
2. **Private vulnerability reporting** を使用してください - GitHubの[Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)機能を使用して非公開で報告してください

### 報告に含めるべき情報

- 脆弱性の詳細な説明
- 再現手順
- 影響範囲の評価
- 可能であれば、修正案

### 対応について

- 報告を受領後、5営業日以内に確認の連絡をします
- 脆弱性が確認された場合、修正パッチのリリースまで報告者と連携します
- 修正完了後、報告者への謝辞を行います（希望がない場合を除く）

## Security Considerations

### 設計上のセキュリティ

このアプリケーションはローカル環境での使用を前提として設計されています:

1. **ローカル使用前提**: サーバーは `localhost:3000` でのみリッスンし、外部からのアクセスを想定していません

2. **WebSocket Origin検証**: WebSocket接続は以下のOriginからのみ許可されます:
   - `http://localhost`
   - `http://127.0.0.1`
   - `file://` (Electronアプリ)

3. **XSS対策**:
   - Slackメッセージはサニタイズされてから表示されます
   - テキストは `createTextNode()` / `textContent` を使用して安全に表示されます
   - 絵文字URLは `https://` または `http://` スキームのみ許可されます

4. **Electronセキュリティ**:
   - `nodeIntegration: false` でNode.js APIへの直接アクセスを無効化
   - `contextIsolation: true` でコンテキスト分離を有効化

### 既知の制限事項

以下の制限事項を認識した上でご利用ください:

1. **ローカルネットワーク**: サーバーがバインドするポートは同一ホスト上の他のアプリケーションからアクセス可能です。信頼できない環境での使用は推奨しません。

2. **Slackトークン**: `.env` ファイルに保存されるSlackトークンは適切に保護してください。このファイルをGitリポジトリにコミットしないでください（`.gitignore` で除外済み）。

3. **メモリキャッシュ**: ユーザー情報のキャッシュは現在TTLが設定されていません。長時間の運用ではメモリ使用量が増加する可能性があります。

## Dependencies

依存関係のセキュリティは定期的に確認しています:

```bash
npm audit
```

重大な脆弱性が発見された場合は、速やかにアップデートを行います。
