#!/bin/bash
# =============================================================================
# V7 统一风格批量生成脚本
# 风格基准：林天觉醒后 V3-3（日漫插画风格）
# 模型：MJ-Niji7 + sref 参考图控制
# 参数：stylize=250, chaos=25, quality=1
# 输出目录：06-generated/v7-unified/{characters,scenes,props}
# =============================================================================

set -e
# 工具在项目根目录的 tools/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "$PROJECT_ROOT"

# 风格参考图 URL（林天觉醒后 V3-3）— 2026-04-13 重新上传
SREF_URL="https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/2029b4175ab971b9c81f7ecf8998bc55f625db9e4aaa039134f2340a8cac822d.png?q-sign-algorithm=sha1&q-ak=AKIDv56FISEJUsKsMeELk0gmbNCGKTYSaZ3N&q-sign-time=1776061224%3B1776147624&q-key-time=1776061224%3B1776147624&q-header-list=host&q-url-param-list=&q-signature=c3e9d3a3528c1b6ed68a2856b54f62f4bd0ed2d3"

# 统一日漫风格锚点文本（从V3 task.json提取）
STYLE_ANCHOR="Japanese manga illustration clean delicate linework varying line weight soft cel-shading gentle gradient transitions large sparkling anime eyes detailed iris highlights soft pastel palette selective vibrant accents classic shonen manga proportion speed lines manga effect symbols screen tone texture emotional expressiveness soft ambient lighting elegant hair strands traditional Japanese comic aesthetic dynamic angles"

# 通用负向提示词（日漫风格排除项）
NEG_COMMON="text words letters numbers border frame watermark signature logo low quality blurry distorted anatomy bad proportions extra limbs missing limbs photorealistic realistic skin texture oil painting watercolor 3D render CGI bold thick outlines American comic book style hard edge shadows flat cel-shaded heavy black ink lines Western cartoon aesthetic chibi super-deformed big-head-small-body Q-version"

# 通用参数
COMMON_PARAMS="--mj-niji7 --stylize 250 --chaos 25 --quality 1 --sref ${SREF_URL} --sw 60"

# 输出基础目录
OUT_BASE="${PROJECT_ROOT}/projects/无限强化_漫剧_001/06-generated/v7-unified"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# =============================================================================
# 角色资产（7个）— 输出到 characters/
# =============================================================================

log "=== 开始生成角色资产 ==="

# 1. 林天觉醒后
log "[1/15] 林天觉醒后..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "Japanese manga character design sheet of Lin Tian post-awakening rising hero, three-row layout on solid gray background, Row 1 full body three-view: left front view standing tall straight spine expanded shoulders aura radiating outward same worn clothes but carried with dignity, center side view showing hardened lean musculature broadened shoulders strong posture, right back view old clothing billowing with power glowing silver markings on wrists visible golden energy emanating. Row 2 facial close-ups: left cold sharp gaze golden glowing pupils activated system marker calm oppressive expression slight smirk at corner of mouth, middle confident relaxed smile eyes no longer avoiding direct gaze transformation complete self-assured, right furious blazing golden pupils fully lit furrowed brow intense anger overwhelming pressure. Row 3 action poses: left standing tall hands naturally at sides air ripple concentric circles distorting around body subtle golden aura, center powerful straight punch fist extended punch creating visible air distortion shockwave effect, right dominant overlooking pose one hand in pocket looking down at below role reversal now the oppressor. Character details 18yo male lean hard musculature not exaggerated but defined shoulders opened wide spine fully erect black medium-long hair bangs blown back by aura revealing complete facial features golden glowing pupils as system activation marker skin tone brighter than before same worn gray-white training clothes but filled with power and dignity not shabby anymore. Effects subtle golden aura surrounding body air distortion ripples around form silver wrist markings glowing brighter faint golden energy leaking outward. Style anchor ${STYLE_ANCHOR} golden glow effects no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON weak posture slouching hunching timid scared eyes messy hair luxury armor fancy clothes modern clothes jacket hoodie jeans sneakers Western suit dress" \
  --output-dir "${OUT_BASE}/characters/" \
  --download-prefix "角色设计图-林天觉醒后-v7-" \
  --task-meta-file "${OUT_BASE}/characters/角色设计图-林天觉醒后-v7.task.json" &

