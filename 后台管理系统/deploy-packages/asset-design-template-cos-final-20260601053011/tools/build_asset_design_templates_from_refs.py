#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "template-reference-input"
HTML_PATH = ROOT / "tools/workbench-web/image-studio-canvas-next.html"
LOCAL_PREVIEW_DIR = ROOT / "tools/workbench-web/assets/template-previews-original"
UPLOADER_PATH = ROOT / "smart-vision/services/workbench/object_storage_uploader.py"

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
        "preview": "https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260601/389fecdf2a2f4e87b78b4c067f7336bd.png",
        "local": LOCAL_PREVIEW_DIR / "basic_three_view_sheet.png",
        "desc": "三视图 / 全身 / 脸部特写 / 服装",
        "prompt": "参考缩略图版式生成通用角色资产设定板：白底细线分栏，中央或左侧为同一角色全身主视觉，必须包含正面、侧面、背面三视图，脸部特写、眼部和唇部局部、发型正侧背、服装拆解、材质样块、色彩参考和少量比例标注。整体是清晰可归档的普通三视图/全身/脸部特写版本，角色身份、五官、发型、服装保持一致。"
    },
    {
        "id": "prop_turnaround",
        "label": "道具结构拆解板",
        "mode": "reference",
        "preview": "https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260601/8283882f47dd4394869482df498dae1a.png",
        "local": LOCAL_PREVIEW_DIR / "prop_turnaround.png",
        "desc": "道具结构 / 材质 / 比例",
        "prompt": "参考缩略图版式生成道具资产结构拆解板：白底工业设计分栏，主道具占据中心，必须包含正面、侧面、背面或俯视多角度视图，局部结构爆炸图、材质纹理样块、比例尺、握持或使用状态小图、色彩与工艺标注。道具造型、材质和所有细节必须前后一致，避免角色写真化。"
    },
    {
        "id": "creature_mecha_sheet",
        "label": "机械怪兽设定板",
        "mode": "reference",
        "preview": "https://bl001-1303935072.cos.ap-guangzhou.myqcloud.com/mjb-reference/20260601/5a96f193046f4a0e8bed76823c657e4c.png",
        "local": LOCAL_PREVIEW_DIR / "creature_mecha_sheet.png",
        "desc": "机械怪兽 / 三视图 / 拆解 / 姿态",
        "prompt": "参考缩略图版式生成机械怪兽资产设定板：白底黑线工程蓝图排版，主体为同一机械怪兽或生物机械体，必须包含正面、侧面、背面三视图，头部、装甲、关节、爪牙、尾部或武器结构拆解，动态姿态小图，材质和配色样块。整体强调可建模、可动画的结构信息，机械结构和生物特征保持一致。"
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
            "preview": result["url"],
            "desc": desc,
            "prompt": prompt + " 禁止错配缩略图内容、禁止模板结构漂移、禁止单张写真海报、禁止乱码水印、禁止重复脸和肢体错误。"
        })
        manifest.append({"id": template_id, "label": label, "source": str(image_path), "cos": result["url"], "key": result["key"]})

    for static_item in STATIC_TEMPLATES:
        item = dict(static_item)
        local_path = item.pop("local", None)
        templates.append({
            **item,
            "prompt": item["prompt"] + " 禁止错配缩略图内容、禁止模板结构漂移、禁止单张写真海报、禁止乱码水印、禁止重复脸和肢体错误。"
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
        rows.append(
            "    {\n"
            f"      id:{js_string(t['id'])},\n"
            f"      label:{js_string(t['label'])},\n"
            f"      mode:{js_string(t['mode'])},\n"
            f"      preview:{js_string(t['preview'])},\n"
            f"      desc:{js_string(t['desc'])},\n"
            f"      prompt:{js_string(t['prompt'])}\n"
            "    }"
        )
    block += ",\n".join(rows) + "\n  ];\n}"
    html = re.sub(r"function assetTemplateDefinitions\(\)\{\n  return \[\n.*?\n  \];\n\}", block, html, count=1, flags=re.S)
    html = re.sub(r"const ASSET_TEMPLATE_INLINE_PREVIEWS=\{.*?\};\n", "", html, count=1, flags=re.S)
    HTML_PATH.write_text(html)
    (ROOT / "tools/workbench-web/assets/template-previews-original/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
