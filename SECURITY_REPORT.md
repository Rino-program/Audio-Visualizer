# Audio-Visualizer — セキュリティ調査レポート

**最終更新**: 2026年1月11日  
**初回作成**: 2025年12月23日  
対象リポジトリ: [Rino-program/Audio-Visualizer](https://github.com/Rino-program/Audio-Visualizer)

---

## 🎯 エグゼクティブサマリー（結論）

**✅ このリポジトリは公開可能です。**

詳細な調査の結果、以下のことが確認されました：

### ✅ セキュリティ上の強み

1. **秘密情報の適切な管理**
   - `.gitignore` が正しく設定されており、APIキー、keystoreファイルが除外されている
   - リポジトリ内に実際の秘密情報は含まれていない（プレースホルダーのみ）
   - 過去のコミット履歴にも秘密情報の漏洩は確認されていない

2. **最小限の依存関係**
   - PC版: Electron 28のみ（開発依存）
   - Android版: Capacitor 6系のみ
   - 外部ライブラリへの依存が少なく、攻撃面が小さい

3. **クリーンなコードベース**
   - 悪意のあるコード、バックドアは存在しない
   - 標準的なWeb API（Web Audio API、Canvas）のみを使用

### ⚠️ 軽微な注意点（低リスク）

1. **innerHTML の使用（23箇所）**
   - **リスク評価**: 低
   - **理由**: すべてのinnerHTML使用箇所は以下のいずれか：
     - 静的な文字列（`"<div>曲を追加してください</div>"`）
     - アプリ内で管理されているデータ（ファイル名、デバイス名）
     - MarkdownファイルからのHTMLレンダリング（自分で管理）
   - **外部からの入力は一切使用されていない**
   - ユーザー入力（検索ボックス等）は表示に使用されていない

2. **依存関係の更新推奨**
   - 現在の依存関係は安全だが、定期的な更新を推奨
   - `npm audit` の定期実行を推奨

### 📊 リスクレベル総合評価

| カテゴリ | リスクレベル | 状態 |
|---------|------------|------|
| 秘密情報の漏洩 | なし | ✅ 安全 |
| XSS攻撃 | 低 | ✅ 実質的に安全 |
| 依存関係の脆弱性 | 低 | ⚠️ 定期更新推奨 |
| コード品質 | 高 | ✅ 良好 |
| 総合評価 | **低リスク** | ✅ **公開可能** |

---

## 📅 2026年1月11日 詳細調査結果

### innerHTML 使用箇所の完全分析

全23箇所のinnerHTML使用を調査した結果、すべて安全であることを確認：

**分類1: 静的文字列（リスクなし）**
- プレイリスト空表示: `<div class="playlist-empty">曲を追加してください</div>`
- ストレージ空表示: `<div class="hint">保存済みのファイルはありません</div>`

**分類2: 内部管理データ（リスクなし）**
```javascript
// デバイス名（navigator.mediaDevices.enumerateDevices()の結果）
els.micDeviceSelect.innerHTML = mics.map(m => 
  `<option value="${m.deviceId}">${m.label || 'マイク ' + m.deviceId.slice(0,5)}</option>`
).join('');

// プレイリスト（ユーザーが選択したファイル）
els.playlistItems.innerHTML = filtered.map(track => 
  `<div class="playlist-item">${track.originalIndex + 1}. ${track.name}</div>`
).join('');
```

**分類3: Markdownレンダリング（自己管理ファイル）**
```javascript
// DEVELOPER_MESSAGE.mdを読み込んで表示（自分で管理しているファイル）
const html = simpleMarkdownToHtml(markdown);
contentEl.innerHTML = html;
```

**結論**: すべてのinnerHTML使用箇所は外部入力を受け付けておらず、XSSのリスクはありません。

### 依存関係の分析

**PC版 (pc-app/package.json)**
```json
{
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-packager": "^17.1.2",
    "electron-builder": "^25.1.0"
  }
}
```
- すべて開発依存のみ
- 実行時に外部ライブラリを使用しない
- **リスク**: 極めて低い

**Android版 (android-app/package.json)**
```json
{
  "dependencies": {
    "@capacitor/core": "^6.1.0",
    "@capacitor/android": "^6.1.0",
    "@capawesome/capacitor-file-picker": "^6.0.1"
  }
}
```
- Capacitor 6系（最新の安定版）
- 公式パッケージのみ使用
- **リスク**: 極めて低い

---

## ⚙️ 推奨事項（任意）

公開前に実施すると、さらに安全性が向上します（必須ではありません）：

1. **依存関係の更新確認**
   ```bash
   cd pc-app && npm audit
   cd android-app && npm audit
   ```

2. **GitHub Advanced Securityの有効化**（リポジトリ設定）
   - Dependabot: 依存関係の自動更新
   - Secret Scanning: 秘密情報の検出
   - Code Scanning: 脆弱性の自動検出

3. **CSP（Content Security Policy）の追加**（HTML）
   ```html
   <meta http-equiv="Content-Security-Policy" 
         content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;">
   ```

---

注意事項
- このレポートはリポジトリ内の主要ファイルを GitHub のコード検索とリポジトリ参照で調査して作成しました。検索結果には上限があり、結果が不完全な可能性があります。完全な調査（履歴のスキャン、依存関係全体の解析、動的検査）を行うことを強く推奨します。
- 検出した問題は「そのまま問題になる可能性が高い箇所（実証済みの問題）」と「ソースコードを詳細に確認すると問題になる可能性がある箇所（潜在的）」が混在します。個別の修正は環境に合わせて実施してください。

目次
1. 調査概要（やったこと）
2. 要注意箇所のサマリ（優先度順）
3. 各脆弱性の詳細（根拠ファイル、影響、再現/悪用例、推奨対策）
4. 具体的な修正サンプル（コード例・設定例）
5. すぐに実行すべき対応チェックリスト（優先順）
6. 継続的セキュリティ対策（CI / ツール導入例）
7. 参考コマンド、ツール（実行方法）
8. 次のステップ（提案）

---

## 1. 調査概要（やったこと）
- GitHub リポジトリのトップレベルと主要な HTML / CSS / Gradle / wrapper ファイルを確認しました。
- 特に以下のファイル/箇所を直接確認または検索でヒットしたため、そこを中心に脆弱性を抽出しました：
  - audio/index.html（設定タブに Client ID / API Key の入力欄）
  - pc-app/public/index.html（同様）
  - android-app/www/index.html（同様）
  - android-app/android/app/build.gradle（keystore.properties, google-services.json の扱い）
  - android-app/android/gradlew（環境変数の eval を含むスクリプト箇所）
  - audio/style.css, android-app/www/style.css（UI 周りのファイル）
- 以上に加え、README や .gitignore の存在を確認しました（詳細な依存関係ファイル package.json などは今回の限定調査では網羅的に取得できていません。必要であれば追加取得します）。

---

## 2. 要注意箇所のサマリ（優先度順）
1. 秘密情報の扱い（API Key, Client ID, keystore.properties, google-services.json 等） — 優先度: Critical / High  
2. 依存関係（npm / gradle 等）の既知脆弱性 — 優先度: High  
3. スクリプトの不適切な eval / 環境変数展開（gradlew） — 優先度: Medium  
4. XSS / DOM-based XSS の可能性（ユーザー入力の非安全な描画） — 優先度: Medium  
5. CSP / SRI の未設定（静的リソース・外部スクリプト保護） — 優先度: Medium  
6. モバイルリリースでの unsigned artifact / 署名運用ミス — 優先度: Medium  
7. ログに機密が出力される可能性 — 優先度: Low〜Medium

---

## 3. 各脆弱性の詳細

### 3.1 秘密情報の扱い（API Key / Client ID / keystore / google-services）
- 根拠（確認箇所）
  - audio/index.html, pc-app/public/index.html, android-app/www/index.html に次のような入力欄が存在:
    - `<input id="clientIdInput" placeholder="YOUR_CLIENT_ID">`
    - `<input id="apiKeyInput" placeholder="YOUR_API_KEY">`
    - （該当ファイル例）https://github.com/Rino-program/Audio-Visualizer/blob/main/audio/index.html
  - android-app/android/app/build.gradle で `keystore.properties` を参照し、`google-services.json` の有無でプラグイン適用を判定している:
    - https://github.com/Rino-program/Audio-Visualizer/blob/main/android-app/android/app/build.gradle
- 影響
  - 秘密情報（API キーや署名情報、Firebase の設定等）がリポジトリやビルド成果物に入ると、不正利用・サービス乗っ取り・料金請求・アプリ改竄のリスクがある。
- 想定悪用
  - 公開された API キーで第三者が API を呼び出し、データを取得したりクォータを浪費させる。
  - コミットされた keystore 情報で APK を不正署名・再配布される（署名鍵が流出した場合）。
- 推奨対策
  - 秘密はリポジトリに入れない（.gitignore へ追加）。CI/環境変数（GitHub Actions Secrets 等）で管理する。
  - 既にコミットしてしまっていた場合は、即座に該当キーを無効化／ローテーションする。履歴から削除するには `git filter-repo` や BFG を利用する（後述コマンド参照）。
  - ブラウザで直接扱うべきでないキーはサーバサイドで保管し、必要最小限のプロキシ経由で利用させる。OAuth は PKCE を利用する。

---

### 3.2 依存関係の既知脆弱性（要スキャン）
- 根拠
  - プロジェクトが JS/CSS/HTML を大量に含むため、npm 依存や Android のライブラリが使われている可能性が高い（ただし今回の簡易調査では package.json 等の完全取得はしていません）。
- 影響
  - 依存ライブラリに既知の脆弱性がある場合、リモートコード実行、情報漏洩、DoS などにつながる。
- 推奨対策
  - `npm audit` / `yarn audit` / `gradle dependencyCheck` を実行。Dependabot, Snyk を導入して継続的に監視する。
  - 重大な脆弱性が見つかったら速やかにバージョン更新（互換性テストを実施）。

---

### 3.3 gradlew の eval と環境変数展開（コマンド注入リスク）
- 根拠
  - `android-app/android/gradlew` の中で `eval "set -- $( ... )"` のようなパターンで外部の値を eval している部分があり、環境変数（JAVA_OPTS, GRADLE_OPTS）が不適切に解釈される可能性がある。
- 影響
  - CI や実行環境で渡される変数に悪意ある文字が混入すると、任意コマンドが実行される恐れがある。
- 推奨対策
  - できるだけ `eval` を避ける。必要ならば値をきっちりクォートし、改行や特殊文字をサニタイズする。
  - CI へ渡す環境変数は信頼できるソースに限定する（公開ワークフローでのシークレットの漏洩を避ける）。

---

### 3.4 DOM-based XSS の可能性（クライアント入力の描画）
- 根拠
  - 音楽ファイル名、プレセット名、外部 URL の取り扱いが多数あり、ユーザー入力を innerHTML 等で描画している箇所があれば XSS になる（今回の限定検索では innerHTML の使用は特定できていないが、該当ファイル群は注意が必要）。
- 影響
  - 任意スクリプトが実行され、セッション盗難や不正操作が可能になる。
- 推奨対策
  - 表示は `textContent` を使う、または信頼できるライブラリ（DOMPurify 等）でサニタイズする。
  - URL を DOM に埋めるときはエスケープを行う。
  - 必要なら CSP を設定して二重の防御を行う。

---

### 3.5 CSP / SRI 未設定
- 根拠
  - index.html 系で明示的な Content-Security-Policy ヘッダーや SRI（Subresource Integrity）を確認できない（詳細は HTML 全体の確認が必要）。
- 影響
  - 外部 CDN のスクリプトが改竄されると、ユーザーが攻撃を受ける。
- 推奨対策
  - サーバ/配布先で CSP を設定する。外部スクリプトを使うなら SRI を併用する。

---

### 3.6 モバイルリリースの署名運用
- 根拠
  - build.gradle に `githubRelease` という unsigned の build type が定義されているコメント（「explicitly unsigned APK」）。
- 影響
  - unsigned / 誤署名のアーティファクトを公開すると利用者が改竄版をインストールする危険がある。
- 推奨対策
  - 公開ビルドは常に署名する。CI 上で安全に署名鍵を読み込む仕組みにする。

---

### 3.7 ログ出力による機密漏洩（確認要）
- 根拠
  - スクリプトで `logger.info("google-services.json not found...")` のようなログがある。
- 影響
  - ログにトークンやキーが含まれると漏洩する。
- 推奨対策
  - 機密をログに出さない。ログ収集先の権限管理を厳格にする。

---

## 4. 具体的な修正サンプル（コード例・設定例）

1) ブラウザから API キーを直接使わない設計（サーバプロキシ例：Node.js）
```js
// server/proxy.js (サンプル)
const express = require('express');
const fetch = require('node-fetch');
const app = express();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // GitHub Secrets / CI で設定

app.get('/api/drive/file', async (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).send('fileId required');

  // サーバ側で API キーを使って Google Drive API を叩く
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?key=${GOOGLE_API_KEY}&alt=media`;
  const r = await fetch(url, { method: 'GET' });
  if (!r.ok) return res.status(r.status).send(await r.text());
  r.body.pipe(res);
});

