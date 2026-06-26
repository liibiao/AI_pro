#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except Exception:  # pragma: no cover - package script can still run with fallback sizes
    Image = None


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "template-reference-input"
HTML_PATH = ROOT / "tools/workbench-web/image-studio-canvas-next.html"
LOCAL_PREVIEW_DIR = ROOT / "tools/workbench-web/assets/template-previews-original"
UPLOADER_PATH = ROOT / "smart-vision/services/workbench/object_storage_uploader.py"

TEMPLATE_SIZE_RATIOS = {
    "1:1": 1.0,
    "16:9": 16 / 9,
    "3:2": 3 / 2,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "2:3": 2 / 3,
    "9:16": 9 / 16,
}

STRICT_TEMPLATE_SUFFIX = (
    " 版式锁定要求：最高优先级是复刻所选模板缩略图的画布比例、分栏数量、模块顺序、主视觉位置、"
    "边框粗细、留白比例、标题标注风格、色卡/材质/三视图/五官特写/服装拆解等模块结构；"
    "只允许替换或重绘主体资产内容，不允许改变模板排版，不允许改成单张写真海报、普通肖像、拼贴错位或自由构图。"
    "替换角色时，参考角色只替换模板中所有人物形象的身份、五官、发型、服装和气质，模板布局必须保持一致。"
    " 禁止错配缩略图内容、禁止模板结构漂移、禁止乱码水印、禁止重复脸和肢体错误。"
)

PREPEND_TEMPLATES = [
    {
        "id": "simple_three_view_sheet",
        "label": "简单三视图设定板",
        "mode": "reference",
        "size": "16:9",
        "preview": "https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260604/29c90bd4bc5e475b8dee9e4b6bb00f6f.png",
        "desc": "正面 / 侧面 / 背面 / 简洁白底",
        "prompt": "参考缩略图版式生成简单三视图角色资产设定板：横向16:9白底或浅灰渐变背景，只展示同一角色正面、侧面、背面三张全身站姿，三人等比例、等间距、同一服装、同一发型、同一五官识别点，画面干净、少量标注或无标注，可直接用于角色一致性参考。版式锁定要求：最高优先级是复刻所选模板缩略图的横向三视图布局、人物比例、站姿间距、留白和简洁背景；只允许替换角色身份、五官、发型、服装和气质，不允许改成九宫格、复杂设定板、海报、半身肖像、拼贴错位或自由构图。禁止乱码文字、水印、重复脸、错误肢体、比例漂移。"
    },
]

SCENE_TEMPLATE = {
    "id": "scene_environment_board",
    "label": "场景空间设定板",
    "mode": "reference",
    "size": "16:9",
    "preview_expr": "sceneTemplatePreviewDataUrl()",
    "desc": "空间结构 / 俯视动线 / 光影 / 关键道具",
    "prompt": "参考缩略图版式生成场景空间资产设定板：横向16:9画布，包含一张主场景氛围图、一张空间关系图、一张俯视动线图，以及材质、光源、关键道具和镜头机位说明模块。主体必须是场景或空间，不允许出现角色设定板、人物五官、服装拆解或角色三视图。版式锁定要求：最高优先级是复刻所选模板缩略图的横向场景资产板结构、主场景位置、空间关系模块、俯视图模块、光影材质说明和留白比例；只允许替换场景内容、建筑/地形、道具、光线和氛围，不允许改成角色海报、人物设定集或普通风景单图。禁止乱码文字、水印、透视混乱、空间结构不可读、关键道具缺失。"
}

