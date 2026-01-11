# 🎯 PC版ビルド - クイックスタートガイド

## 今すぐビルドする方法

### オプション1: VS Code統合ターミナルを使用

1. VS Codeで `` Ctrl + ` `` を押してターミナルを開く
2. 以下のコマンドを順番に実行：

```powershell
cd pc-app
npm install
npm run build
```

### オプション2: PowerShellを使用（推奨）

1. Windowsの検索で「PowerShell」と入力して開く
2. 以下のコマンドを順番に実行：

```powershell
cd 'C:\VSCode_program\Audio Visualizer\pc-app'
npm install
npm run build
```

### オプション3: コマンドプロンプトを使用

1. Windowsの検索で「cmd」と入力してコマンドプロンプトを開く
2. 以下のコマンドを順番に実行：

```cmd
cd "C:\VSCode_program\Audio Visualizer\pc-app"
npm install
npm run build
```

> **⚠️ PowerShellを使用する場合の重要な注意**
> 
> スペースを含むパスは必ず**シングルクォート `'...'` またはダブルクォート `"..."` で囲んでください**。
> 
> ❌ **間違い**: `cd C:\VSCode_program\Audio Visualizer\pc-app`
> 
> ✅ **正しい**: `cd 'C:\VSCode_program\Audio Visualizer\pc-app'`

---

## ビルドが完了したら

成果物は以下の場所に生成されます：

```
c:\VSCode_program\Audio Visualizer\pc-app\release\Audio-Visualizer-Portable.zip
```

このZipファイルをGitHub Releasesにアップロードすれば、ユーザーに配布できます！

---

## エラーが出た場合

### `Set-Location: A positional parameter cannot be found`

**原因**: PowerShellでスペースを含むパスが引用符で囲まれていません。

**解決策**: パスを**シングルクォート**で囲んでください：

```powershell
cd 'C:\VSCode_program\Audio Visualizer\pc-app'
npm install
npm run build
```

または**ダブルクォート**を使用：

```powershell
cd "C:\VSCode_program\Audio Visualizer\pc-app"
npm install
npm run build
```

### `The system cannot find the path specified`

**原因**: パスが存在しないか、スペルが間違っています。

**確認項目**:
- プロジェクトの実際の場所を確認：`C:\VSCode_program\Audio Visualizer\` が存在するか
- コマンドをコピー＆ペーストして実行（タイプミスを避ける）

**解決策**: 正しいパスを使用してください

```powershell
# 確認コマンド
dir 'C:\VSCode_program\Audio Visualizer\pc-app'

# ビルド実行
cd 'C:\VSCode_program\Audio Visualizer\pc-app'
npm install
npm run build
```

### `npm: command not found`

**原因**: Node.jsがインストールされていません。

**解決策**: 
1. [Node.js公式サイト](https://nodejs.org/)からインストール
2. PowerShell/コマンドプロンプトを再起動
3. 確認: `node --version` を実行

### `The system cannot find the path specified`

パスが間違っています。プロジェクトの場所を確認してください：
```powershell
cd "c:\VSCode_program\Audio Visualizer\pc-app"
```

### `npm install` 後に `npm run build` が見つからない

**原因**: package.jsonが読み込まれていない。

**解決策**: `npm install` がエラーなく完了したことを確認してください

```powershell
cd 'C:\VSCode_program\Audio Visualizer\pc-app'
npm install --verbose  # 詳細表示で実行
npm run build
```

---

## ビルドが完了したら

成果物は以下の場所に生成されます：

```
C:\VSCode_program\Audio Visualizer\pc-app\release\Audio-Visualizer-Portable.zip
```

このZipファイルをGitHub Releasesにアップロードすれば、ユーザーに配布できます！

---

## 予想される処理時間

- `npm install`: 約1-3分（初回のみ）
- `npm run build`: 約2-5分

合計: 約3-8分

---

## 次のステップ

ビルドが完了したら：

1. ✅ `Audio-Visualizer-Portable.zip` が生成されていることを確認
2. ✅ Zipファイルを展開して `audio-visualizer-desktop.exe` が起動することをテスト
3. ✅ GitHub Releasesにアップロード
4. ✅ ユーザーに配布！

---

詳細なビルド情報は [BUILD_GUIDE.md](BUILD_GUIDE.md) を参照してください。