# 2. 林天觉醒前
log "[2/15] 林天觉醒前..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "Japanese manga character design sheet of Lin Tian pre-awakening underdog, three-row layout on solid gray background, Row 1 full body three-view: left front view standing head down shoulders slightly hunched hands naturally at sides thin build, center side view showing slouched posture emphasizing skinny silhouette, right back view messy hair tail worn old clothes hem. Row 2 facial close-ups: left suppressed and exhausted looking down dark tired eyes pressed lips bangs covering half face, middle clenched fists knuckles white eyes hiding rage gritting teeth inner strength showing through, right desperate struggle dilated trembling pupils mouth quivering windblown bangs across face. Row 3 action poses: left hunched in corner hugging own shoulders head down excluded lonely posture, middle protective stance one arm across in front fierce sharp eyes sudden transformation from weak to strong, right one knee on ground one hand supporting body looking up defiantly blood on corner of mouth refusing to yield. Character details thin 18yo male teenager medium height narrow shoulders but large bone structure underneath messy black shoulder-length hair covering half of his face with bangs over one eye as signature look good facial features hidden by exhaustion and oppression dark tanned skin from malnutrition and sun exposure. Clothing worn gray-white training robe with visible patches and mending simple rope belt at waist worn-out cloth shoes oversized sleeves occasionally revealing faint silver spirit marking patterns on inner wrist. Style anchor ${STYLE_ANCHOR} high contrast muted tones no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON muscular buff tall handsome protagonist look clean neat hair short hair bright skin luxury clothes armor modern clothes" \
  --output-dir "${OUT_BASE}/characters/" \
  --download-prefix "角色设计图-林天觉醒前-v7-" \
  --task-meta-file "${OUT_BASE}/characters/角色设计图-林天觉醒前-v7.task.json" &

# 3. 林婉儿
log "[3/15] 林婉儿..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "Japanese manga character design sheet of Lin Wan'er younger sister emotional anchor, three-row layout on solid gray background, Row 1 full body three-view: left front view small delicate girl standing quietly hands clasped gently in front gentle posture, center side view petite slim silhouette long hair flowing down emphasizing fragile build, right back view long dark-brown hair in low ponytail or flowing free Hanfu skirt hem details visible. Row 2 facial close-ups: left tender gentle smile but worry hidden in large watery eyes soft caring expression, middle fearful clinging pulling someone sleeve red-rimmed eyes trembling lips seeking protection, right crying outburst huge round eyes widened tears splashing wide-open mouth shouting shape desperation. Row 3 action poses: left quiet standing hands clasped in front slightly bowed head well-behaved gentle demeanor, middle seeking protection body shrinking backward slightly one hand gripping person sleeve in front, right struggling crying one arm reaching forward desperately tears flying everywhere expression of extreme anguish and terror. Character details delicate petite 15-16yo female teenage girl shorter than average large expressive eyes as signature feature tears highly infectious when crying pale fair clean skin contrasting with brother soft pretty facial features. Hair long dark-brown almost black hair usually tied in low ponytail or let down freely soft neat never wild. Clothing ancient Chinese Hanfu style dress pale cyan or light white color cross-collar ruqun design extra-wide long sleeves specifically to cover wrist markings plain silk sash ribbon at waist modest ankle-length skirt hem simple clean unadorned fabric. Special silver spirit pattern markings on inner wrist denser and brighter than brothers occasionally peeking from under wide sleeves with faint glow. Style anchor ${STYLE_ANCHOR} soft palette light base tones pale cyan white clothing color high contrast emotional lighting no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON tall muscular athletic mature woman sexy revealing clothes short hair messy hair dark skin heavy makeup armor combat gear weapon modern clothes Western dress suit chibi cute doll-like baby-faced" \
  --output-dir "${OUT_BASE}/characters/" \
  --download-prefix "角色设计图-林婉儿-v7-" \
  --task-meta-file "${OUT_BASE}/characters/角色设计图-林婉儿-v7.task.json" &