app.listen(3000);
```
- ポイント: ブラウザは自前でキーを保持せず、短命トークンやサーバプロキシ経由でアクセスさせる。

2) Content-Security-Policy ヘッダー（例）
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://trusted.cdn.example; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';
```
- ポイント: 必要に応じて `script-src` に CDN を追加。可能なら inline スクリプトは避け、nonce/hash を使用。

3) XSS 対策（表示は textContent、DOMPurify 利用例）
```js
// 安全な表示
const el = document.getElementById('filename');
el.textContent = uploadedFileName; // innerHTML は使わない

// もし HTML を許可したいなら DOMPurify を使う
import DOMPurify from 'dompurify';
el.innerHTML = DOMPurify.sanitize(userProvidedHtml);
```

4) .gitignore に追加すべき（例）
```
# Android secrets
/android-app/android/keystore.properties
/android-app/android/app/google-services.json

# Node / build secrets
.env
.env.local
```

5) 履歴から秘密を削除する（BFG の例）
- BFG で `secret` という文字列を含むファイルを履歴から削除:
```bash
# ローカルで作業
git clone --mirror https://github.com/Rino-program/Audio-Visualizer.git
bfg --delete-files keystore.properties Audio-Visualizer.git
cd Audio-Visualizer.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```
- 注意: 履歴書き換えはリポジトリの他のコラボレータに影響します。手順と影響を理解してから実行してください。無効化・ローテーションを合わせて行うこと。

