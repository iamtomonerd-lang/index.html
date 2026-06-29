#!/usr/bin/env node
// 白デッキ10枚の効果分析
const { loadGame } = require("./test/loadGame");
const context = loadGame();

const WHITE_CARDS = ['shinmai_heishi','ten_kara_shisha','eiyuu_kouho',
  'serashia_heishi','serashia_junhei','serashia_souryo',
  'bastian','arestia','junigeki','kaizen'];

const analyzeColorDeck = context.analyzeColorDeck;
const results = analyzeColorDeck('white', WHITE_CARDS);

console.log('════════════════════════════════════════');
console.log('【白デッキ 10枚の効果分析】');
console.log('════════════════════════════════════════\n');

results.forEach(r => {
  if (r.error) {
    console.log(`${r.idx}. ❌ ${r.id}`);
    return;
  }
  console.log(`${r.idx}. ${r.name} (${r.id})`);
  console.log(`   Type: ${r.type} | Cost: ${JSON.stringify(r.cost)} | Power/Tough: ${r.power}/${r.toughness}`);
  if (r.effect) console.log(`   ■Effect: ${r.effect}`);
  if (r.chargedAbility) console.log(`   ■ChargedAbility: ${r.chargedAbility}`);
  if (r.tapAbility) console.log(`   ■TapAbility: ${r.tapAbility}`);
  console.log(`   Text: ${r.text.split('\n')[0]}`);
  console.log();
});