# 4. 林傲天
log "[4/15] 林傲天..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "Japanese manga character design sheet of Lin Aotian villain genius, three-row layout on solid gray background, Row 1 full body three-view: left front view standing with arms crossed chin raised weight on one leg, center side view chest out head up showing armor silhouette, right back view showing golden patterns on armor back and cape. Row 2 facial close-ups: left arrogant cold smirk one corner of mouth raised looking down with contempt raised chin, middle smug confident smile one eyebrow raised sideways glance victorious expression, right shocked terrified face dilated pupils pale face sweat on forehead mouth slightly open. Row 3 action poses: left arms crossed looking down at someone with oppressive body language leaning forward, middle palm strike forward with purple lightning crackling around arm and fingers, right stomping down pose with head thrown back laughing wildly. Character details tall muscular 19yo male 185cm broad shoulders inverted triangle physique neat short black-brown hair 4cm length styled swept-back exposing full forehead sharp sword-like eyebrows narrow slightly upturned eyes with disdainful gaze high nose bridge strong jawline naturally upturned corners of mouth. Armor ancient Chinese fantasy dark steel plate armor with gold lightning spirit patterns hard shoulder guards with gold thunder spiral trim semi-open chest piece with golden lightning emblem in center arm guards running from shoulder to wrist with gold patterns dark high-collar inner shirt with gold trim crossed chest straps metal buckles fitted armored pants with gold-trimmed knee guards ankle-high dark boots with gold accents wide leather belt with gold buckle fingerless combat gloves optional short dark cape. Style anchor ${STYLE_ANCHOR} detailed material textures dramatic lighting villain aura golden accents cinematic quality no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON modern clothes jacket hoodie t-shirt jeans sneakers Western costume suit tie dress skirt feminine features slim body weak posture humble expression sad eyes friendly smile superhero costume sci-fi bodysuit futuristic robot mecha beard mustache" \
  --output-dir "${OUT_BASE}/characters/" \
  --download-prefix "角色设计图-林傲天-v7-" \
  --task-meta-file "${OUT_BASE}/characters/角色设计图-林傲天-v7.task.json" &

# 5. 执事长老
log "[5/15] 执事长老..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "Japanese manga character design sheet of Elder Steward ceremony officiant testing proctor, three-row layout on solid gray background, Row 1 full body three-view: left front view elderly man standing tall and straight holding wooden ceremonial staff serious dignified bearing not stooped despite age, center side view slender but upright elderly physique thin but wiry martial artist foundation visible in posture, right back view white hair in topknot with simple crown grey robe trailing hem wooden staff details. Row 2 facial close-ups: left stern serious white eyebrows slightly furrowed long white beard flowing down face completely expressionless unsmiling officious demeanor, middle announcing ceremony chin lifted slightly mouth open mid-speech projecting authority ritual voice, right shocked surprised eyebrows raised extremely high eyes widened disbelief something unexpected occurred during testing. Row 3 action poses: left presiding on elevated platform holding staff in one hand other hand gesturing flat to signal ceremony beginning formal official posture, center evaluating assessment one hand stroking beard thoughtfully other hand behind back slight nod or dismissive lip curl judging participants, right recoiling shocked body stepping back half-step staff nearly slipping from grasp face full of astonishment dismay. Character details elderly man 60-70yo slender thin build but remarkably straight-postured not hunched or bent demonstrating lifelong martial foundation beneath aged exterior. Face prominent white bushy eyebrows as key visual identifier long white beard flowing down to chest deep-set eyes that remain piercingly sharp despite age severe stern permanent expression wrinkled face showing wisdom and severity weathered complexion. Hair white hair tied up in traditional topknot secured with simple dark crown or hairpin neat orderly befitting disciplined elder status. Clothing grey long robe simple modest but immaculately clean dark subtle pattern trim at cuffs indicating elder rank status dark sash belt at waist overall impression of humble authority. Accessory wooden ceremonial staff held in right hand plain dark wood with minimal carving used for conducting spirit pattern testing ceremonies. Style anchor ${STYLE_ANCHOR} traditional gravitas dramatic facial wrinkle definition grey base tones wood white accent highlights no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON young middle-aged muscular hunched bent over stooped weak frail smiling kindly warm grandfather black hair brown hair colorful clothes armor combat gear fancy robe modern clothes casual chibi cute doll-style cartoonish" \
  --output-dir "${OUT_BASE}/characters/" \
  --download-prefix "角色设计图-执事长老-v7-" \
  --task-meta-file "${OUT_BASE}/characters/角色设计图-执事长老-v7.task.json" &