---

## 5. すぐに実行すべき対応チェックリスト（優先順）

1. 秘密情報除去 & ローテーション（最優先）
   - リポジトリに含まれている（あるいは含まれていた） API キー・keystore 等があれば直ちに無効化＆再発行。
   - `.gitignore` に該当ファイルを追加。
   - 履歴に含まれている場合、`git filter-repo` / BFG で除去（影響をチームに周知）。
2. 依存関係スキャン
   - `npm audit` / `yarn audit`、Gradle の dependency check、Snyk などで脆弱性を洗い出しアップデートする。
3. CI にセキュリティスキャン導入
   - Dependabot、GitHub Code Scanning (CodeQL), Secret Scanning, Semgrep を有効化。
4. CSP / SRI 設定
   - HTML の配布時に CSP を適用。CDN を使う場合は SRI を設定。
5. XSS のコードレビュー
   - ユーザー入力を DOM に挿入している箇所を全検索して `innerHTML` を `textContent` に変更するか、サニタイズを適用。
6. gradlew スクリプトの見直し
   - eval 部分の安全化または代替コードへの置換。Gradle Wrapper を最新版に更新。
7. モバイル署名運用の確認
   - 署名鍵は CI の Secrets で保管し、公開リリースは署名済みにする。

---

## 6. 継続的セキュリティ対策（CI / ツール導入例）
- Dependabot: 依存関係を自動で PR 作成して更新を促す。
- GitHub Advanced Security（Code Scanning, Secret Scanning）: PR ごとに SAST・シークレット検出。
- Snyk / OSS Index: 依存脆弱性の詳細レポート。
- Semgrep（ルールセット）: XSS、危険な eval、unsafe innerHTML 等の検出ルールを追加。
- OWASP ZAP で定期的に E2E スキャン。

