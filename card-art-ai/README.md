# card-art-ai — TCGカード用 アニメ風イラスト ローカル生成

このゲーム（DCG）の全カードに、**日本のアニメ風イラスト**をローカルPCで生成して付与するための別プロジェクトです。

## 方針（重要）

- **モデルはゼロから学習しません。** 画像生成モデルの自前学習には数百万枚規模のデータとGPUクラスタが必要で非現実的です。
- 代わりに、**既存の軽量なアニメ系拡散モデル（Stable Diffusion 系）をローカルで動かして**、カード名・効果テキストから自動でプロンプトを組み立て、45枚分のイラストを一括生成します。
- 「軽いPCでも動くレベル」を重視し、**SD1.5 系アニメモデル + LCM-LoRA（4〜8ステップ）** を既定にしています。GPUがあれば数秒/枚、CPUのみでも（遅いですが）動きます。

## 必要環境

| 構成 | 目安 | 速度 |
|------|------|------|
| GPU (VRAM 6GB+) | RTX 3050 / 4060 等 | 1〜3秒/枚 |
| GPU (VRAM 4GB) | 512px・LCM 4step | 3〜8秒/枚 |
| CPUのみ (8GB RAM) | 動くが低速 | 30〜120秒/枚 |
| Apple Silicon (M1/M2) | mps利用 | 5〜15秒/枚 |

> この開発環境（クラウド・GPUなし・ネットワーク制限あり）では実生成は走りません。
> **生成はあなたのローカルPCで実行**してください。コードとプロンプトはここで整備済みです。

## セットアップ

```bash
cd card-art-ai
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 使い方

```bash
# 1) 全カードのプロンプトを確認（生成せずプロンプトだけ出力）
python generate.py --dry-run

# 2) 1枚だけ試す
python generate.py --only shinmai_heishi

# 3) 全45枚を生成（out/ に保存）
python generate.py --all

# 4) 生成画像をゲームに組み込む（images/ へコピーし index.html にカードのimg参照を付与）
python integrate.py
```

## モデルの差し替え

`config.py` の `MODEL_ID` を変えるだけで別モデルに切替できます。

| 用途 | MODEL_ID | 備考 |
|------|----------|------|
| 軽量・アニメ（既定） | `Meina/MeinaMix_V11` 等 SD1.5系 | LCM-LoRA併用で4〜8step |
| もっと軽い | `nota-ai/bk-sdm-small` | 蒸留SD・低VRAM |
| 高品質・重い | `cagliostrolab/animagine-xl-3.1` | SDXL・VRAM8GB+ |

## ファイル構成

- `cards.json` … ゲームから抽出した全45カードのメタ情報
- `config.py` … モデル/解像度/ステップ等の設定
- `prompts.py` … カード情報→アニメ風プロンプト変換ロジック
- `generate.py` … 生成本体（GPU/CPU/MPS自動判定）
- `integrate.py` … 生成画像をゲームへ組み込み
- `out/` … 生成画像の出力先（gitignore）
