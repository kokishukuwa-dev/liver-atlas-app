// 肝臓3Dアトラス：解剖・生理・病態・種差・出典データ定義
window.LiverApp = window.LiverApp || {};

window.LiverApp.REFERENCES = {
  1: { short: "StatPearls: Physiology, Liver (NBK535438)", url: "https://www.ncbi.nlm.nih.gov/books/NBK535438/" },
  2: { short: "StatPearls: Anatomy, Liver (NBK500014)", url: "https://www.ncbi.nlm.nih.gov/books/NBK500014/" },
  3: { short: "StatPearls: Biliary Ducts (NBK459246)", url: "https://www.ncbi.nlm.nih.gov/books/NBK459246/" },
  4: { short: "StatPearls: Sphincter of Oddi (NBK557871)", url: "https://www.ncbi.nlm.nih.gov/books/NBK557871/" },
  5: { short: "Fiebig et al., PLoS ONE 2012 (PMID: 22363574)", url: "https://pubmed.ncbi.nlm.nih.gov/22363574/" },
  6: { short: "Halpern et al., Nature 2017 (PMID: 28166538)", url: "https://pubmed.ncbi.nlm.nih.gov/28166538/" },
  7: { short: "Wei et al., Science 2021 (PMID: 33632817)", url: "https://pubmed.ncbi.nlm.nih.gov/33632817/" },
  8: { short: "Poisson et al., J Hepatol 2017 (PMID: 27423426)", url: "https://pubmed.ncbi.nlm.nih.gov/27423426/" },
  9: { short: "Wisse et al., Gene Ther 2008 (PMID: 18401434)", url: "https://pubmed.ncbi.nlm.nih.gov/18401434/" },
  10: { short: "Jenne & Kubes, Nat Immunol 2013 (PMID: 24048121)", url: "https://pubmed.ncbi.nlm.nih.gov/24048121/" },
  11: { short: "Gola et al., Nature 2021 (PMID: 33239787)", url: "https://pubmed.ncbi.nlm.nih.gov/33239787/" },
  12: { short: "Gao et al., Hepatology 2008 (PMID: 18167066)", url: "https://pubmed.ncbi.nlm.nih.gov/18167066/" },
  13: { short: "Tsuchida & Friedman, Nat Rev Gastroenterol Hepatol 2017 (PMID: 28487545)", url: "https://pubmed.ncbi.nlm.nih.gov/28487545/" },
  14: { short: "Theise et al., Hepatology 1999 (PMID: 10573521)", url: "https://pubmed.ncbi.nlm.nih.gov/10573521/" },
  15: { short: "Moro-Sibilot et al., Gastroenterology 2016 (PMID: 27132185)", url: "https://pubmed.ncbi.nlm.nih.gov/27132185/" },
  16: { short: "Hendrikx et al., Gut 2023 (PMID: 36690432)", url: "https://pubmed.ncbi.nlm.nih.gov/36690432/" },
  17: { short: "Treyer & Müsch, Compr Physiol 2013 (PMID: 23720287)", url: "https://pubmed.ncbi.nlm.nih.gov/23720287/" },
  18: { short: "Gissen & Arias, J Hepatol 2015 (PMID: 26116792)", url: "https://pubmed.ncbi.nlm.nih.gov/26116792/" },
  19: { short: "Boyer, Compr Physiol 2013 (PMID: 23897680)", url: "https://pubmed.ncbi.nlm.nih.gov/23897680/" },
  20: { short: "Dawson et al., J Lipid Res 2009 (PMID: 19498215)", url: "https://pubmed.ncbi.nlm.nih.gov/19498215/" },
  21: { short: "Takahashi et al., J Lipid Res 2016 (PMID: 27638959)", url: "https://pubmed.ncbi.nlm.nih.gov/27638959/" },
  22: { short: "Tag et al., JoVE 2015 (PMID: 25741630)", url: "https://pubmed.ncbi.nlm.nih.gov/25741630/" },
  23: { short: "StatPearls: Gallstones (NBK459370)", url: "https://www.ncbi.nlm.nih.gov/books/NBK459370/" },
  24: { short: "StatPearls: Choledocholithiasis (NBK441961)", url: "https://www.ncbi.nlm.nih.gov/books/NBK441961/" }
};

