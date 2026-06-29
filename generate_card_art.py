#!/usr/bin/env python3
"""
Generate card art using Replicate API and save to images/cards/
Requires: pip install replicate requests
"""
import os
import sys
import json
import replicate
from pathlib import Path

# Configuration
REPLICATE_API_TOKEN = os.environ.get('REPLICATE_API_TOKEN', '')
OUTPUT_DIR = Path('images/cards')
CARD_DATA_FILE = 'cards.js'

# Cards to generate (28 cards)
CARDS_TO_GENERATE = {
    # Black creatures (10)
    'shiki': '死を食らうもの シキ - ダークファンタジーのネクロマンサー、黒い魔力、死と墓地のテーマ',
    'ren': '死を運ぶもの レン - ゾンビ戦士、腐敗、アンデッド、暗い雰囲気',
    'yami_jouhouya': '闇の情報屋 - 暗殺者、影、ダークファンタジー',
    'skeleton_senshi': 'スケルトンの戦士 - 骨の戦士、アンデッド、モノクロ',
    'itazura_obake': 'いたずらお化け - 幽霊、超自然的、ホラー要素',
    'haka_zombie': '墓守ゾンビ - ゾンビ、墓地、アンデッド',
    'taisei_zombie': '不屈の屍 - タフなゾンビ、暗い力',
    'hakaatsume_yatoware': '墓荒らしの雇われ - 暗い人物、墓地テーマ',
    'shigoeki': '死越撃 - 黒魔法のスペル、死のエネルギー',
    'kurogeki': '黒撃 - 破壊の黒魔法',

    # Black lands (5)
    'hito_numa': '人住まう沼 - 湿地、沼地、暗い水域',
    'wasure_numa': '忘れ去られし沼 - 廃墟の沼、ゴシック',
    'shigen_numa': '資源豊富な沼 - 豊かな沼地、緑と黒',
    'kemono_numa': '獣住む沼 - 危険な生物がいる沼',
    'areta_haka': '荒れた墓 - 荒廃した墓地、ゴシック',

    # Green creatures (10)
    'foklya': '村長樹妃 フォクリア - 古代樹、自然の女神、生命力',
    'tami_kaitaku': '民による開拓 - 緑の呪文、耕作',
    'folkusu': '古樹従 フォルクス - ツリーフォーク、古い樹人',
    'kaitakusha': '新米開拓者 - 冒険者、自然との共存',
    'mori_kansha': '森への感謝 - 自然魔法、森のテーマ',
    'gen_jurei': '源の樹霊 - 樹の精霊、古代魔法',
    'mori_tami': '樹守の民 - 森人、自然戦士',
    'iwai_tami': '祝いの民 - 祭りの人物、自然の喜び',
    'matsuri_otoko': '祭り男 - 祭りテーマ、自然エネルギー',
    'kaitaku_miko': '開拓祭りの巫女 - 巫女、自然魔法、祭り',

    # Green lands (5)
    'hito_mori': '人住まう森 - 美しい森、緑の大地',
    'wasure_mori': '忘れ去られし森 - 古い森、ファンタジー',
    'shigen_mori': '資源豊富な森 - 生産的な森、豊かさ',
    'kemono_mori': '獣住む森 - 野生動物の森',
    'matsuri_kaijo': '祭りの会場 - 祭りの場所、活気',

    # Colorless (2)
    'test_golem': 'テストゴーレム - ゴーレム、魔法的な石像',
    'jikkenjou': '実験場 - 科学的な場所、魔法実験',
}

def extract_card_names():
    """Extract card names from cards.js"""
    with open(CARD_DATA_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    card_names = {}
    for card_id in CARDS_TO_GENERATE.keys():
        # Find pattern: id:'card_id'...name:'card_name'
        import re
        pattern = f"id:'{card_id}'[\\s\\S]{{0,300}}?name:'([^']+)'"
        match = re.search(pattern, content)
        if match:
            card_names[card_id] = match.group(1)

    return card_names

def generate_and_save_card_art(card_id, card_name, description):
    """Generate card art using Replicate and save it"""

    output_path = OUTPUT_DIR / f'{card_id}.png'

    # Skip if already exists
    if output_path.exists():
        print(f'✅ {card_id}: Already exists, skipping')
        return True

    print(f'🎨 Generating {card_id}: {card_name}...')

    # Create prompt
    prompt = f"""Fantasy trading card illustration for "{card_name}".
Description: {description}
Style: digital art, high quality, detailed, vibrant colors, trading card size 4:5 aspect ratio.
Professional card game illustration, consistent with other fantasy card games."""

    try:
        # Use Replicate to generate image
        output = replicate.run(
            'stability-ai/sdxl:39ed52f2a60c3b36b4ac6457b0341f0e6236c46c5c51b89496850bf253b378a5',
            input={
                'prompt': prompt,
                'negative_prompt': 'text, words, letters, blurry, low quality',
                'num_outputs': 1,
                'guidance_scale': 7.5,
            }
        )

        if not output or not output[0]:
            print(f'❌ {card_id}: Generation failed')
            return False

        # Download image
        import urllib.request
        image_url = output[0]
        urllib.request.urlretrieve(image_url, output_path)

        print(f'✅ {card_id}: Saved to {output_path}')
        return True

    except Exception as e:
        print(f'❌ {card_id}: Error - {str(e)}')
        return False

def main():
    # Check API token
    if not REPLICATE_API_TOKEN:
        print('❌ Error: REPLICATE_API_TOKEN environment variable not set')
        print('   Set it with: export REPLICATE_API_TOKEN="your_token_here"')
        sys.exit(1)

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Extract card names
    card_names = extract_card_names()

    # Generate art
    success_count = 0
    for card_id, description in CARDS_TO_GENERATE.items():
        card_name = card_names.get(card_id, card_id)
        if generate_and_save_card_art(card_id, card_name, description):
            success_count += 1

    print(f'\n📊 Complete: {success_count}/{len(CARDS_TO_GENERATE)} cards generated')

if __name__ == '__main__':
    main()