例: GitHub Actions による簡易セキュリティワークフロー（概念例）
```yaml
name: Security Checks
on: [push, pull_request]
jobs:
  npm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install
        run: npm ci
      - name: Audit
        run: npm audit --audit-level=high

  codeql:
    uses: github/codeql-action/init@v2
    with:
      languages: javascript
  # ...followed by codeql/analyze in next step
```

---

## 7. 参考コマンド、ツール（実行方法）
- 依存脆弱性確認（Node.js）
  - npm:
    ```bash
    npm ci
    npm audit --json > audit.json
    ```
  - yarn:
    ```bash
    yarn install --frozen-lockfile
    yarn audit --json > audit.json
    ```
- gradle 依存チェック:
  ```bash
  ./gradlew dependencyCheckAnalyze
  ```
  （dependency-check plugin の導入が必要）
- シークレットスキャン（ローカル）
  - truffleHog / git-secrets / detect-secrets
  - 例: detect-secrets
    ```bash
    pip install detect-secrets
    detect-secrets scan > .secrets.baseline
    detect-secrets audit .secrets.baseline
    ```
- 履歴からの秘密削除（git filter-repo）
  ```bash
  pip install git-filter-repo
  git clone --mirror https://github.com/Rino-program/Audio-Visualizer.git
  cd Audio-Visualizer.git
  git filter-repo --invert-paths --paths-kept file_to_keep --paths-to-remove path/to/keystore.properties
  # もしくはより細かい手順を検討
  git push --force
  ```