window.LiverApp.LEVELS = [
  {
    id: 0,
    code: "L1",
    name: "肝臓全体と胆道系",
    subtitle: "臓器・血管・胆道・腸肝循環",
    scaleMouse: "臓器スケール（約 2–3 cm・模式）",
    scaleHuman: "臓器スケール（約 15–20 cm・模式）",
    summary: "肝葉と胆嚢、門脈・肝動脈・肝静脈の二重血流、総胆管からOddi括約筋を経て十二指腸・回腸へ巡る腸肝循環を俯瞰します。",
    refs: [1, 2, 3, 4, 5, 20, 22, 23, 24],
    legend: [
      { color: "#cc7062", label: "肝実質（肝葉）" },
      { color: "#349468", label: "胆嚢・肝管・総胆管" },
      { color: "#4a73b8", label: "門脈（血流約75%）" },
      { color: "#d94f4f", label: "肝動脈（血流約25%）" },
      { color: "#365685", label: "肝静脈・下大静脈" },
      { color: "#eab308", label: "胆汁酸粒子（腸肝循環）" }
    ]
  },
  {
    id: 1,
    code: "L2",
    name: "肝小葉の並び",
    subtitle: "門脈域（三つ組）と中心静脈",
    scaleMouse: "組織スケール（1小葉 約 0.5–1 mm・模式）",
    scaleHuman: "組織スケール（1小葉 約 1 mm・模式）",
    summary: "六角柱状の古典的肝小葉が敷き詰められ、頂点の門脈域（門脈枝・肝動脈枝・小葉間胆管）から中央の中心静脈へ向かって血液が流れます。",
    refs: [1, 2, 5, 22],
    legend: [
      { color: "#d69483", label: "肝小葉実質" },
      { color: "#4a73b8", label: "門脈枝（三つ組）" },
      { color: "#d94f4f", label: "肝動脈枝（三つ組）" },
      { color: "#349468", label: "小葉間胆管（三つ組）" },
      { color: "#365685", label: "中心静脈" },
      { color: "#b6a8c9", label: "小葉境界の結合組織（種差・線維化）" }
    ]
  },
  {
    id: 2,
    code: "L3",
    name: "1つの肝小葉",
    subtitle: "ゾーン1/2/3と逆向きの2つの流れ",
    scaleMouse: "単一小葉（約 0.5–1 mm・模式）",
    scaleHuman: "単一小葉（約 1 mm・模式）",
    summary: "門脈域→中心静脈への血流に伴い酸素・代謝勾配（Zone 1→2→3）が生じます。胆汁は血流と逆向きに中心側→門脈域の胆管へ排出されます。",
    refs: [1, 2, 6, 7, 19, 22],
    legend: [
      { color: "#e5896b", label: "Zone 1（門脈周囲・高O₂ / CPS1）" },
      { color: "#e9be70", label: "Zone 2（中間帯・再生源 / Hamp2）" },
      { color: "#7a97c7", label: "Zone 3（中心周囲・低O₂ / CYP2E1・GLUL）" },
      { color: "#d94f4f", label: "類洞血流（門脈域 → 中心静脈）" },
      { color: "#2ea068", label: "胆汁流（中心側 → 門脈域・逆向き）" }
    ]
  },
  {
    id: 3,
    code: "L4",
    name: "類洞・門脈域の細胞群",
    subtitle: "肝細胞索・有窓LSEC・免疫細胞・IgA",
    scaleMouse: "細胞スケール（肝細胞 約 20–30 µm・模式）",
    scaleHuman: "細胞スケール（肝細胞 約 20–30 µm・模式）",
    summary: "類洞内皮の窓とディッセ腔を介した物質交換、クッパー細胞の貪食、星細胞のビタミンA貯蔵、NK/NKT巡回、門脈域のIgA形質細胞とヘリング管を観察します。",
    refs: [8, 9, 10, 11, 12, 13, 14, 15, 16, 22],
    legend: [
      { color: "#dfb09a", label: "肝細胞索（1細胞厚）" },
      { color: "#f0b8ba", label: "類洞内皮細胞 LSEC（窓あり）" },
      { color: "#e07b39", label: "クッパー細胞（類洞内腔・貪食）" },
      { color: "#7b68b8", label: "肝星細胞（ディッセ腔・VitA滴）" },
      { color: "#2ba8c9", label: "NK細胞（類洞パトロール）" },
      { color: "#c8529a", label: "NKT細胞（マウス豊富・巡回）" },
      { color: "#4da885", label: "胆管細胞・ヘリング管" },
      { color: "#9c3d8a", label: "IgA形質細胞（門脈域）→ pIgR輸送" }
    ]
  },
  {
    id: 4,
    code: "L5",
    name: "毛細胆管と輸送体",
    subtitle: "基底側取り込み・頂端側排出・タイト結合",
    scaleMouse: "分子・細胞膜スケール（毛細胆管 約 1–2 µm・模式）",
    scaleHuman: "分子・細胞膜スケール（毛細胆管 約 1–2 µm・模式）",
    summary: "類洞側膜のNTCP/OATPで胆汁酸を取り込み、細胞内で抱合・合成後、毛細胆管側膜のBSEP/MRP2で排出します。タイトジャンクションが血液–胆汁関門を封鎖します。",
    refs: [17, 18, 19, 20, 21, 22],
    legend: [
      { color: "#4472c4", label: "NTCP（Na⁺依存性取り込み）" },
      { color: "#3d9ca8", label: "OATP（Na⁺非依存性取り込み）" },
      { color: "#2ca36b", label: "BSEP（ATP依存性・主排出ポンプ）" },
      { color: "#80b844", label: "MRP2（二価胆汁酸・抱合体排出）" },
      { color: "#e07a28", label: "タイトジャンクション（ZO-1/Claudin）" },
      { color: "#eab308", label: "胆汁酸分子（種差：MCA vs CA/CDCA）" }
    ]
  }
];

