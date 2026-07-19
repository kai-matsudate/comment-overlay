# Security Policy

## 対応方針

セキュリティ修正は、原則として最新の `main` ブランチを対象に行います。現在、過去バージョンごとの長期サポートは提供していません。

## 脆弱性の報告

脆弱性の可能性がある問題は、公開Issueへ詳細を書き込まないでください。

1. [Security Advisories](https://github.com/kai-matsudate/comment-overlay/security/advisories) を開く
2. **Report a vulnerability** が表示される場合は、Private vulnerability reportingから報告する
3. 表示されない場合は、攻撃手順や機密情報を含めずに「セキュリティ問題の非公開連絡先を確認したい」とだけ記載したIssueを作成する

報告には、可能な範囲で次の情報を含めてください。

- 問題の概要と想定される影響
- 再現手順または概念実証
- 影響を受けるバージョンやコミット
- 回避策や修正案（分かる場合）

受領後、内容を確認し、対応方針と公開時期を報告者と調整します。

## 認証情報を誤って公開した場合

Slackトークンや復号化パスワードを公開した場合は、Git履歴からの削除だけでは不十分です。

1. Slack Appの管理画面で該当トークンを失効する
2. 新しいトークンを発行する
3. `credentials.encrypted` を再生成する
4. 新しい暗号化ファイルとパスワードを、別々の安全な経路で利用者へ共有する
5. 必要に応じて、公開された履歴やログから機密情報を削除する

`credentials.encrypted`、Slackトークン、復号化パスワードは公開IssueやPull Requestへ添付しないでください。
