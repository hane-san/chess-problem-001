# 共通の開発手順（chess-problem-001）

共通契約は [AGENTS.md](../AGENTS.md)、Claude Codeの入口は [CLAUDE.md](../CLAUDE.md)。ほかのゲームと同じ手順・権限の境界を使い、ゲームの仕様は共有しない。

## 作業の始め方

1. `git status --short`、`git log -5 --oneline`、`git fetch origin`。他者の未コミット変更は消さない。
2. README・対象Issue・開いているPRを読み、同じファイルの並行作業を調整する。
3. `npm ci` → `npm run check:vendor && npm run validate && npm run test:unit` で基準を確認。
4. 最新 `origin/main` から作業ブランチ（`type/issue-topic`）。main直書き・force push・auto-mergeは禁止。

## 採用判断からmainまで

1. 人間がChatで採用 → Issue（目的・受入条件・対象外・リスク・試遊項目）。
2. Codex / Claude Codeが作業ブランチで実装 → PR（Issue、差分、検証SHA、実行テスト、未検証、iPhone試遊項目）。
3. CI（`build`）とリスク別レビュー。Claude Codeが監督する場合は `.claude/skills/steward/SKILL.md` の手順と記録形式を使う。
4. 人間がiPhoneで試遊し、mainへマージ。mainへのpushでPagesが公開される。公開後に表示と主要操作を確認する。

## 後日人間が行う管理画面設定（未確認）

- Settings → Rules：main対象でPR必須・`build` 必須・force push禁止・削除制限。現在の設定状態はこのrepoでは未確認。
- 夜間巡回をClaude Codeのスケジュール実行で行う場合も、マージは人間が行う。