# 6. 林啸
log "[6/15] 林啸..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "Japanese manga character design sheet of Lin Xiao patriarch mastermind villain, three-row layout on solid gray background, Row 1 full body three-view: left front view stern authoritative standing posture hands clasped behind back chin slightly raised imposing presence, center side view showing well-proportioned middle-aged build and patriarch robe silhouette dignified bearing, right back view clan leader token hanging at waist back of dark robe family embroidery visible. Row 2 facial close-ups: left cold indifferent inspection expressionless face looking down from above tight-pressed lips corners turned slightly downward, middle calculating sinister squinted eyes narrowed to slits corners of mouth subtly raised deep scheming intelligence visible between brows, right oppressive authority furrowed brows tight gaze like a blade natural commanding presence intimidating without anger. Row 3 action poses: left seated on high patriarch throne hands resting on armrests looking down at subordinates absolute authority position, center hands behind back turning head to glance back sharp assessing scan of surroundings, right pointing command gesture one finger directed downward or forward unquestionable order tone in body language. Character details middle-aged man 40-45yo above average height well-built proportional physique naturally commanding presence radiates authority without needing to speak. Face stern sharp features high cheekbones deep-set eyes with calculating cunning look vertical frown line between brows from years of scheming mouth naturally turned slightly downward pale complexion from indoor life spent in power. Hair dark black hair tied back neatly in traditional topknot or ponytail distinctive silver streaks at temples signifying age and authority status. Clothing dark near-black clan leader patriarch long robe with subtle gold embroidery featuring clan emblem patterns wide gold sash at waist with hanging clan leader token medallion shoulder area decorated with dark-gold ornamental trim indicating highest rank overall color scheme predominantly dark with restrained gold accents symbolizing power. Style anchor ${STYLE_ANCHOR} dark ominous undertone harsh facial angles very dark base tones subtle gold accents no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON young youthful boyish friendly expression warm smile kind eyes messy hair short hair bright colorful clothes armor warrior modern clothes heroic good guy energy superhero" \
  --output-dir "${OUT_BASE}/characters/" \
  --download-prefix "角色设计图-林啸-v7-" \
  --task-meta-file "${OUT_BASE}/characters/角色设计图-林啸-v7.task.json" &

# 7. 林战
log "[7/15] 林战..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "Japanese manga character design sheet of Lin Zhan absent hero father figure, three-row layout on solid gray background, Row 1 full body three-view: left front view tall heroic imposing figure standing straight as a spear broad shoulders thick back powerful build radiating quiet strength, center side view showcasing heroic silhouette wide upper body battle-ready posture confident stance, back view long dark hair flowing in wind battle robe cape trailing behind sword hilt visible at waist. Row 2 facial close-ups: left resolute steadfast gaze looking into distance firm jawline silent unshakable strength heroic determination in eyes, middle tender look back toward children behind him expression softening dramatically warmth replacing stoicism slight gentle smile at corners of mouth, right determined farewell closed eyes or gazing far away peaceful calm acceptance no fear only resolve sacrifice written on face. Row 3 action poses: left heroic standing pose hands naturally at sides spine absolutely straight like an unmovable mountain towering stillness, center turning half-back to glance behind at small children figures one hand slightly reaching back toward them paternal protectiveness, right holding artifact one hand holding faintly glowing silver mysterious object forbidden artifact not fully revealed dramatic backlighting silhouette effect. Character details heroic middle-aged man 35-40yo tall and broad-shouldered powerful athletic build not bulky but densely muscled upright military-perfect posture radiates natural leadership and heroic presence. Face strong angular jawline defined cheekbones firm brow ridge masculine features suggesting honor and courage expression typically composed and stoic but capable of great warmth. Hair long black hair tied simply with plain cloth band or ribbon hair has natural movement and flow suggesting wind-blown heroic quality. Clothing dark gray hero battle robe simpler and more practical than noble robes but carrying battlefield authenticity minimal ornamentation clean functional design with subtle silver accents at edges fitted armor pieces at key protection points without decorative excess overall color scheme dark gray with silver trim suggesting humble nobility. Accessories sword at waist sheath bearing silver spirit pattern markings connecting to forbidden artifact mystery. Style anchor ${STYLE_ANCHOR} noble heroic undertone occasional backlighting for silhouette moments dark-gray base tones silver accent highlights no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON young boyish old frail hunching weak evil expression sinister look cruel eyes messy unkempt hair short bald flashy ornate armor excessive decoration gold-heavy modern clothes casual villainous anti-hero darkness sci-fi futuristic robot mecha" \
  --output-dir "${OUT_BASE}/characters/" \
  --download-prefix "角色设计图-林战-v7-" \
  --task-meta-file "${OUT_BASE}/characters/角色设计图-林战-v7.task.json" &

