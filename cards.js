// ============================================================
// WHITE CARD DATABASE
// ============================================================
const CARD_DB = {
  // CREATURES
  'shinmai_heishi': {
    id:'shinmai_heishi', name:'新米兵士', type:'creature', color:'W',
    cost:{W:1}, power:1, toughness:3, subtype:'人間(戦士)', icon:'🛡️',
    keywords:[], text:''
  },
  'ten_kara_shisha': {
    id:'ten_kara_shisha', name:'天からの使者', type:'creature', color:'W',
    cost:{W:1,C:1}, power:1, toughness:1, subtype:'天使', icon:'👼',
    keywords:['飛行'], text:'■飛行\n■出た時、相手のクリーチャー１体に1ダメージ',
    flying:true, etb:'damage1opponent'
  },
  'eiyuu_kouho': {
    id:'eiyuu_kouho', name:'英雄候補', type:'creature', color:'W',
    cost:{W:1,C:3}, power:3, toughness:5, subtype:'人間(戦士)', icon:'⚔️',
    keywords:['格闘'], text:'■格闘\n■出た時、3ルック1(白)',
    kakutou:true, etb:'look3keep1white'
  },
  'serashia_heishi': {
    id:'serashia_heishi', name:'セラシアの兵士', type:'creature', color:'W',
    cost:{W:2,C:1}, power:2, toughness:5, subtype:'人間(戦士)', icon:'🗡️',
    keywords:[], text:'■出た時、相手クリーチャー１体選ぶ。次の相手のターン中、そのクリーチャーは可能なら攻撃する\n■ブロック時、1枚引く',
    etb:'mustAttackTarget', onBlock:'draw1'
  },
  'serashia_junhei': {
    id:'serashia_junhei', name:'セラシアの盾兵', type:'creature', color:'W',
    cost:{W:2,C:1}, power:1, toughness:5, subtype:'人間(戦士)', icon:'🛡️',
    keywords:[], text:'■出た時、相手クリーチャー１体選ぶ。次の相手のターン中、そのクリーチャーは可能なら攻撃する\n■ブロック時、相手クリーチャー1体に2ダメージ',
    etb:'mustAttackTarget', onBlock:'damage2attacker'
  },
  'serashia_souryo': {
    id:'serashia_souryo', name:'セラシアの僧侶', type:'creature', color:'W',
    cost:{W:3,C:2}, power:3, toughness:7, subtype:'人間(聖職者)', icon:'🙏',
    keywords:['C8'], text:'■出た時、相手クリーチャー１体選ぶ。次の相手のターン中、そのクリーチャーは可能なら攻撃する\n■相手の攻撃時、相手のクリーチャー１体に3ダメージ\n■ブロック時、自分のライフを3回復\n〈C8〉\n■ブロック時、自分のクリーチャー1体を+1/+1',
    etb:'mustAttackTarget', onOpponentAttack:'damage3opponent', onBlock:'gain3life', cx8Block:'buff1ally'
  },
  'bastian': {
    id:'bastian', name:'絶対守護 バスティオン', type:'creature', color:'W',
    cost:{W:4}, power:3, toughness:2, subtype:'人間(戦士)', icon:'🏰',
    keywords:['格闘','C6','C8','OC'],
    text:'■格闘\n■出た時、相手クリーチャー1体に2ダメージ\n〈C6〉\n■出た時、相手クリーチャー1体に3ダメージ\n〈C8〉\n■このクリーチャーは+3/+3される\n〈OC〉\n■このクリーチャーはタップしていてもブロックできる',
    kakutou:true, etb:'damage2opponent_always_cx6damage3', cx8Buff:true, ocBlockWhileTapped:true
  },
  'arestia': {
    id:'arestia', name:'戦乙女 アレスティア', type:'creature', color:'W',
    cost:{W:3,C:5}, power:5, toughness:5, subtype:'人間(戦士)', icon:'⚡',
    keywords:['還元'],
    text:'■相手は可能なら攻撃する\n■相手クリーチャーのアタック時、自分のクリーチャー全てを＋1/＋1する\n■自分のクリーチャーのブロック終了時、このバトル中自分のクリーチャーが破壊されていなければ、相手プレイヤーに2ダメージ\n■起動（還元）：自分のクリーチャー1体をアンタップする。これは相手ターンのみ起動できる',
    arestiaPassive:true, onAttackOpponent:'buff_all_own', onBlockEndDamage2:true,
    activated:'untapOwn'
  },
  // SPELLS
  'junigeki': {
    id:'junigeki', name:'盾撃', type:'spell', color:'W',
    cost:{W:1}, icon:'🛡️', keywords:['Quick'],
    text:'■相手のクリーチャー1体に2ダメージ\n■自分のクリーチャー1体を+0/+1',
    effect:'junigeki'
  },
  'kaizen': {
    id:'kaizen', name:'介善', type:'spell', color:'W',
    cost:{W:4}, icon:'✨', keywords:['Quick'],
    text:'■相手クリーチャー1体に５ダメージ\n■相手クリーチャー1体を選ぶ。このターン、それは可能なら攻撃する\n■このターン、自分のクリーチャーがブロックする時、1枚引く\n〈OC〉\n■自分の手札からマナ総量8以下のクリーチャーを出す。この能力によって出したクリーチャーはこのゲーム中、攻撃できない(ターン1:同名)',
    effect:'kaizen'
  },
  // LANDS
  'hito_heichi': {
    id:'hito_heichi', name:'人住まう平地', type:'land', color:'W',
    produces:'W', icon:'🌾',
    text:'■起動(タップ)：白1マナ生成する\n■起動(タップ&白3マナ)：3ルック1(白)。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'look3keep1white'
  },
  'wasure_heichi': {
    id:'wasure_heichi', name:'忘れ去られし平地', type:'land', color:'W',
    produces:'W', icon:'🌿',
    text:'■起動(タップ)：白1マナ生成\n■この土地がチャージされた時、1枚引く',
    chargeDrawTrigger:true
  },
  'shigen_heichi': {
    id:'shigen_heichi', name:'資源豊富な平地', type:'land', color:'W',
    produces:'W', icon:'⛏️',
    text:'■起動(タップ):白1マナ生成\n〈OC〉\n■起動(自身の還元):白3マナ生成。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'kaizouReturn'
  },
  'kemono_heichi': {
    id:'kemono_heichi', name:'獣住む平地', type:'land', color:'W',
    produces:'W', icon:'🐾',
    text:'■起動(タップ):白1マナ生成\n■起動(自身の還元):相手クリーチャー1体に5ダメージ。これはこの土地がチャージされているときのみ起動できる',
    chargedAbility:'damage5opponent'
  },
  'serashia_miyako': {
    id:'serashia_miyako', name:'セラシアの都', type:'land', color:'C',
    produces:'C', icon:'🏛️',
    text:'■起動(タップ)：1マナ生成\n■起動(タップ)：自分の白のクリーチャー1体+0/+2。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'buffWhiteCreature'
  },

  // ============================================================
  // RED CARD DATABASE (SD攻撃者の赤)
  // ============================================================
  // CREATURES
  'hayaashi_goblin': {
    id:'hayaashi_goblin', name:'早足ゴブリン', type:'creature', color:'R',
    cost:{R:2}, power:1, toughness:1, subtype:'ゴブリン（戦士）', icon:'👹',
    keywords:['速攻'], text:'■速攻',
    haste:true
  },
  'kururu': {
    id:'kururu', name:'福来る竜 クルル', type:'creature', color:'R',
    cost:{C:1,R:1}, power:1, toughness:1, subtype:'ドラゴン', icon:'🐉',
    keywords:[], text:'■攻撃時、1枚引く',
    onAttack:'draw1'
  },
  'aka_madoushi': {
    id:'aka_madoushi', name:'赤魔道士', type:'creature', color:'R',
    cost:{C:1,R:2}, power:2, toughness:2, subtype:'人間（ウィザード）', icon:'🔮',
    keywords:[], text:'■出た時または攻撃時、相手のクリーチャー1体に2ダメージ',
    etb:'damage2creature', onAttack:'damage2creature'
  },
  'daikokubashira': {
    id:'daikokubashira', name:'一家の大黒柱', type:'creature', color:'R',
    cost:{C:3,R:1}, power:5, toughness:2, subtype:'人間', icon:'🛠️',
    keywords:['格闘'], text:'■格闘\n■出た時、3ルック1(赤)',
    kakutou:true, etb:'look3keep1red'
  },
  'ayumu': {
    id:'ayumu', name:'荒野歩きの次男 アユム', type:'creature', color:'R',
    cost:{C:2,R:2}, power:3, toughness:2, subtype:'人間（戦士）', icon:'🏹',
    keywords:['格闘','C7'],
    text:'■格闘\n■出た時、2ルック1(赤)\n〈C7〉\n■攻撃時、1枚引く。その後、相手クリーチャー１体に5ダメージ',
    kakutou:true, etb:'look2keep1red', onAttack:'ayumuC7'
  },
  'michiru': {
    id:'michiru', name:'道満ちる次女 ミチル', type:'creature', color:'R',
    cost:{R:4}, power:2, toughness:2, subtype:'人間（戦士）', icon:'⚔️',
    keywords:['格闘','C6','C8','OC'],
    text:'■格闘\n■攻撃時、相手クリーチャー１体に4ダメージ\n■攻撃中、ダメージを受けない\n〈C6〉\n■自分のクリーチャーが攻撃する時、手札が4枚以下なら、1枚引く\n〈C8〉\n■+3/+3\n〈OC〉\n■2回攻撃',
    kakutou:true, onAttack:'damage4creature', noDmgWhileAttacking:true,
    onAllyAttack:'michiruC6Draw', cx8Buff33:true, ocDoubleAttack:true
  },
  'meguru': {
    id:'meguru', name:'笑顔巡りの長女 メグル', type:'creature', color:'R',
    cost:{C:5,R:3}, power:4, toughness:3, subtype:'人間（戦士）', icon:'😊',
    keywords:['速攻','還元'],
    text:'■速攻\n■自分のクリーチャーのアタック時、相手のクリーチャーとプレイヤー全てに1ダメージ与え、1枚引く\n■自分のクリーチャーは攻撃中、離れない\n■起動（還元）：自分のクリーチャー1体+1/+1',
    haste:true, onAllyAttack:'meguruAllDamage', alliesInvulnWhileAttacking:true,
    activated:'buffOwnPlus11'
  },
  // SPELLS
  'raigeki': {
    id:'raigeki', name:'雷撃', type:'spell', color:'R',
    cost:{R:1}, icon:'⚡', keywords:['Quick'],
    text:'■相手クリーチャー１体に2ダメージ\n■1枚引く',
    effect:'raigeki'
  },
  'akageki': {
    id:'akageki', name:'赤撃', type:'spell', color:'R',
    cost:{R:1}, icon:'🔥', keywords:['Quick'],
    text:'■相手のクリーチャー1体またはプレイヤーに2ダメージ',
    effect:'akageki'
  },
  'iegeki': {
    id:'iegeki', name:'家撃！', type:'spell', color:'R',
    cost:{R:4}, icon:'💥', keywords:['OC'],
    text:'■このターン相手クリーチャーへ与えるダメージを相手プレイヤーに変えてもよい\n■相手クリーチャー１体に5ダメージ\n〈OC〉\n■手札からマナ総量8以下の赤のクリーチャー１体出す。それはこのゲーム中、可能なら攻撃する(ターン1同名)',
    effect:'iegeki'
  },
  // LANDS
  'hito_yama': {
    id:'hito_yama', name:'人住まう山', type:'land', color:'R',
    produces:'R', icon:'🏔️',
    text:'■起動(タップ)：赤1マナ生成する\n■起動(タップ&赤3マナ)：3ルック1(赤)。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'look3keep1red'
  },
  'wasure_yama': {
    id:'wasure_yama', name:'忘れ去られし山', type:'land', color:'R',
    produces:'R', icon:'⛰️',
    text:'■起動(タップ)：赤1マナ生成\n■この土地がチャージされた時、1枚引く',
    chargeDrawTrigger:true
  },
  'shigen_yama': {
    id:'shigen_yama', name:'資源豊富な山', type:'land', color:'R',
    produces:'R', icon:'⛏️',
    text:'■起動(タップ):赤1マナ生成\n〈OC〉\n■起動(自身の還元):赤3マナ生成。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'kaizouReturnRed'
  },
  'kemono_yama': {
    id:'kemono_yama', name:'獣住む山', type:'land', color:'R',
    produces:'R', icon:'🐾',
    text:'■起動(タップ):赤1マナ生成\n■起動(自身の還元):相手クリーチャー1体に5ダメージ。これはこの土地がチャージされているときのみ起動できる',
    chargedAbility:'damage5opponent'
  },
  'daikazoku_ie': {
    id:'daikazoku_ie', name:'大家族の家', type:'land', color:'C',
    produces:'C', icon:'🏠',
    text:'■起動(タップ)：1マナ生成\n■起動(タップ)：自分の赤のクリーチャー1体に「格闘」を与え、+1/+0する。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'giveKakutouBuffRed'
  },
  // ─── 青デッキ ───
  'omnieru': {
    id:'omnieru', name:'万象蒐集会 部長 オムニエル', type:'creature', color:'U',
    cost:{U:3,C:5}, power:4, toughness:4, subtype:'人間(ウィザード)', icon:'👑',
    keywords:['護法3','還元'],
    ward:3, wardValue:3,
    text:'■護法(3)：このクリーチャーを対象にする場合、追加で3マナ必要\n■出た時またはターン開始時、山札の下に好きなだけカードを置く。その後、手札が5枚になるように引く\n■このターン、自分が2枚目以降のカードを引く時、相手クリーチャーに2ダメージ\n■起動（還元）：2枚引く。その後、山札の下に2枚置く',
    onDrawTrigger2nd:'damage2creature',
    etb:'omnieru_hand5'
  },
  'aaka': {
    id:'aaka', name:'万象蒐集会 副部長 アーカ', type:'creature', color:'U',
    cost:{U:4}, power:2, toughness:2, subtype:'人間(ウィザード)', icon:'📚',
    keywords:['格闘','C6','C8','OC'],
    kakutou:true,
    text:'■格闘\n■攻撃時、1枚引く\n〈C6〉\n■このターン、自分が2枚目以降のカードを引く時、+0/+1\n〈C8〉\n■+3/+3\n〈OC〉\n■自分のターン開始時、1枚引く',
    onAttack:'draw1',
    onDrawTrigger2ndC6:'buffSelfPlus01',
    cx8Buff33:true,
    ocTurnStartDraw:true
  },
  'chishiki_maju': {
    id:'chishiki_maju', name:'知識集めの魔術師', type:'creature', color:'U',
    cost:{U:1,C:1}, power:1, toughness:1, subtype:'人間(ウィザード)', icon:'🔮',
    text:'■出た時、1枚引く',
    etb:'draw1'
  },
  'maju_gakusha': {
    id:'maju_gakusha', name:'魔導理論学者', type:'creature', color:'U',
    cost:{U:1,C:3}, power:3, toughness:3, subtype:'人間(ウィザード)', icon:'📖',
    keywords:['格闘'],
    kakutou:true,
    text:'■格闘\n■出た時、3ルック1(青)',
    etb:'look3keep1blue'
  },
  'bu_in': {
    id:'bu_in', name:'万象蒐集会部員', type:'creature', color:'U',
    cost:{U:1,C:1}, power:1, toughness:1, subtype:'人間(ウィザード)', icon:'📋',
    text:'■このターン、自分が2枚目以降のカードを引く時、相手クリーチャー1体に3ダメージ',
    onDrawTrigger2nd:'damage3creature'
  },
  'nexia': {
    id:'nexia', name:'万象蒐集会 書紀 ネクサ', type:'creature', color:'U',
    cost:{U:3,C:1}, power:3, toughness:3, subtype:'人間(ウィザード)', icon:'📝',
    keywords:['C8'],
    text:'■出た時、1枚引く\n■このターン、自分が2枚目以降のカードを引く時、相手クリーチャー1体に3ダメージ\n〈C8〉\n■このターン、自分が2枚目以降のカードを引く時、1枚引く(ターン1:自身)',
    etb:'draw1',
    onDrawTrigger2nd:'damage3creature',
    onDrawTrigger2ndC8:'draw1self'
  },
  'ao_geki': {
    id:'ao_geki', name:'青撃', type:'spell', color:'U',
    cost:{U:1}, icon:'💧', quick:true,
    keywords:['Quick'],
    text:'■1枚引く\n■相手のコスト4以下のクリーチャー1体に2ダメージ',
    effect:'ao_geki'
  },
  'chishiki_no_seiri': {
    id:'chishiki_no_seiri', name:'知識の整理', type:'spell', color:'U',
    cost:{U:4}, icon:'🌀',
    keywords:['OC'],
    text:'■1枚引く\n■手札を好きな枚数山札の下に置く。1枚につき、1回相手クリーチャー1体に2ダメージ\n〈OC〉\n■手札からマナ総量8以下の青のクリーチャー1体出す。この能力は手札が1枚の時しか発動しない（ターン１：同名）',
    effect:'chishiki_no_seiri'
  },
  'mizu_geki': {
    id:'mizu_geki', name:'水撃', type:'spell', color:'U',
    cost:{U:3}, icon:'🌊', quick:true,
    keywords:['Quick'],
    text:'■相手クリーチャー1体手札に戻す',
    effect:'mizu_geki'
  },
  'hitei': {
    id:'hitei', name:'否定', type:'spell', color:'U',
    cost:{U:2,C:2}, icon:'🚫', quick:true,
    keywords:['Quick'],
    text:'■スタックの一つ下を打ち消す',
    effect:'hitei'
  },
  'hito_shima': {
    id:'hito_shima', name:'人住まう島', type:'land', color:'U',
    produces:'U', icon:'🏝️',
    text:'■起動(タップ)：1マナ生成\n■起動(タップ)：3ルック1(青)。チャージ時のみ',
    chargedAbility:'look3keep1blue'
  },
  'wasure_shima': {
    id:'wasure_shima', name:'忘れ去られし島', type:'land', color:'U',
    produces:'U', icon:'🌫️',
    text:'■起動(タップ)：1マナ生成\n■チャージ時：1枚引く',
    chargeDrawTrigger:true
  },
  'shigen_shima': {
    id:'shigen_shima', name:'資源豊富な島', type:'land', color:'U',
    produces:'U', icon:'💎',
    text:'■起動(タップ)：1マナ生成\n■起動(タップ)：OC時、青3追加し土地デッキ底へ。チャージ時のみ',
    chargedAbility:'kaizouReturnBlue'
  },
  'kemono_shima': {
    id:'kemono_shima', name:'獣住む島', type:'land', color:'U',
    produces:'U', icon:'🐋',
    text:'■起動(タップ)：1マナ生成\n■還元：相手クリーチャー1体に5ダメージ',
    chargedAbility:'damage5opponent'
  },
  'gakuin': {
    id:'gakuin', name:'魔法学院', type:'land', color:'C',
    produces:'C', icon:'🏫',
    text:'■起動(タップ)：1マナ生成\n■起動(タップ)：自分の青のクリーチャー1体に「アタック時、1枚引く」を与える。これはチャージされているなら起動できる',
    chargedAbility:'giveDrawTriggerBlue'
  },

  // ============================================================
  // BLACK CARD DATABASE (SD破壊者の黒)
  // ============================================================
  // CREATURES
  'shiki': {
    id:'shiki', name:'死を食らうもの シキ', type:'creature', color:'B',
    cost:{C:5,B:3}, power:4, toughness:4, subtype:'人間(ネクロマンサー)', icon:'💀',
    keywords:['還元'],
    text:'■出た時、山札の上から5枚墓地に置く。その後、自分の墓地の枚数1枚につき、相手のクリーチャーと相手のプレイヤーにダメージを割り振る\n■起動（還元）：お互いのプレイヤーは自身のクリーチャー1体を破壊する',
    etb:'shiki_distribute', activated:'shiki_sacrifice'
  },
  'ren': {
    id:'ren', name:'死を運ぶもの レン', type:'creature', color:'B',
    cost:{B:4}, power:3, toughness:3, subtype:'人間、ゾンビ(戦士)', icon:'☠️',
    keywords:['格闘','C6','C8','OC'],
    text:'■格闘\n■出た時、山札の上から2枚墓地に置く。その後、相手クリーチャー1体に2ダメージ\n〈C6〉\n■アタック時、相手クリーチャー1体を選ぶ。自分の墓地2枚につき1ダメージ\n〈C8〉\n■このクリーチャーは+3/+3される\n〈OC〉\n■自分の墓地からコストを支払ってカードを実行できる',
    kakutou:true, etb:'mill2_damage2', onAttack:'ren_c6_graveyard_damage', cx8Buff33:true, ocGraveyardCast:true
  },
  'yami_jouhouya': {
    id:'yami_jouhouya', name:'闇の情報屋', type:'creature', color:'B',
    cost:{C:3,B:1}, power:5, toughness:1, subtype:'人間(暗殺者)', icon:'🕵️',
    keywords:['格闘'],
    text:'■格闘\n■出た時、3ルック1(黒)',
    kakutou:true, etb:'look3keep1black'
  },
  'skeleton_senshi': {
    id:'skeleton_senshi', name:'スケルトンの戦士', type:'creature', color:'B',
    cost:{B:1}, power:0, toughness:1, subtype:'スケルトン', icon:'🦴',
    keywords:['接死'],
    text:'■接死',
    deathtouch:true
  },
  'itazura_obake': {
    id:'itazura_obake', name:'いたずらお化け', type:'creature', color:'B',
    cost:{C:1,B:2}, power:2, toughness:1, subtype:'ゴースト', icon:'👻',
    keywords:[],
    text:'■出た時、相手は自身の手札を1枚選んで捨てる',
    etb:'opp_discard1'
  },
  'haka_zombie': {
    id:'haka_zombie', name:'墓守ゾンビ', type:'creature', color:'B',
    cost:{C:1,B:1}, power:2, toughness:2, subtype:'人間、ゾンビ', icon:'🧟',
    keywords:[],
    text:'■出た時、自分の山札の上から2枚墓地に置き、相手クリーチャー1体に2ダメージ',
    etb:'mill2_damage2'
  },
  'taisei_zombie': {
    id:'taisei_zombie', name:'不屈の屍', type:'creature', color:'B',
    cost:{C:2,B:2}, power:4, toughness:3, subtype:'人間、ゾンビ', icon:'🧟‍♂️',
    keywords:['C8'],
    text:'■ダメージ以外でこのクリーチャーが離れる時、かわりに自身の手札を1枚捨ててもよい\n〈C8〉\n■ターン終了時、自分の墓地からマナ総量3以下のクリーチャー1体を出す',
    replaceLeaveWithDiscard:true, endTurnEffect:'taisei_c8_reanimate3'
  },
  'hakaatsume_yatoware': {
    id:'hakaatsume_yatoware', name:'墓荒らしの雇われ', type:'creature', color:'B',
    cost:{B:4}, power:3, toughness:3, subtype:'人間', icon:'⛏️',
    keywords:[],
    text:'■ターン終了時、山札の上から2枚見て、1枚を手札に、1枚を墓地に置く',
    endTurnEffect:'hakaatsume_look2split'
  },
  // SPELLS
  'shigoeki': {
    id:'shigoeki', name:'死越撃', type:'spell', color:'B',
    cost:{B:5}, icon:'⚰️', keywords:['OC'],
    text:'■相手のクリーチャー1体を破壊する\n■自分の山札の上から5枚を墓地に置き、その中から1枚を手札に加える\n〈OC〉\n■自分の墓地からマナ総量8以下の黒のクリーチャー1体を出す',
    effect:'shigoeki'
  },
  'kurogeki': {
    id:'kurogeki', name:'黒撃', type:'spell', color:'B',
    cost:{C:1,B:2}, icon:'🖤', keywords:[],
    text:'■相手クリーチャー1体を破壊する',
    effect:'kurogeki'
  },
  // LANDS
  'hito_numa': {
    id:'hito_numa', name:'人住まう沼', type:'land', color:'B',
    produces:'B', icon:'🐊',
    text:'■起動(タップ)：黒1マナ生成\n■起動(タップ&黒3マナ)：3ルック1(黒)。チャージ時のみ',
    chargedAbility:'look3keep1black'
  },
  'wasure_numa': {
    id:'wasure_numa', name:'忘れ去られし沼', type:'land', color:'B',
    produces:'B', icon:'🌑',
    text:'■起動(タップ)：黒1マナ生成\n■この土地がチャージされた時、1枚引く',
    chargeDrawTrigger:true
  },
  'shigen_numa': {
    id:'shigen_numa', name:'資源豊富な沼', type:'land', color:'B',
    produces:'B', icon:'🦇',
    text:'■起動(タップ):黒1マナ生成\n〈OC〉\n■起動(自身の還元):黒3マナ生成。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'kaizouReturnBlack'
  },
  'kemono_numa': {
    id:'kemono_numa', name:'獣住む沼', type:'land', color:'B',
    produces:'B', icon:'⛰️',
    text:'■起動(タップ):黒1マナ生成\n■起動(自身の還元):相手クリーチャー1体に5ダメージ。これはこの土地がチャージされている時のみ起動できる',
    chargedAbility:'damage5opponent'
  },
  'areta_haka': {
    id:'areta_haka', name:'荒れた墓', type:'land', color:'C',
    produces:'C', icon:'⚰️',
    text:'■起動(タップ):1マナ生成\n■起動(タップ):自分の山札から4枚墓地に置く。チャージ時のみ',
    chargedAbility:'mill4'
  },
  // ============================================================
  // GREEN CARD DATABASE (SD育成者の緑)
  // ============================================================
  'foklya': {
    id:'foklya', name:'村長樹妃 フォクリア', type:'creature', color:'G',
    cost:{C:3,G:3}, power:6, toughness:6, subtype:'', icon:'🌳',
    keywords:['格闘','貫通'],
    text:'■格闘　■貫通\n■出た時、2枚還元してもよい。そうした時、2枚引く\n■ランドが出た時、相手に2ダメージ\n■起動(還元):自分のクリーチャー1体選ぶ。それはこのターン離れない',
    kakutou:true, trample:true, etb:'foklya_kaizou2draw2', landEnterDamage2:true, activated:'foklya_protect'
  },
  'tami_kaitaku': {
    id:'tami_kaitaku', name:'民による開拓', type:'spell', color:'G',
    cost:{C:1,G:2}, icon:'🌱',
    keywords:[],
    text:'■開拓:1',
    effect:'kaitaku1spell'
  },
  'folkusu': {
    id:'folkusu', name:'古樹従 フォルクス', type:'creature', color:'G',
    cost:{G:4}, power:4, toughness:3, subtype:'ツリーフォーク', icon:'🌲',
    keywords:['格闘','貫通','C6','C8','OC'],
    text:'■格闘　■貫通\n〈C6〉\n■出た時、開拓1\n〈C8〉\n■＋3/＋3\n〈OC〉\n■＋4/＋4',
    kakutou:true, trample:true, etb:'folkusu_c6_kaitaku', cx8Buff33:true, ocBuff44:true
  },
  'kaitakusha': {
    id:'kaitakusha', name:'新米開拓者', type:'creature', color:'G',
    cost:{C:1,G:3}, power:3, toughness:3, subtype:'人間', icon:'⛏️',
    keywords:[],
    text:'■出た時、開拓:1',
    etb:'kaitaku1'
  },
  'mori_kansha': {
    id:'mori_kansha', name:'森への感謝', type:'spell', color:'G',
    cost:{G:4}, icon:'🍀',
    keywords:['OC'],
    text:'（1）相手クリーチャー1体に自分の土地の枚数分ダメージ\n（2）開拓:1\n〈OC〉\n自分の土地を2枚還元してもよい。そうした時、手札からマナ総量6以下のクリーチャー1体出す',
    effect:'mori_kansha'
  },
  'gen_jurei': {
    id:'gen_jurei', name:'源の樹霊', type:'creature', color:'G',
    cost:{C:3,G:3}, power:4, toughness:4, subtype:'ツリーフォーク', icon:'🌿',
    keywords:['格闘'],
    text:'■格闘\n■サーチ1',
    kakutou:true, etb:'search1'
  },
  'mori_tami': {
    id:'mori_tami', name:'樹守の民', type:'creature', color:'G',
    cost:{G:1}, power:2, toughness:2, subtype:'', icon:'🧑‍🌾',
    keywords:['格闘'],
    text:'■格闘',
    kakutou:true
  },
  'iwai_tami': {
    id:'iwai_tami', name:'祝いの民', type:'creature', color:'G',
    cost:{G:2}, power:2, toughness:2, subtype:'人間', icon:'🎊',
    keywords:[],
    text:'■自分の場にランドが出た時、相手クリーチャー1体に１ダメージ',
    landEnterDamage1creature:true
  },
  'matsuri_otoko': {
    id:'matsuri_otoko', name:'祭り男', type:'creature', color:'G',
    cost:{C:1,G:1}, power:1, toughness:1, subtype:'人間', icon:'🎆',
    keywords:[],
    text:'■自分の場にランドが出た時、＋1/＋1',
    landEnterBuff11:true
  },
  'kaitaku_miko': {
    id:'kaitaku_miko', name:'開拓祭りの巫女', type:'creature', color:'G',
    cost:{C:1,G:4}, power:4, toughness:3, subtype:'', icon:'⛩️',
    keywords:['格闘','C9'],
    text:'■格闘\n■出た時、開拓：1\n〈C9〉\n■自分の場にランドが出た時、1枚引く',
    kakutou:true, etb:'kaitaku1', cx9LandEnterDraw:true
  },
  // LANDS (Green)
  'hito_mori': {
    id:'hito_mori', name:'人住まう森', type:'land', color:'G',
    produces:'G', icon:'🌾',
    text:'■起動(タップ)：緑1マナ生成\n■起動(タップ&緑3)：3ルック1(緑)。チャージ時のみ',
    chargedAbility:'look3keep1green'
  },
  'wasure_mori': {
    id:'wasure_mori', name:'忘れ去られし森', type:'land', color:'G',
    produces:'G', icon:'🌫️',
    text:'■起動(タップ)：緑1マナ生成\n■この土地がチャージされた時、1枚引く',
    chargeDrawTrigger:true
  },
  'shigen_mori': {
    id:'shigen_mori', name:'資源豊富な森', type:'land', color:'G',
    produces:'G', icon:'🌴',
    text:'■起動(タップ):緑1マナ生成\n〈OC〉\n■起動(自身の還元):緑3マナ生成。チャージ時のみ',
    chargedAbility:'kaizouReturnGreen'
  },
  'kemono_mori': {
    id:'kemono_mori', name:'獣住む森', type:'land', color:'G',
    produces:'G', icon:'🐗',
    text:'■起動(タップ):緑1マナ生成\n■起動(自身の還元):相手クリーチャー1体に5ダメージ。チャージ時のみ',
    chargedAbility:'damage5opponent'
  },
  'matsuri_kaijo': {
    id:'matsuri_kaijo', name:'祭りの会場', type:'land', color:'C',
    produces:'C', icon:'🎪',
    text:'■起動(タップ):1マナ生成\n■起動(タップ):この土地以外の土地を1つアンタップ。チャージ時のみ',
    chargedAbility:'untapOtherLand'
  },
  'test_golem': {
    id:'test_golem', name:'テストゴーレム', type:'creature', color:'C',
    cost:{C:1}, power:1, toughness:1, subtype:'ゴーレム', icon:'🗿',
    keywords:[], unlimited:true,
    text:'■このカードはデッキに何枚でも入れられる'
  },
  'jikkenjou': {
    id:'jikkenjou', name:'実験場', type:'land', color:'C',
    produces:'C', icon:'🧪', unlimited:true, tapAbility:'buffPlus11',
    text:'■このカードはデッキに何枚でも入れられる\n■起動(タップ)：1マナ生成\n■起動(タップ)：自分のクリーチャー1体を+1/+1'
  },
};
