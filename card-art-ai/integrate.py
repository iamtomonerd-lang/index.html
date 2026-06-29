"""生成したカードイラストをゲーム本体へ組み込む。

  python integrate.py

処理内容:
  1. out/*.png を ../images/cards/ へコピー
  2. ../index.html の `const CARD_ART_ENABLED = false;` を true に書き換え
     （イラスト表示を有効化。画像が無いカードは絵文字に自動フォールバック）

元に戻すには:
  python integrate.py --disable
"""

import argparse
import json
import os
import shutil
import sys

import config

HERE = os.path.dirname(__file__)
GAME_ROOT = os.path.abspath(os.path.join(HERE, ".."))
INDEX_HTML = os.path.join(GAME_ROOT, "render.js")  # render.js に変更
DEST_DIR = os.path.join(GAME_ROOT, "images", "cards")


def copy_images():
    src_dir = os.path.join(HERE, config.OUT_DIR)
    if not os.path.isdir(src_dir):
        print(f"[skip] 出力フォルダがありません: {src_dir}")
        print("       先に `python generate.py --all` で生成してください。")
        return 0
    os.makedirs(DEST_DIR, exist_ok=True)
    n = 0
    for fn in os.listdir(src_dir):
        if fn.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
            shutil.copy2(os.path.join(src_dir, fn), os.path.join(DEST_DIR, fn))
            n += 1
    print(f"[copy] {n} 枚を {DEST_DIR} へコピー")
    return n


def set_flag(enabled: bool):
    with open(INDEX_HTML, encoding="utf-8") as f:
        html = f.read()
    old_true = "const CARD_ART_ENABLED = true;"
    old_false = "const CARD_ART_ENABLED = false;"
    target = old_true if enabled else old_false
    other = old_false if enabled else old_true
    if target in html:
        print(f"[flag] CARD_ART_ENABLED は既に {enabled} です")
        return
    if other not in html:
        print("[error] index.html に CARD_ART_ENABLED 宣言が見つかりません")
        sys.exit(1)
    html = html.replace(other, target)
    with open(INDEX_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[flag] CARD_ART_ENABLED -> {enabled}")


def report_missing():
    with open(os.path.join(HERE, "cards.json"), encoding="utf-8") as f:
        cards = json.load(f)
    missing = [c["id"] for c in cards
               if not os.path.exists(os.path.join(DEST_DIR, f"{c['id']}.{config.IMG_EXT}"))]
    if missing:
        print(f"[note] 未生成 {len(missing)} 枚（絵文字で表示されます）: {', '.join(missing)}")
    else:
        print("[ok] 全カードのイラストが揃っています")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disable", action="store_true", help="イラスト表示を無効化（絵文字に戻す）")
    args = ap.parse_args()

    if args.disable:
        set_flag(False)
        print("イラスト表示を無効化しました。")
        return

    copy_images()
    set_flag(True)
    report_missing()
    print("\n完了。ブラウザでゲームを開くとカードにイラストが表示されます。")


if __name__ == "__main__":
    main()