SPECS = [
    ("pink_nine_grid_character_sheet", "粉系九宫格设定板", "九宫格 / 三视图 / 五官 / 服装 / 材质",
     "参考缩略图版式生成粉系九宫格角色资产设定板：3列x3行细线分栏，包含基础信息、四角度三视图、眼唇微距、妆容变化、发型线稿、服装拆解、配饰、身体细节、色卡和材质参考。整体浅粉暖白、冷白、浅灰牛仔，角色身份、五官、发型、服装和配饰高度一致。"),
    ("pink_long_archive_board", "粉系长页全案板", "长页 / 大主视觉 / 三视图 / 表情 / 材质",
     "参考缩略图版式生成竖向长页角色资产全案板：一侧为大幅同一角色全身主视觉，另一侧和底部按细线分栏展示基础信息、角色关键词、多角度三视图、眼唇微距、妆容变化、发型设计、服装拆解、配饰、面料、身体细节、色彩和材质参考。"),
    ("industrial_idol_blueprint", "工业蓝图角色档案", "工程图 / 侧栏视角 / 五官 / 发型 / 服装",
     "参考缩略图版式生成工业设计蓝图式角色档案：白底黑色工程细线，包含编号日期、左侧多角度视图栏、中央大幅角色主视觉、右侧五官特写、妆容变化、发型线稿、身体细节、服装拆解、模特信息、材质、配饰和色卡。"),
    ("soft_profile_proportion_sheet", "角色比例档案板", "档案 / 面部比例 / 光影 / 姿势探索",
     "参考缩略图版式生成角色比例档案板：中央大幅半身或坐姿角色主视觉，左侧为角色档案、三庭五眼比例、眼部和唇部特写、妆容变化、发型设计，右侧为光影情绪、服装拆解、身体细节、配饰，底部为转身小图和姿势探索。"),
    ("portrait_detail_blueprint", "肖像细节蓝图板", "大肖像 / 眼唇 / 线稿 / 首饰 / 服装尺寸",
     "参考缩略图版式生成中心大肖像细节蓝图板：中央为角色正面近景或半身主视觉，四周环绕眼部结构、眉眼线稿、唇部色卡、发型线稿、首饰、针织纹理、上衣线稿、短裤尺寸和腿部比例，使用工程标注线和小色块。"),
    ("blue_sitting_knit_board", "雾蓝半身坐姿蓝图", "雾蓝近景 / 五官 / 发型 / 服装 / 首饰",
     "参考缩略图版式生成雾蓝半身坐姿角色资产板：中央为雾蓝针织外套、吊带和短裤角色近景或坐姿主视觉，周围包含眼部特写、唇部特写、妆容色卡、发型正侧背线稿、耳饰项链、服装工程图、手部和腿部比例。整体冷白雾蓝，照片与线稿模块混排。"),
    ("pink_knit_visual_sheet", "粉色针织设定板", "粉色主视觉 / 眉眼 / 唇色 / 材质 / 下装",
     "参考缩略图版式生成粉色针织角色蓝图：中央为粉色针织开衫、吊带和短裤主视觉，顶部和左右放眉眼结构、眼妆特写、唇部色卡、发型线稿、首饰、针织布料样块、服装尺寸、短裤结构与腿部比例。"),
    ("blue_knit_visual_sheet", "雾蓝针织设定板", "蓝色主视觉 / 五官 / 发型 / 服装 / 配饰",
     "参考缩略图版式生成雾蓝针织角色设定板：中央为蓝色针织外套、吊带和短裤角色主视觉，周围展示眼唇特写、妆容色卡、耳饰项链、手部尺寸、发型正侧背线稿、蓝色针织上衣和短裤工程图、腿部比例与材质样块。"),
    ("pink_closeup_blueprint", "粉系近景蓝图板", "粉色近景 / 眼唇 / 发型 / 首饰 / 下装",
     "参考缩略图版式生成粉系近景蓝图角色资产板：中央为粉色针织开衫和浅色短裤角色近景主视觉，四周用细线分栏放眼睛微距、唇部微距、眉眼线稿、发型正侧背、耳饰项链、粉色针织纹理、吊带结构、短裤尺寸和腿部比例。"),
    ("blue_half_body_detail_sheet", "雾蓝半身细节板", "半身肖像 / 眼唇 / 材质 / 服装比例",
     "参考缩略图版式生成雾蓝半身肖像细节拆解板：上半区域为角色半身主视觉，周边包含眼睛两组近景、嘴唇特写、蓝色材质光泽球、针织布料样块、发型三面线稿、耳饰项链、手部与腿部比例、短裤结构。"),
    ("pink_portrait_design_sheet", "粉色肖像设计板", "粉色肖像 / 眼唇 / 针织 / 短裤",
     "参考缩略图版式生成粉色肖像设计板：主视觉为粉色针织和浅色短裤角色半身，周围包含眼唇特写、脸部比例、发丝走向、耳饰项链、粉色针织纹理、短裤工程图和粉色系色卡。"),
    ("mixed_closeup_blueprint", "混合五官蓝图板", "多五官 / 主视觉 / 线稿 / 材质",
     "参考缩略图版式生成混合五官蓝图板：主视觉居中，周围密集排列多组眼睛、嘴唇、眉眼、发型线稿、配饰结构、面料样块、服装尺寸和身体比例，以工程标注和细线分区呈现。"),
    ("blue_portrait_design_sheet", "雾蓝肖像设计板", "雾蓝肖像 / 发型 / 服装 / 色卡",
     "参考缩略图版式生成雾蓝肖像设计板：主视觉为雾蓝服装角色半身，四周是眼唇特写、发型线稿、服装款式拆解、针织材质、牛仔材质、首饰结构和蓝白灰低饱和色卡，整体白底蓝色强调。"),
    ("lavender_knit_portrait_sheet", "薰紫针织设定板", "薰紫肖像 / 五官 / 配饰 / 服装结构",
     "参考缩略图版式生成薰紫针织角色设定板：中央为薰紫或淡紫针织外套与吊带角色肖像，周围包含眼唇特写、发型线稿、耳饰项链结构、色彩搭配、针织纹理、上衣与短裤工程图、身体比例。整体白底黑线，薰紫低饱和配色。"),
    ("cn_multi_angle_archive", "中文多角度档案板", "中文档案 / 三视图 / 五官 / 姿势 / 光影",
     "参考缩略图版式生成中文角色设定集长图：浅粉纸张质感背景，中文标题与分区标签；中央全身站姿，左侧三视图、角色档案、面部比例、发型设计、身体细节，右侧面部特写、五官、妆容变体、穿搭拆解、面料细节，底部姿势探索与光影氛围。"),
    ("soft_light_poster_archive", "柔光海报档案板", "柔光主视觉 / 表情 / 发型 / 服装 / 姿势",
     "参考缩略图版式生成柔光角色档案长卷：中央全身角色站姿和浅粉柔光室内氛围，左侧多角度展示、角色档案、面部比例与五官，右侧表情宫格、妆容变化、发型设计、服装拆解、配饰、色卡，底部身体细节和姿势探索。"),
    ("gentle_cn_full_asset_sheet", "温柔情懒中文设定集", "中文设定 / 穿搭 / 细节 / 姿势 / 光影",
     "参考缩略图版式生成温柔情懒风中文角色设定集：左侧为角色档案和色彩搭配，中间偏左放生活感主视觉，右侧大区域为面部比例、五官特写、妆容变体、发型设计、身体细节；下方包含穿搭拆解、面料细节、配饰细节、姿势探索和光影氛围。整体浅米白、淡粉、柔灰，中文排版简洁。"),
    ("school_uniform_mood_archive", "灰蓝制服角色设定板", "校园档案 / 三视图 / 材质 / 光影 / 气质",
     "参考缩略图版式生成灰蓝校园制服角色设定板：深灰背景和精致分栏，左侧为角色姓名、年龄、身份、气质、关键词和记忆点，中间为大幅肖像与正侧背三视图，右侧为服装结构视角；底部包含色彩参考、材质参考、光影说明和人物气质说明。整体冷静克制、灰蓝黑金配色，强调服装结构、人物气质和可归档资产信息。"),
    ("fantasy_white_gown_archive", "仙侠礼服角色设定板", "古风礼服 / 三视图 / 饰品 / 表情 / 服装",
     "参考缩略图版式生成仙侠古风白色礼服角色设定板：右侧为大幅白色纱裙全身主视觉，左侧分栏展示正侧背造型、礼服正背面、鞋履、发冠头饰、扇子或手持道具、表情头像六宫格。使用白底黑色细线边框，突出银白、珍珠、薄纱、刺绣、发饰和古风仙侠气质，角色身份、服饰和首饰必须一致。"),
]