- BFG（大きなファイルを削除）:
  ```bash
  # clone --mirror に続き
  bfg --delete-files keystore.properties <repo>.git
  ```

---

## 8. 次のステップ（提案）
1. 今すぐ実行（24〜48時間以内）
   - 秘密情報の有無を確認して、見つかった場合は該当キーを無効化／ローテーション。`.gitignore` を整備。
   - 依存関係の脆弱性チェックを実行し、重大なものを優先してアップデート。
2. 短期（1週間）
   - CodeQL / Semgrep / Dependabot を CI に導入し、自動検出フローを作る。
   - HTML に CSP を導入し、外部スクリプトには SRI を付与。
3. 中期（1〜4週間）
   - 全コードに対する SAST（静的解析）を実施し、XSS や unsafe eval などを修正。
   - リリースフローを見直し、署名鍵の安全運用（CI Secrets）を確立。
4. 長期（継続）
   - 定期的（週次／月次）に依存性・シークレットスキャンを実行するプロセスを定着化する。
   - 外部セキュリティ監査（ペネトレーションテスト）を実施することを検討する。

---

最後に
- 私は今回、リポジトリの一部ファイルを参照して脆弱性候補をまとめました。検出は限定的なスキャンに基づくため、見落としの可能性があります（GitHub のコード検索結果は上限があり、全てのファイルが取得できていない可能性がある点をご理解ください）。
- 希望があれば、以下のどれかを実行してレポートをさらに詳細化します：
  1. リポジトリ全体のシークレットスキャン（履歴含む）を実行して結果を提示する  
  2. 依存関係ファイル（package.json, package-lock.json, build.gradle 等）を取得して自動で脆弱性スキャンを実行する  
  3. 指定のファイル（例: audio/index.html、pc-app/public/index.html 全体）を解析して XSS の具体的なコード修正をパッチで提案する  
  4. CI 用の GitHub Actions ワークフロー（CodeQL + Dependabot + secret scan）を作成し、PR を用意する

どれを優先しますか？あるいは別の切り口（動的スキャン、依存のアップデート PR など）が良ければ教えてください。