wait
log "=== 角色资产生成完成 ==="

# =============================================================================
# 场景资产（3个）— 输出到 scenes/
# =============================================================================

log "=== 开始生成场景资产 ==="

# 8. 联邦全景
log "[8/15] 联邦全景..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 16:9 \
  --prompt "epic aerial view of a post-apocalyptic walled city massive translucent blue energy dome barrier covering the entire city inside the dome dense buildings mixing ancient Chinese architecture with futuristic ruins outside the dome barren wasteland with yellowish sand and distant monster silhouettes heavy gray clouds in the sky dramatic scale showing contrast between safety inside and danger outside cinematic wide shot. Style anchor ${STYLE_ANCHOR} dark atmospheric color palette blue energy glow environmental storytelling vast scale composition no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON people characters humans bright colorful cheerful" \
  --output-dir "${OUT_BASE}/scenes/" \
  --download-prefix "场景氛围图-联邦全景-v7-" \
  --task-meta-file "${OUT_BASE}/scenes/场景氛围图-联邦全景-v7.task.json" &

# 9. 林家练武场
log "[9/15] 林家练武场..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 16:9 \
  --prompt "post-apocalyptic ancient Chinese martial arts arena wide open training ground with cracked gray stone floor a massive tall black monolith standing in the center with glowing multicolored spirit runes flowing across its surface thick stone pillars forming a perimeter with ancient carved patterns stone step spectator stands on the sides scorching sun overhead faint curved energy barrier dome visible in the distant sky oppressive solemn atmosphere. Style anchor ${STYLE_ANCHOR} gray-brown earth-yellow color palette blue-black monolith accent environmental storytelling grand scale arena composition dramatic overhead sunlight no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON people characters humans crowd audience bright cheerful indoor" \
  --output-dir "${OUT_BASE}/scenes/" \
  --download-prefix "场景氛围图-林家练武场-v7-" \
  --task-meta-file "${OUT_BASE}/scenes/场景氛围图-林家练武场-v7.task.json" &

# 10. 家主大殿
log "[10/15] 家主大殿..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 16:9 \
  --prompt "interior of a dark ancient Chinese clan hall ornate patriarch throne on a raised platform with dark gold carvings thick stone pillars on both sides with clan crest engravings dark stone floor with dark red carpet leading to the throne dramatic light streaming from high windows creating strong light and shadow contrast most of the hall in darkness with only the throne area illuminated oppressive authoritative atmosphere. Style anchor ${STYLE_ANCHOR} dark red black gold color palette dark purple accents chiaroscuro lighting interior depth atmospheric perspective power imbalance visual storytelling no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON people characters humans bright evenly-lit cheerful modern furniture" \
  --output-dir "${OUT_BASE}/scenes/" \
  --download-prefix "场景氛围图-家主大殿-v7-" \
  --task-meta-file "${OUT_BASE}/scenes/场景氛围图-家主大殿-v7.task.json" &

wait
log "=== 场景资产生成完成 ==="

# =============================================================================
# 道具资产（5个）— 输出到 props/
# =============================================================================

log "=== 开始生成道具资产 ==="

# 11. 灵纹碑石
log "[11/15] 灵纹碑石..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "prop design sheet of Spirit Rune Monolith two-row layout on solid gray background Row 1 three-view of a tall black monolith about 10 meters high front view side view back view glossy black surface with carved intertwining spirit rune patterns seven-colored faint light flowing across surface golden carved text at the top stone base embedded in ground with ancient array patterns Row 2 three interaction states dormant state with dim runes and faint seven-colored light activated state with lightning explosion purple thunder crackling bright golden text blazing failed state with brief dim flash then darkness showing faint text consistent design. Style anchor ${STYLE_ANCHOR} mystical prop illustration magical glow effects dark base palette multicolored rune accents no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON person human wearer cartoon simple" \
  --output-dir "${OUT_BASE}/props/" \
  --download-prefix "道具设计图-灵纹碑石-v7-" \
  --task-meta-file "${OUT_BASE}/props/道具设计图-灵纹碑石-v7.task.json" &