STATIC_TEMPLATES = [
    {
        "id": "basic_three_view_sheet",
        "label": "通用三视图设定板",
        "mode": "reference",
        "size": "1:1",
        "preview": "https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260601/389fecdf2a2f4e87b78b4c067f7336bd.png",
        "local": LOCAL_PREVIEW_DIR / "basic_three_view_sheet.png",
        "desc": "三视图 / 全身 / 脸部特写 / 服装",
        "prompt": "参考缩略图版式生成通用角色资产设定板：白底细线分栏，中央或左侧为同一角色全身主视觉，必须包含正面、侧面、背面三视图，脸部特写、眼部和唇部局部、发型正侧背、服装拆解、材质样块、色彩参考和少量比例标注。整体是清晰可归档的普通三视图/全身/脸部特写版本，角色身份、五官、发型、服装保持一致。"
    },
    {
        "id": "prop_turnaround",
        "label": "道具结构拆解板",
        "mode": "reference",
        "size": "1:1",
        "preview": "https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260601/8283882f47dd4394869482df498dae1a.png",
        "local": LOCAL_PREVIEW_DIR / "prop_turnaround.png",
        "desc": "道具结构 / 材质 / 比例",
        "prompt": "参考缩略图版式生成道具资产结构拆解板：白底工业设计分栏，主道具占据中心，必须包含正面、侧面、背面或俯视多角度视图，局部结构爆炸图、材质纹理样块、比例尺、握持或使用状态小图、色彩与工艺标注。道具造型、材质和所有细节必须前后一致，避免角色写真化。"
    },
    {
        "id": "creature_mecha_sheet",
        "label": "机械怪兽设定板",
        "mode": "reference",
        "size": "1:1",
        "preview": "https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260601/5a96f193046f4a0e8bed76823c657e4c.png",
        "local": LOCAL_PREVIEW_DIR / "creature_mecha_sheet.png",
        "desc": "机械怪兽 / 三视图 / 拆解 / 姿态",
        "prompt": "参考缩略图版式生成机械怪兽资产设定板：白底黑线工程蓝图排版，主体为同一机械怪兽或生物机械体，必须包含正面、侧面、背面三视图，头部、装甲、关节、爪牙、尾部或武器结构拆解，动态姿态小图，材质和配色样块。整体强调可建模、可动画的结构信息，机械结构和生物特征保持一致。"
    },
    {
        "id": "three_view_face_closeup_brown",
        "label": "棕色三视图近景板",
        "mode": "reference",
        "size": "16:9",
        "preview": "/api/workbench/image-studio/file?path=tools%2Fworkbench-web%2Fassets%2Ftemplate-previews-original%2Fthree_view_face_closeup_brown.jpg",
        "local": LOCAL_PREVIEW_DIR / "three_view_face_closeup_brown.jpg",
        "desc": "三视图 / 表情特写 / 棕色服装 / 轻标注",
        "prompt": "参考缩略图版式生成棕色系角色三视图近景资产板：横向16:9画布，浅灰影棚背景，四个竖向大分栏从左到右依次为正视全身、侧面全身、背视全身、正面表情近景特写。底部保留中英双语视角标签，人物服装、发型、饰品、耳麦、鞋履和体态必须完全一致，棕色与米色服装细节清晰。"
    },
    {
        "id": "cyber_three_view_detail_sheet",
        "label": "黑红赛博角色设定板",
        "mode": "reference",
        "size": "9:16",
        "preview": "/api/workbench/image-studio/file?path=tools%2Fworkbench-web%2Fassets%2Ftemplate-previews-original%2Fcyber_three_view_detail_sheet.jpg",
        "local": LOCAL_PREVIEW_DIR / "cyber_three_view_detail_sheet.jpg",
        "desc": "赛博竖版 / 中央主视觉 / 细节拆解 / 三视图",
        "prompt": "参考缩略图版式生成黑红赛博角色竖版设定板：9:16深色画布，中央为大幅全身主视觉，左侧为细节展示纵向栏，包含面部近景、侧脸、皮衣护甲细节、武器战术装备、腰带腿部装备、靴子细节；右侧为三视图纵向栏，包含正面、侧面、背面小全身。整体黑灰金属、皮革、红色发光线条和中英双语小标注，强调可执行服装结构和战术装备。"
    },
    {
        "id": "ancient_elder_character_sheet",
        "label": "古风老者细节设定板",
        "mode": "reference",
        "size": "16:9",
        "preview": "/api/workbench/image-studio/file?path=tools%2Fworkbench-web%2Fassets%2Ftemplate-previews-original%2Fancient_elder_character_sheet.jpg",
        "local": LOCAL_PREVIEW_DIR / "ancient_elder_character_sheet.jpg",
        "desc": "古风老者 / 三视图 / 面部手部 / 材质色卡",
        "prompt": "参考缩略图版式生成古风老者角色细节设定板：横向16:9白底中文设定集排版，中央大区域为同一角色正面、侧面、背面三视图；左侧纵向分栏包含面部特写、肤色样块、发色样块、发式细节、手部生理细节、基础衣领色块和面部细节；右侧为颈肩胸像比例照；底部为基础色卡、手部与衣领小样、衣料材质小样。整体细线边框、中文标签、灰蓝古装、白发胡须和老年皮肤纹理清晰。"
    },
]


