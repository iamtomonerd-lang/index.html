"""カード情報 → アニメ風プロンプト変換。

cards.json の name / type / color / text を元に、
そのカードらしいアニメ風イラストのプロンプトを組み立てる。
"""

import config

# 色ごとのテーマ・配色・雰囲気
COLOR_THEME = {
    "W": "holy light, white and gold palette, radiant, sacred, knightly",
    "R": "fire and warmth, red and orange palette, energetic, fierce",
    "U": "water and knowledge, blue palette, calm, scholarly, arcane",
    "C": "neutral tones, grand architecture, monumental",
}

# タイプごとの構図
TYPE_COMPOSITION = {
    "creature": "character portrait, dynamic pose, expressive face",
    "spell": "magical effect scene, glowing energy, no character focus",
    "land": "scenic landscape, environment art, no people",
}

# カード個別のモチーフ（idベースで上書き・補強）。
# 未指定のものは name から自動推定する。
MANUAL_MOTIF = {
    # 白
    "shinmai_heishi": "young rookie soldier, nervous, simple armor",
    "ten_kara_shisha": "winged messenger angel descending from sky",
    "eiyuu_kouho": "aspiring young hero, determined eyes",
    "serashia_heishi": "disciplined soldier of Serasia, blue cape",
    "serashia_junhei": "shield bearer guard, large tower shield",
    "serashia_souryo": "gentle priest healer, prayer pose, soft glow",
    "bastian": "towering guardian knight in heavy white armor, absolute defense",
    "arestia": "valkyrie battle maiden, winged helmet, spear, heroic",
    "junigeki": "shield bash impact, burst of light",
    "kaizen": "supportive healing magic, warm radiance",
    # 赤
    "hayaashi_goblin": "small fast goblin runner, mischievous grin",
    "kururu": "lucky fortune dragon, cute and auspicious, red scales",
    "aka_madoushi": "red mage casting fire, flowing robes",
    "daikokubashira": "reliable family pillar, strong father figure",
    "ayumu": "wandering second son traveler of the wasteland, calm archer",
    "michiru": "cheerful second daughter, full of life, warm smile",
    "meguru": "smiling eldest daughter, kind radiant aura",
    "raigeki": "lightning strike bolt from sky",
    "akageki": "red burst of fire magic",
    "iegeki": "house-shaped explosive blast, comedic power",
    # 青
    "omnieru": "grand collector club chief, regal scholar, crown of knowledge",
    "aaka": "vice chief scholar girl, books and quill, studious",
    "chishiki_maju": "knowledge-gathering mage apprentice, curious",
    "maju_gakusha": "scholar of magic, open tome, glasses",
    "bu_in": "club member assistant, carrying scrolls",
    "nexia": "club secretary, writing records, calm and precise",
    "ao_geki": "water bolt strike, splash of blue energy",
    "chishiki_no_seiri": "organizing knowledge, swirling pages of light",
    "mizu_geki": "wave magic returning enemy, water surge",
    "hitei": "negation barrier, blue cancel rune",
    # 土地
    "hito_heichi": "peaceful inhabited plains with a small village",
    "wasure_heichi": "forgotten misty plains, abandoned ruins",
    "shigen_heichi": "resource-rich fertile plains, golden fields",
    "kemono_heichi": "wild plains where beasts roam",
    "serashia_miyako": "great holy capital city of Serasia, white spires",
    "hito_yama": "inhabited mountain with terraced homes",
    "wasure_yama": "forgotten volcanic mountain, smoke",
    "shigen_yama": "resource-rich mountain, glowing ore veins",
    "kemono_yama": "wild mountain where beasts roam",
    "daikazoku_ie": "big warm family house, cozy",
    "hito_shima": "inhabited tranquil island, blue sea",
    "wasure_shima": "forgotten foggy island, lost to memory",
    "shigen_shima": "resource-rich island, crystal shores",
    "kemono_shima": "wild island where sea beasts roam",
    "gakuin": "grand academy of knowledge, library halls",
}


def build_prompt(card: dict) -> str:
    color = card.get("color", "C")
    ctype = card.get("type", "creature")
    motif = MANUAL_MOTIF.get(card["id"]) or card.get("name", "")

    theme = COLOR_THEME.get(color, COLOR_THEME["C"])
    comp = TYPE_COMPOSITION.get(ctype, TYPE_COMPOSITION["creature"])

    parts = [config.STYLE_PREFIX, motif, theme, comp]
    return ", ".join(p for p in parts if p)


def build_negative(card: dict) -> str:
    neg = config.NEGATIVE_PROMPT
    if card.get("type") == "land":
        neg += ", person, character, face"
    return neg
