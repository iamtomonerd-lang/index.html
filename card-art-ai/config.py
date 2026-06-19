"""生成設定。軽いPCでも動くことを優先した既定値。"""

# ── モデル選択 ────────────────────────────────────────────────
# 既定: SD1.5系アニメモデル + LCM-LoRA（少ステップ・軽量）
# 別モデルに切り替える場合はここを変更。README参照。
MODEL_ID = "xyn-ai/anything-v4.0"

# LCM-LoRA を併用すると 4〜8 step で生成でき大幅に高速化する。
# 使わない場合は None にして STEPS を 20〜30 に上げる。
LCM_LORA_ID = "latent-consistency/lcm-lora-sdv1-5"

# ── 生成パラメータ ───────────────────────────────────────────
# CPU環境向けに低解像度・少ステップを既定化（GPUなら512/6に上げてよい）
WIDTH = 384
HEIGHT = 384
STEPS = 4            # LCM併用時の推奨。LCM無しなら 25 程度
GUIDANCE = 1.5       # LCM併用時は 1.0〜2.0。LCM無しなら 7.0 程度
SEED = 1234          # 再現性のため固定。None でランダム

# ── 出力 ─────────────────────────────────────────────────────
OUT_DIR = "out"
IMG_EXT = "png"

# ── デバイス（auto / cuda / mps / cpu）──────────────────────
DEVICE = "auto"

# ── 共通プロンプト（全カードに付与）─────────────────────────
STYLE_PREFIX = (
    "masterpiece, best quality, anime style, japanese anime illustration, "
    "clean lineart, vibrant colors, detailed, trading card game art, "
    "single subject, centered composition"
)

NEGATIVE_PROMPT = (
    "lowres, bad anatomy, bad hands, text, watermark, signature, "
    "extra limbs, deformed, blurry, jpeg artifacts, ugly, "
    "multiple views, frame, border, photo, realistic, 3d render"
)