def load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for raw in env.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_uploader():
    spec = importlib.util.spec_from_file_location("object_storage_uploader", UPLOADER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载上传器: {UPLOADER_PATH}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["object_storage_uploader"] = mod
    spec.loader.exec_module(mod)
    return mod


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def nearest_template_size(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        return "1:1"
    ratio = width / height
    return min(TEMPLATE_SIZE_RATIOS, key=lambda key: abs(TEMPLATE_SIZE_RATIOS[key] - ratio))


def image_template_size(path: Path) -> str:
    if Image is None:
        return "1:1"
    try:
        with Image.open(path) as img:
            width, height = img.size
        return nearest_template_size(int(width), int(height))
    except Exception:
        return "1:1"


def ordered_reference_files() -> list[Path] | None:
    supported = {".png", ".jpg", ".jpeg", ".webp"}
    files = [p for p in INPUT_DIR.iterdir() if p.is_file() and p.suffix.lower() in supported]
    numbered: dict[int, Path] = {}
    for path in files:
        match = re.match(r"^(\d{2})(?:\D|$)", path.name)
        if match:
            numbered[int(match.group(1))] = path
    required = range(1, len(SPECS) + 1)
    missing = [f"{idx:02d}" for idx in required if idx not in numbered]
    if missing:
        print(f"需要 {len(SPECS)} 张按编号命名的参考图，缺少：{', '.join(missing)}", file=sys.stderr)
        print(f"当前可识别编号：{', '.join(f'{idx:02d}' for idx in sorted(numbered)) or '无'}", file=sys.stderr)
        print(f"请把参考图放入：{INPUT_DIR}", file=sys.stderr)
        print(f"命名必须是 01.png ... {len(SPECS):02d}.png，也支持 .jpg/.jpeg/.webp", file=sys.stderr)
        return None
    return [numbered[idx] for idx in required]


def main() -> int:
    load_env()
    files = ordered_reference_files()
    if files is None:
        return 2
    uploader = load_uploader()
    LOCAL_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    templates = []
    manifest = []
    templates.extend(PREPEND_TEMPLATES)
    for spec_item, image_path in zip(SPECS, files):
        template_id, label, desc, prompt = spec_item
        content_type = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}[image_path.suffix.lower()]
        result = uploader.upload_reference_image(image_path.read_bytes(), f"{template_id}{image_path.suffix.lower()}", content_type)
        local_name = f"{template_id}{image_path.suffix.lower().replace('.jpeg', '.jpg')}"
        local_preview = LOCAL_PREVIEW_DIR / local_name
        if local_preview.exists():
            local_preview.chmod(0o644)
        shutil.copyfile(image_path, local_preview)
        local_preview.chmod(0o644)
        templates.append({
            "id": template_id,
            "label": label,
            "mode": "reference",
            "size": image_template_size(image_path),
            "preview": result["url"],
            "desc": desc,
            "prompt": prompt + STRICT_TEMPLATE_SUFFIX
        })
        manifest.append({"id": template_id, "label": label, "source": str(image_path), "cos": result["url"], "key": result["key"]})
        if template_id == "soft_light_poster_archive":
            templates.append(SCENE_TEMPLATE)

    for static_item in STATIC_TEMPLATES:
        item = dict(static_item)
        local_path = item.pop("local", None)
        templates.append({
            **item,
            "prompt": item["prompt"] + STRICT_TEMPLATE_SUFFIX
        })
        key = ""
        if "/mjb-reference/" in item["preview"]:
            key = "mjb-reference/" + item["preview"].split("/mjb-reference/", 1)[1]
        manifest.append({
            "id": item["id"],
            "label": item["label"],
            "source": str(local_path or ""),
            "cos": item["preview"],
            "key": key
        })

    html = HTML_PATH.read_text()
    block = "function assetTemplateDefinitions(){\n  return [\n"
    rows = []
    for t in templates:
        if t.get("preview_expr"):
            preview_line = f"      preview:{t['preview_expr']},\n"
        else:
            preview_line = f"      preview:{js_string(t['preview'])},\n"
        rows.append(
            "    {\n"
            f"      id:{js_string(t['id'])},\n"
            f"      label:{js_string(t['label'])},\n"
            f"      mode:{js_string(t['mode'])},\n"
            f"      size:{js_string(t.get('size') or '1:1')},\n"
            f"{preview_line}"
            f"      desc:{js_string(t['desc'])},\n"
            f"      prompt:{js_string(t['prompt'])}\n"
            "    }"
        )
    block += ",\n".join(rows) + "\n  ];\n}"
    start = html.find("function assetTemplateDefinitions(){")
    end_marker = "\nfunction getAssetTemplateDefinition"
    end = html.find(end_marker, start)
    if start < 0 or end < 0:
        raise RuntimeError("无法定位 assetTemplateDefinitions 替换边界")
    html = html[:start] + block + html[end:]
    html = re.sub(r"const ASSET_TEMPLATE_INLINE_PREVIEWS=\{.*?\};\n", "", html, count=1, flags=re.S)
    HTML_PATH.write_text(html)
    (ROOT / "tools/workbench-web/assets/template-previews-original/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