// クリック・ホバー時の詳細辞書（全構造ID）
window.LiverApp.STRUCTURES = {
  // === L1 ===
  liver_lobe_mouse: {
    name: "マウスの肝葉（4葉構造）",
    en: "Murine Liver Lobes (Median, Left Lateral, Right, Caudate)",
    desc: "マウス肝臓は深く分葉した4葉（内側葉［左右分枝］・外側左葉・右側葉・尾状葉）から成ります。胆嚢は内側葉の深い裂け目に収まります。",
    speciesNote: { mouse: "表示中：4つの明瞭な葉（内側葉・外側左葉・右側葉・尾状葉）。", human: "ヒトへ切り替えると一塊の4葉（右・左・方形・尾状）になります。" },
    stateNote: { normal: "滑らかな赤褐色の実質。", bdl: "胆汁うっ滞により黄緑〜黄土色味を帯び、肝腫大・線維化が進行します。", gallstone: "閉塞に伴う軽度〜中等度の胆汁うっ滞を呈します。" },
    refs: [5, 22]
  },
  liver_lobe_human: {
    name: "ヒトの肝葉（右葉・左葉・方形葉・尾状葉）",
    en: "Human Liver Lobes & Couinaud Segments",
    desc: "ヒト肝臓は外観上4葉（右葉・左葉・方形葉・尾状葉）に分かれ、門脈・肝静脈の支配領域により機能的に8区域（Couinaud分類）へ区分されます。",
    speciesNote: { human: "表示中：一体型で右葉が大きく、下面の胆嚢窩に胆嚢が接します。", mouse: "マウスでは4葉へ深く分かれます。" },
    stateNote: { normal: "均一な赤褐色の肝実質。", bdl: "総胆管閉塞に伴う胆汁うっ滞性の色調変化。", gallstone: "結石閉塞による胆汁うっ滞傾向。" },
    refs: [2]
  },
  gallbladder: {
    name: "胆嚢",
    en: "Gallbladder",
    desc: "肝臓で産生された胆汁を一時貯留・濃縮し、食事刺激（CCK）に応じて収縮して胆嚢管→総胆管経由で十二指腸へ送り出します。ラットと異なりマウスにも存在します。",
    speciesNote: { mouse: "内側葉（左右）の裂け目・胆嚢窩に埋まるように位置します。", human: "右葉下面と方形葉の間の胆嚢窩に付着します。" },
    stateNote: { normal: "適度な緊張を保った西洋梨状。", bdl: "総胆管結紮により胆汁が逃げ場を失い著明に腫大・緊満します。", gallstone: "内部に胆嚢結石（コレステロール結石等）が形成されています。" },
    refs: [2, 3, 5, 22, 23]
  },
  hepatic_ducts: {
    name: "左右肝管・総肝管・胆嚢管",
    en: "Hepatic Ducts & Cystic Duct",
    desc: "肝内胆管が合流して左右肝管→総肝管となり、胆嚢からの胆嚢管と合流して総胆管を形成します。",
    stateNote: { normal: "細い均等な管腔を保っています。", bdl: "結紮部より上流で内圧が上昇し、著明に拡張・蛇行します。", gallstone: "総胆管結石より上流の胆管が拡張しています。" },
    refs: [3, 22, 24]
  },
  cbd: {
    name: "総胆管（CBD）",
    en: "Common Bile Duct",
    desc: "総肝管と胆嚢管が合流した胆道の本幹で、膵頭部を貫通して十二指腸乳頭部（Oddi括約筋）へ開口します。",
    stateNote: { normal: "胆汁が十二指腸方向へ円滑に流れます。", bdl: "外科的結紮（BDL）により完全閉塞し、上流が著明に拡張します。", gallstone: "遠位部に総胆管結石が嵌頓し、胆汁の流れが遮断されています。" },
    refs: [3, 4, 22, 24]
  },
  oddi_sphincter: {
    name: "Oddi括約筋・十二指腸開口部",
    en: "Sphincter of Oddi / Major Duodenal Papilla",
    desc: "総胆管（および膵管）が十二指腸に開口する部位を取り巻く平滑筋括約筋で、胆汁の流出調節と腸液逆流防止を担います。",
    refs: [4]
  },
  portal_vein: {
    name: "門脈",
    en: "Hepatic Portal Vein",
    desc: "胃・小腸・大腸・脾臓などからの静脈血を集め、肝血流の約75%を供給します。栄養素・再吸収された胆汁酸・腸内細菌由来成分（腸肝軸）が肝臓へ流入します。",
    refs: [1, 2, 20]
  },
  hepatic_artery: {
    name: "固有肝動脈",
    en: "Proper Hepatic Artery",
    desc: "酸素豊富な動脈血を肝血流の約25%供給します。門脈血と類洞入口部で合流し、肝細胞や胆管上皮（特に胆管周囲血管叢）へ酸素を届けます。",
    refs: [1, 2]
  },
  hepatic_vein: {
    name: "肝静脈・下大静脈（IVC）",
    en: "Hepatic Veins & Inferior Vena Cava",
    desc: "各肝小葉の中心静脈が合流して肝静脈となり、肝臓の上背面から下大静脈（IVC）へ注ぎ体循環へ戻ります。",
    refs: [1, 2]
  },
  duodenum_ileum: {
    name: "十二指腸・回腸再吸収ループ（模式）",
    en: "Duodenum & Enterohepatic Circulation Loop (Schematic)",
    desc: "総胆管から十二指腸へ分泌された胆汁酸は脂質の乳化・吸収を助けた後、約95%が回腸末端（ASBT輸送体）で能動的に再吸収され、門脈を通って肝臓へ戻る「腸肝循環」を形成します。",
    schematic: true,
    refs: [4, 20]
  },
  bdl_ligature: {
    name: "総胆管結紮部位（BDL）",
    en: "Bile Duct Ligation Site",
    desc: "マウス・ラットで代表的な閉塞性胆汁うっ滞・胆汁性線維化モデル。総胆管を結紮することで上流胆管の拡張、胆汁うっ滞、胆管増生、炎症細胞浸潤、星細胞活性化と門脈周囲性線維化を誘発します。",
    refs: [22]
  },
  gallstone_gb: {
    name: "胆嚢結石（コレステロール／色素結石）",
    en: "Gallbladder Stones (Cholelithiasis)",
    desc: "胆汁中のコレステロール過飽和や胆嚢収縮能低下などにより胆嚢内で形成される結石です。",
    refs: [23]
  },
  gallstone_cbd: {
    name: "総胆管結石（嵌頓部位）",
    en: "Common Bile Duct Stone (Choledocholithiasis)",
    desc: "胆嚢から落下または胆管内で形成された結石が総胆管遠位部に嵌頓した状態。胆汁の十二指腸への排出が止まり、上流胆管の拡張・黄疸・胆管炎を引き起こします。",
    refs: [24]
  },

  // === L2 ===
  lobule_array: {
    name: "古典的肝小葉の配列",
    en: "Classic Hepatic Lobule Array",
    desc: "肝実質は直径約0.5–1 mm（マウス）〜約1 mm（ヒト）の六角柱状の肝小葉が密に並ぶ構造単位として理解されます。",
    speciesNote: { mouse: "マウスでは門脈域の結合組織が疎で、小葉同士の境界は顕微鏡下では不明瞭です。", human: "ヒトもブタほど厚い隔壁はありませんが、マウスより門脈域周囲の結合組織が明瞭です。" },
    stateNote: { normal: "均一な六角柱パターン。", bdl: "門脈域を中心に線維性隔壁が伸び（架橋線維化方向）、胆管拡張と胆汁うっ滞が目立ちます。", gallstone: "門脈域の胆管拡張と軽度のうっ滞像。" },
    refs: [1, 2, 5, 22]
  },
  portal_triad: {
    name: "門脈域（グリソン鞘・三つ組）",
    en: "Portal Triad (Portal Vein, Hepatic Artery, Bile Duct)",
    desc: "六角形小葉の各頂点に位置し、門脈枝・肝動脈枝・小葉間胆管（＋リンパ管・神経）が結合組織に包まれて並走します。",
    stateNote: { normal: "3つの管腔が整然と並びます。", bdl: "胆管の拡張・増生（ductular reaction）、炎症細胞浸潤、結合組織増生が顕著です。", gallstone: "小葉間胆管がやや拡張し胆汁が滞留します。" },
    refs: [1, 2, 22]
  },
  central_vein: {
    name: "中心静脈（終末肝細静脈）",
    en: "Central Vein (Terminal Hepatic Venule)",
    desc: "肝小葉の中央を貫く静脈で、周囲すべての類洞から流れ込んだ血液を集め、肝静脈→下大静脈へと送り出します。",
    refs: [1, 2]
  },

  // === L3 ===
  zone1: {
    name: "ゾーン1（門脈周囲帯 / Periportal）",
    en: "Zone 1 (Periportal Zone)",
    desc: "門脈域に最も近く酸素分圧が高い（目安 約60–65 mmHg）。尿素回路（CPS1, ASS1）、糖新生、β酸化、コレステロール合成など酸素要求性の高い代謝を担います。クッパー細胞も優位に分布します。",
    refs: [1, 6, 11]
  },
  zone2: {
    name: "ゾーン2（中間帯 / Midlobular）",
    en: "Zone 2 (Midlobular Zone)",
    desc: "ゾーン1と3の中間領域。鉄恒常性（ヘプシジン Hamp2 / Igfbp2）に関与し、定常状態における肝細胞の主な増殖・再生供給源であることが示されています（Wei et al., Science 2021）。",
    refs: [6, 7]
  },
  zone3: {
    name: "ゾーン3（中心静脈周囲帯 / Pericentral）",
    en: "Zone 3 (Pericentral Zone)",
    desc: "中心静脈に最も近く生理的低酸素（目安 約30–35 mmHg）かつ高Wnt/β-カテニン環境。薬物代謝酵素（CYP2E1, CYP1A2）、グルタミン合成酵素（GLUL：中心静脈直近1–2層）、解糖、脂質合成、胆汁酸合成律速酵素（CYP7A1）が優位です。",
    refs: [1, 6]
  },
  sinusoid_flow: {
    name: "類洞血流（門脈域 → 中心静脈）",
    en: "Sinusoidal Blood Flow (Centripetal)",
    desc: "門脈枝と肝動脈枝の血液が混合し、類洞を通って外周の門脈域から中央の中心静脈へ向かって求心性に流れます。",
    refs: [1, 2]
  },
  bile_flow_reverse: {
    name: "胆汁の流れ（中心側 → 門脈域・逆向き）",
    en: "Bile Flow (Centrifugal — Opposite to Blood)",
    desc: "肝細胞間の毛細胆管に分泌された胆汁は、血流とは全く逆向きに中心側から外周の門脈域（ヘリング管 → 小葉間胆管）へ遠心性に流れます。",
    stateNote: { normal: "門脈域胆管へ向かって途切れず流れます。", bdl: "下流閉塞のため流れが停滞・逆圧上昇し、毛細胆管内に胆汁うっ滞が起こります。", gallstone: "閉塞により流出速度が大幅に低下・停滞します。" },
    refs: [1, 2, 19, 22]
  },

  // === L4 ===
  hepatocyte_cord: {
    name: "肝細胞索（1細胞厚の肝細胞板）",
    en: "Hepatocyte Plate / Cord",
    desc: "成体哺乳類では1細胞厚の板状に連なり、両側面（基底外側膜）がディッセ腔を介して類洞に面し、隣接肝細胞との間（頂端膜）に毛細胆管を形成する多極性上皮細胞です。",
    refs: [1, 17]
  },
  lsec: {
    name: "類洞内皮細胞（LSEC・有窓構造）",
    en: "Liver Sinusoidal Endothelial Cell (Fenestrated)",
    desc: "基底膜を欠き、篩板（sieve plate）状に集まる小孔「窓（fenestrae）」をもつ特殊な内皮細胞。血球を通さず血漿成分・リポ蛋白・胆汁酸等をディッセ腔へ自由に透過させます。",
    speciesNote: { mouse: "マウス（C57BL/6）の窓径は平均約 141 nm とヒトよりやや大きめです。", human: "ヒトの窓径は平均約 107 nm とマウスより小さめです。" },
    stateNote: { normal: "多数の窓が開いた高透過性内皮。", bdl: "慢性障害に伴い窓が減少する「毛細血管化（capillarization）」傾向を示します。", gallstone: "軽度の内皮ストレス。" },
    refs: [8, 9]
  },
  space_of_disse: {
    name: "ディッセ腔（類洞周囲腔）",
    en: "Space of Disse (Perisinusoidal Space)",
    desc: "類洞内皮細胞（LSEC）と肝細胞基底側微絨毛の間の狭い空間。血漿濾液が満たされ、肝星細胞が常在します。",
    stateNote: { normal: "微絨毛が伸び、物質交換が活発な疎な空間。", bdl: "活性化星細胞がI/III型コラーゲン線維を沈着し、物質交換が阻害されます。", gallstone: "ほぼ保たれます。" },
    refs: [8, 13]
  },
  kupffer_cell: {
    name: "クッパー細胞（貪食マクロファージ）",
    en: "Kupffer Cell (Resident Macrophage)",
    desc: "類洞の「内腔側」でLSECに付着する肝常在マクロファージ。特に門脈周囲（Zone 1）に豊富に局在し、門脈血中の腸管由来細菌・LPS・細胞片を偽足で捕獲・貪食します。",
    stateNote: { normal: "門脈血中の異物を恒常的にクリアランス。", bdl: "炎症性サイトカイン（TGF-β等）を放出し、星細胞活性化と炎症細胞動員を促進します。", gallstone: "軽度活性化。" },
    refs: [10, 11, 22]
  },
  hsc: {
    name: "肝星細胞（HSC / 伊東細胞）",
    en: "Hepatic Stellate Cell (Quiescent / Activated)",
    desc: "ディッセ腔に存在する周皮細胞様細胞。正常時は細胞質にビタミンA（レチニルエステル）脂肪滴を豊富に貯蔵します。",
    stateNote: { normal: "静止期：明るい金黄色のビタミンA脂肪滴を多数保持。", bdl: "活性化：ビタミンA滴を失い筋線維芽細胞へ形質転換し、コラーゲン線維を大量産生して線維化を進めます。", gallstone: "静止期〜軽度活性化。" },
    refs: [13, 22]
  },
  nk_nkt: {
    name: "NK細胞・NKT細胞（類洞内パトロール）",
    en: "Hepatic NK & NKT Cells",
    desc: "類洞内腔のLSEC表面を這うように（crawling）パトロールする自然免疫・自然免疫様リンパ球。感染細胞・異常細胞や腸管由来糖脂質抗原を監視します。",
    speciesNote: { mouse: "マウス肝リンパ球ではNKT細胞が非常に豊富（約30–40%）です。", human: "ヒト肝リンパ球ではNK細胞が優位で、NKT細胞比率はマウスより大幅に低いです（約5–10%以下）。" },
    refs: [10, 11, 12]
  },
  canal_of_hering: {
    name: "ヘリング管・小葉間胆管（胆管細胞）",
    en: "Canal of Hering & Cholangiocytes",
    desc: "ヘリング管は毛細胆管と門脈域の小葉間胆管をつなぐ移行部で、管壁の一部が肝細胞、残りが立方状の胆管細胞（一次線毛あり）で裏打ちされます。",
    stateNote: { normal: "細い移行管から整然とした小葉間胆管へ連続。", bdl: "胆管増生（ductular reaction）：反応性胆管細胞が門脈域周囲へ網目状に著しく増殖・拡張します。", gallstone: "内圧上昇により胆管腔が拡張します。" },
    refs: [14, 17, 22]
  },
  portal_iga_plasma: {
    name: "門脈域の免疫細胞・IgA形質細胞",
    en: "Portal Tract Lymphocytes & IgA+ Plasma Cells",
    desc: "正常肝の門脈域にもリンパ球や形質細胞が存在します。特にパイエル板など腸管関連リンパ組織（GALT）で腸内細菌抗原に感作されたIgA産生形質細胞が門脈域へホーミングし、二量体IgAを分泌します。",
    speciesNote: {
      mouse: "マウスでは「肝細胞と胆管細胞の両方」がpIgRを発現し、IgAを胆汁中へトランスサイトーシス輸送します。",
      human: "健常ヒトではpIgR発現は主に「胆管細胞」に限局し、胆管経由で分泌型IgA（sIgA）が胆汁へ出ます。"
    },
    stateNote: { normal: "門脈域に少数のリンパ球・IgA形質細胞が常在。", bdl: "好中球・単球・リンパ球など多数の炎症細胞が門脈域へ著明に浸潤します。", gallstone: "胆管周囲に軽度の炎症細胞浸潤。" },
    refs: [15, 16, 22]
  },

  // === L5 ===
  ntcp: {
    name: "NTCP（Na⁺/タウロコール酸共輸送体 / SLC10A1）",
    en: "NTCP (Basolateral Bile Acid Uptake)",
    desc: "肝細胞の基底外側膜（類洞側）に局在し、門脈血中から戻ってきた抱合型胆汁酸をNa⁺勾配依存的に効率よく取り込む主要輸送体です。",
    refs: [19, 20]
  },
  oatp: {
    name: "OATP（有機アニオン輸送ポリペプチド）",
    en: "OATP1B1/1B3 (Human) / Oatp1a1/1b2 (Mouse)",
    desc: "肝細胞の基底外側膜に局在し、Na⁺非依存的に非抱合型胆汁酸、ビリルビン、各種薬物や有機アニオンを取り込みます。",
    refs: [19, 20]
  },
  bsep: {
    name: "BSEP（胆汁酸塩排出ポンプ / ABCB11）",
    en: "BSEP (Canalicular Bile Salt Export Pump)",
    desc: "肝細胞の頂端膜（毛細胆管側）に局在するATP依存性ABC輸送体。一価の抱合型胆汁酸塩を毛細胆管へ能動排出し、胆汁流の最大の駆動力を生み出します。",
    stateNote: { normal: "活発に胆汁酸を毛細胆管内腔へ汲み出します。", bdl: "閉塞性胆汁うっ滞では下流圧上昇と適応応答によりBSEPを介した排出が滞り、肝細胞内への胆汁酸蓄積が生じます。", gallstone: "内圧上昇により排出効率が低下します。" },
    refs: [19, 20, 22]
  },
  mrp2: {
    name: "MRP2（多剤耐性関連蛋白2 / ABCC2）",
    en: "MRP2 (Canalicular Organic Anion Efflux)",
    desc: "毛細胆管側膜に局在するATP依存性輸送体。グルクロン酸抱合ビリルビン、硫酸/グルクロン酸抱合の二価胆汁酸、グルタチオン抱合体などを排出します。",
    refs: [19]
  },
  tight_junction: {
    name: "タイトジャンクション（血液–胆汁関門）",
    en: "Tight Junctions (ZO-1 / Claudins / Occludin)",
    desc: "毛細胆管の両側で隣接肝細胞同士をジッパー状に密着封鎖し、高濃度の界面活性作用をもつ胆汁がディッセ腔や血中へ漏出するのを防ぐ関門です。",
    stateNote: { normal: "強固な血液–胆汁関門を維持。", bdl: "胆管内圧上昇により密着結合に機械的ストレス・透過性亢進が生じやすくなります。", gallstone: "内圧上昇に伴う軽度ストレス。" },
    refs: [17, 18, 22]
  },
  bile_acid_pool: {
    name: "肝細胞内の胆汁酸合成・抱合（種差）",
    en: "Intracellular Bile Acid Synthesis & Conjugation",
    desc: "再吸収された胆汁酸に加え、コレステロールからCYP7A1等を介して新規合成され、アミノ酸抱合を受けて親水性が高まります。",
    speciesNote: {
      mouse: "マウスは Cyp2c70 をもち、CDCAを親水性の高い α/β-ムリコール酸（MCA）へ変換。ほぼタウリン抱合（T-β-MCAはFXRアンタゴニスト）されます。",
      human: "ヒトはCYP2C70活性を欠き、コール酸（CA）とケノデオキシコール酸（CDCA）が主体。主にグリシン抱合（グリシン:タウリン≒3:1）されます。"
    },
    refs: [19, 21]
  },
  bile_canaliculus: {
    name: "毛細胆管（胆汁分泌の出発点）",
    en: "Bile Canaliculus",
    desc: "隣接する肝細胞の頂端膜同士が向かい合って作る直径約1–2 µmの微細管腔。内腔には微絨毛が突出し、ここからヘリング管→門脈域胆管へ向かって胆汁が流れ出ます。",
    stateNote: { normal: "微絨毛が整然と並ぶ細い管腔。", bdl: "胆汁うっ滞により管腔が拡張し、微絨毛の鈍化・胆汁栓様滞留がみられます。", gallstone: "内圧上昇により軽度拡張・滞留。" },
    refs: [17, 18, 19, 22]
  },
  ductular_reaction: {
    name: "胆管増生（Ductular Reaction）",
    en: "Ductular Reaction (Reactive Cholangiocytes)",
    desc: "BDLなどの胆汁うっ滞性肝障害において、門脈域周囲で反応性胆管細胞や前駆細胞が蛇行・網目状に著しく増殖する現象。TGF-β等の線維化促進因子を放出し星細胞を活性化します。",
    refs: [13, 22]
  },
  collagen_fibers: {
    name: "コラーゲン線維沈着・線維化",
    en: "Collagen Deposition / Periportal Fibrosis",
    desc: "活性化した肝星細胞（筋線維芽細胞）がディッセ腔や門脈域周囲へI型・III型コラーゲンを大量沈着し、門脈–門脈間の架橋線維化へと進行します。",
    refs: [13, 22]
  },
  inflammatory_cells: {
    name: "浸潤炎症細胞（好中球・単球）",
    en: "Infiltrating Neutrophils & Monocytes",
    desc: "胆汁うっ滞と肝細胞障害に伴い、門脈域および類洞へ好中球や単球由来マクロファージが動員され、炎症と線維化を増幅します。",
    refs: [10, 22]
  }
};