# 12. 金纹战甲
log "[12/15] 金纹战甲..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "armor design sheet of Golden Rune Battle Armor two-row layout on solid gray background Row 1 three-view of standalone armor without wearer front view side view back view dark gray-black full body armor with golden spirit rune patterns thick angular shoulder guards with golden thunder rune decorations chest plate with flowing golden rune lines arm guards with thunder patterns leg armor elite warrior equipment style Row 2 three detail close-ups shoulder guard close-up showing golden thunder rune engravings chest plate close-up showing golden rune pattern flow direction arm guard close-up with thunder runes and purple electric arc effects consistent design. Style anchor ${STYLE_ANCHOR} detailed metal leather textures dramatic lighting golden accents elite equipment feel material definition no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON person human wearer body model cartoon simple plastic toy" \
  --output-dir "${OUT_BASE}/props/" \
  --download-prefix "道具设计图-金纹战甲-v7-" \
  --task-meta-file "${OUT_BASE}/props/道具设计图-金纹战甲-v7.task.json" &

# 13. 禁忌遗物
log "[13/15] 禁忌遗物..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "prop design sheet of a mysterious silver glowing artifact on solid gray background multiple views View 1 silhouette view with bright silver-white glow obscuring details only outline visible handheld size View 2 held in a hand with silver light radiating outward illuminating fingers and wrist faint rune patterns visible in the glow View 3 close-up of the silver glow with swirling rune patterns matching wrist markings mysterious and suspenseful atmosphere. Style anchor ${STYLE_ANCHOR} silver-white cool blue color palette dark background mystery lighting ethereal glow effect particle effects suspenseful mood no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON fully revealed artifact clearly visible ordinary object cartoon simple" \
  --output-dir "${OUT_BASE}/props/" \
  --download-prefix "道具设计图-禁忌遗物-v7-" \
  --task-meta-file "${OUT_BASE}/props/道具设计图-禁忌遗物-v7.task.json" &

# 14. 系统UI面板
log "[14/15] 系统UI面板..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 1:1 \
  --prompt "UI design sheet of Infinite Enhancement System HUD panel 2x2 grid layout on solid gray background Top-left main panel full view semi-transparent golden sci-fi HUD with dark background gold borders showing power stats bar level info and spirit rune type Top-right notification popup window showing activation confirmation with golden glow Bottom-left activation moment panel shattering into golden light particles energy burst Bottom-right daily view mode semi-transparent floating quietly displaying stats peacefully fantasy-tech hybrid style golden particle effects holographic feel. Style anchor ${STYLE_ANCHOR} UI interface design sci-fi fantasy hybrid golden holographic effects particle burst transparent overlay tech-magic blend no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON cluttered messy opaque solid blocky real software screenshot photograph" \
  --output-dir "${OUT_BASE}/props/" \
  --download-prefix "道具设计图-系统UI面板-v7-" \
  --task-meta-file "${OUT_BASE}/props/道具设计图-系统UI面板-v7.task.json" &

# 15. 婚约红纸
log "[15/15] 婚约红纸..."
python3 tools/runninghub_client.py \
  $COMMON_PARAMS \
  --aspect-ratio 3:4 \
  --prompt "close-up prop design sheet of a traditional Chinese marriage contract on solid gray background vertical red rice paper document golden calligraphy writing subtle clan crest watermark pattern dark gold seal stamp at bottom right corner slightly curled edges showing age and use elegant and ominous ancient Chinese document texture multiple views showing different angles. Style anchor ${STYLE_ANCHOR} traditional Japanese manga prop illustration paper texture detail ominous elegance cultural artifact feel warm red gold color palette no text no border 8k quality" \
  --negative-prompt "$NEG_COMMON modern paper printed document computer text western envelope blue green colors" \
  --output-dir "${OUT_BASE}/props/" \
  --download-prefix "道具设计图-婚约红纸-v7-" \
  --task-meta-file "${OUT_BASE}/props/道具设计图-婚约红纸-v7.task.json" &

wait
log "=== 道具资产生成完成 ==="

log ""
log "=========================================="
log "  V7 统一风格批量生成全部完成！"
log "  输出目录: ${OUT_BASE}/"
log "=========================================="
