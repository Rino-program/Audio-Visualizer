# F-Droid 向けの作業メモ

このメモは、「何を直せばいいか」を迷わないための手順書です。特に `Binaries` と `AllowedAPKSigningKeys` をどう扱うべきかを、理由つきで整理しています。

## いまの状態

- release ビルドは成功済み
- `versionName` と `versionCode` は `android-app/android/app/build.gradle` と `android-app/android/app/src/main/res/xml/config.xml` でそろっている
- F-Droid 用 metadata は `fdroid/metadata/io.github.rinoprogram.audiovisualizer.yml` にある
- 署名証明書の SHA-256 fingerprint は取得済みで、今のローカル release APK では `228bbdf858e59ccaba795aa66016d717281281cae6a1f725b1b7660afc87c45b`

## まず結論

やることは、次の順番です。

1. upstream が「版ごとに固定された APK の公開 URL」を持っているか確認する
2. その APK の署名証明書 fingerprint が正しいか確認する
3. metadata に `Binaries` と `AllowedAPKSigningKeys` を入れる
4. 署名鍵の保管とバックアップを見直す

## なぜこの順番なのか

### 1. `Binaries` は URL が先に必要

`Binaries` は「この版の APK はここにある」という、版ごとに固定された URL を指定するための項目です。F-Droid はこの URL の APK と、自分でビルドした APK を比べて、同じものかどうかを確認できます。

つまり、URL が決まっていないと `Binaries` は書けません。README や GitHub release に APK があっても、`versionName` と `versionCode` から一意に導けない URL だと使いにくいです。

### 2. `AllowedAPKSigningKeys` は「信頼してよい署名鍵」の一覧

`AllowedAPKSigningKeys` は、APK を署名している証明書の SHA-256 fingerprint を登録する項目です。F-Droid が binary APK を扱うとき、その APK が知らない鍵で署名されていないかを確認できます。

ここに入れるのは秘密鍵ではありません。入れるのは公開証明書の fingerprint です。ただし、秘密鍵そのものは必ず安全に保管しなければいけません。

## このリポジトリでの実務的な判断

### `Binaries` を入れてよい場合

- upstream が release ごとに固定の APK を公開している
- URL が `versionName` や `versionCode` で一意に決まる
- その APK が、F-Droid で検証したい対象そのものになっている

### `Binaries` をまだ入れない方がよい場合

- release APK の公開先 URL がない
- リンクはあるが、毎回同じ名前のファイルで上書きされる
- version ごとの対応が外から分からない

この場合は、まず公開方法を整えるのが先です。URL が曖昧なままだと、F-Droid がどの APK と比べればよいか判断できません。

### `AllowedAPKSigningKeys` を入れるときの注意

- 今回取得した fingerprint は、今のローカル release APK のもの
- その APK が公開 APK と同じ鍵で署名されていることを確認してから使う
- 署名鍵が違うなら、fingerprint も違うので、そのまま流用してはいけない

## 追加する内容の例

実際の URL が決まったら、metadata には次の形で入れます。

```yaml
Binaries: https://example.invalid/releases/v%v/app-%c.apk
AllowedAPKSigningKeys:
  - 228bbdf858e59ccaba795aa66016d717281281cae6a1f725b1b7660afc87c45b
```

`%v` は versionName、`%c` は versionCode に置き換わります。これで「この版の APK はこの URL にある」と F-Droid に伝えられます。

## 実際にやること

1. upstream の release ページを見て、APK の公開 URL が version ごとに固定か確認する
2. 固定 URL があるなら、そのパターンを `Binaries` に入れる
3. fingerprint が正しい鍵のものか確認する
4. `fdroid/metadata/io.github.rinoprogram.audiovisualizer.yml` に `Binaries` と `AllowedAPKSigningKeys` を追記する
5. 署名鍵の元ファイルを安全に保管する

## 鍵を安全に保つ方法

これはかなり重要です。署名鍵を失うと、同じアプリ ID で新しい正規 APK を出し続けられなくなる可能性があります。

### 最低限やること

- keystore ファイルを Git に入れない
- keystore のパスワードを平文で保存しない
- 暗号化したバックアップを少なくとも 2 か所に分けて持つ
- バックアップから実際に復元できるか一度確認する

### おすすめの保管方法

- オフラインの USB メモリや外付け SSD に暗号化して保存する
- クラウドに置くなら、必ず事前に暗号化する
- パスワードは別経路で管理する

### やってはいけないこと

- keystore をリポジトリに commit する
- パスワードを `README` や `FDROID.md` に書く
- 署名鍵を人手で再生成してしまう

## ひとことで言うと

今やるべきなのは、「公開 APK の固定 URL を決める」「その APK の署名 fingerprint を確認する」「metadata に入れる」の 3 つです。今回のローカル release APK では fingerprint は取得できているので、次はそれが公開 APK と同じ鍵かを確認する段階です。