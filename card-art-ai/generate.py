"""カードイラスト一括生成スクリプト。

  python generate.py --dry-run            # プロンプトだけ表示
  python generate.py --only <card_id>     # 1枚だけ生成
  python generate.py --all                # 全カード生成

GPU(cuda) / Apple(mps) / CPU を自動判定。重い環境では --all は時間がかかる。
"""

import argparse
import json
import os
import sys

import config
import prompts


def load_cards():
    with open(os.path.join(os.path.dirname(__file__), "cards.json"), encoding="utf-8") as f:
        return json.load(f)


def pick_device():
    if config.DEVICE != "auto":
        return config.DEVICE
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def build_pipeline(device):
    import torch
    from diffusers import StableDiffusionPipeline, LCMScheduler

    dtype = torch.float16 if device == "cuda" else torch.float32
    print(f"[load] model={config.MODEL_ID} device={device} dtype={dtype}")
    pipe = StableDiffusionPipeline.from_pretrained(
        config.MODEL_ID, torch_dtype=dtype, safety_checker=None
    )

    if config.LCM_LORA_ID:
        print(f"[load] LCM-LoRA={config.LCM_LORA_ID}")
        pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
        pipe.load_lora_weights(config.LCM_LORA_ID)
        pipe.fuse_lora()

    pipe = pipe.to(device)
    if device == "cpu":
        pipe.enable_attention_slicing()
    return pipe


def generate_one(pipe, card, seed=None):
    import torch

    prompt = prompts.build_prompt(card)
    negative = prompts.build_negative(card)
    gen = None
    if seed is not None:
        gen = torch.Generator(device=pipe.device.type if hasattr(pipe, "device") else "cpu")
        gen = gen.manual_seed(seed)

    image = pipe(
        prompt=prompt,
        negative_prompt=negative,
        width=config.WIDTH,
        height=config.HEIGHT,
        num_inference_steps=config.STEPS,
        guidance_scale=config.GUIDANCE,
        generator=gen,
    ).images[0]
    return image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="プロンプトだけ表示して終了")
    ap.add_argument("--only", metavar="CARD_ID", help="指定IDのカードだけ生成")
    ap.add_argument("--all", action="store_true", help="全カード生成")
    args = ap.parse_args()

    cards = load_cards()
    if args.only:
        cards = [c for c in cards if c["id"] == args.only]
        if not cards:
            print(f"card id not found: {args.only}")
            sys.exit(1)

    if args.dry_run:
        for c in cards:
            print(f"\n=== {c['id']} ({c['name']}) [{c['color']}/{c['type']}] ===")
            print("PROMPT :", prompts.build_prompt(c))
            print("NEGATIVE:", prompts.build_negative(c))
        return

    if not (args.all or args.only):
        ap.print_help()
        return

    out_dir = os.path.join(os.path.dirname(__file__), config.OUT_DIR)
    os.makedirs(out_dir, exist_ok=True)

    device = pick_device()
    pipe = build_pipeline(device)

    for i, c in enumerate(cards, 1):
        print(f"[{i}/{len(cards)}] {c['id']} ({c['name']}) ...", flush=True)
        img = generate_one(pipe, c, seed=config.SEED)
        path = os.path.join(out_dir, f"{c['id']}.{config.IMG_EXT}")
        img.save(path)
        print(f"   saved -> {path}")

    print("\nDone. 次に `python integrate.py` でゲームへ組み込めます。")


if __name__ == "__main__":
    main()
