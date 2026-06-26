#!/usr/bin/env python3
from __future__ import annotations

import re
from dataclasses import asdict, dataclass

INVALID_CHARS = r'[<>:"/\\|?*\u0000-\u001f]'

DIRECTOR_CATEGORY_LABELS = {
    "all": "全部 / 通用",
    "scifi": "科幻",
    "action": "动作",
    "thriller": "悬疑",
    "visual": "视觉美学",
    "anime": "动画",
    "oriental": "东方",
    "classic": "经典",
    "fantasy": "奇幻",
    "horror": "恐怖",
}

DIRECTOR_OPTIONS = [
    {"id": "", "name": "AI 智能模式", "category": "smart"},
    {"id": "generic", "name": "标准电影感（AI自由创作）", "category": "all"},
    {"id": "nolan", "name": "克里斯托弗·诺兰", "category": "scifi"},
    {"id": "cameron", "name": "詹姆斯·卡梅隆", "category": "scifi"},
    {"id": "villeneuve", "name": "丹尼斯·维伦纽瓦", "category": "scifi"},
    {"id": "spielberg", "name": "史蒂文·斯皮尔伯格", "category": "classic"},
    {"id": "scorsese", "name": "马丁·斯科塞斯", "category": "classic"},
    {"id": "fincher", "name": "大卫·芬奇", "category": "thriller"},
    {"id": "hitchcock", "name": "阿尔弗雷德·希区柯克", "category": "thriller"},
    {"id": "wong", "name": "王家卫", "category": "visual"},
    {"id": "tarantino", "name": "昆汀·塔伦蒂诺", "category": "action"},
    {"id": "kubrick", "name": "斯坦利·库布里克", "category": "classic"},
    {"id": "miyazaki", "name": "宫崎骏", "category": "anime"},
    {"id": "anderson", "name": "韦斯·安德森", "category": "visual"},
    {"id": "lee_ang", "name": "李安", "category": "oriental"},
    {"id": "zhang", "name": "张艺谋", "category": "oriental"},
    {"id": "bong", "name": "奉俊昊", "category": "thriller"},
    {"id": "chan", "name": "成龙", "category": "action"},
    {"id": "new_wave", "name": "法国新浪潮", "category": "classic"},
    {"id": "carpenter", "name": "约翰·卡朋特", "category": "horror"},
    {"id": "park", "name": "朴赞郁", "category": "thriller"},
    {"id": "malick", "name": "泰伦斯·马力克", "category": "visual"},
    {"id": "inarritu", "name": "亚利桑德罗·冈萨雷斯·伊纳里图", "category": "classic"},
    {"id": "cuaron", "name": "阿方索·卡隆", "category": "scifi"},
    {"id": "del_toro", "name": "吉尔莫·德尔·托罗", "category": "fantasy"},
    {"id": "ridley", "name": "雷德利·斯科特", "category": "scifi"},
    {"id": "wachowski", "name": "沃卓斯基姐妹", "category": "scifi"},
    {"id": "zemeckis", "name": "罗伯特·泽米吉斯", "category": "classic"},
    {"id": "burton", "name": "蒂姆·波顿", "category": "fantasy"},
    {"id": "shinkai", "name": "新海诚", "category": "anime"},
    {"id": "hosoda", "name": "细田守", "category": "anime"},
    {"id": "kon", "name": "今敏", "category": "anime"},
    {"id": "takahata", "name": "高畑勋", "category": "anime"},
    {"id": "lynch", "name": "大卫·林奇", "category": "horror"},
    {"id": "cronenberg", "name": "大卫·柯南伯格", "category": "horror"},
    {"id": "romero", "name": "乔治·罗梅罗", "category": "horror"},
    {"id": "peckinpah", "name": "萨姆·佩金帕", "category": "action"},
    {"id": "woo", "name": "吴宇森", "category": "action"},
    {"id": "tsui", "name": "徐克", "category": "action"},
    {"id": "yuen", "name": "袁和平", "category": "action"},
    {"id": "hou", "name": "侯孝贤", "category": "oriental"},
    {"id": "yang", "name": "杨德昌", "category": "oriental"},
    {"id": "chen", "name": "陈凯歌", "category": "oriental"},
    {"id": "jia", "name": "贾樟柯", "category": "oriental"},
    {"id": "kim", "name": "金基德", "category": "oriental"},
    {"id": "kore_eda", "name": "是枝裕和", "category": "oriental"},
    {"id": "kurosawa", "name": "黑泽明", "category": "classic"},
    {"id": "ozu", "name": "小津安二郎", "category": "classic"},
]

VISUAL_CATEGORY_LABELS = {
    "all": "全部",
    "cinematic": "电影 / 写实",
    "animation": "动画 / 漫画",
    "oriental": "东方 / 国风",
    "painting": "绘画 / 艺术",
    "stylized": "风格化 / 类型化",
    "digital": "数字 / 3D",
}

VISUAL_OPTIONS = [
    {"id": "", "name": "AI 智能模式", "category": "smart"},
    {"id": "cinematic", "name": "电影写实风格", "category": "cinematic"},
    {"id": "anime", "name": "日系动画风格", "category": "animation"},
    {"id": "donghua_xianxia", "name": "3D国风仙侠", "category": "oriental"},
    {"id": "ink_wash", "name": "水墨国风", "category": "oriental"},
    {"id": "watercolor", "name": "水彩画风格", "category": "painting"},
    {"id": "oil_painting", "name": "油画质感", "category": "painting"},
    {"id": "comic", "name": "漫画风格", "category": "animation"},
    {"id": "pixel_art", "name": "像素风格", "category": "stylized"},
    {"id": "noir", "name": "黑白电影风格", "category": "stylized"},
    {"id": "fantasy", "name": "奇幻风格", "category": "stylized"},
    {"id": "cyberpunk", "name": "赛博朋克风格", "category": "stylized"},
    {"id": "3d_render", "name": "3D渲染风格", "category": "digital"},
    {"id": "concept_art", "name": "概念艺术风格", "category": "digital"},
]

DURATION_OPTIONS = ["15s", "30s", "45s", "60s", "90s", "120s", "180s"]

PACE_MAP = {
    "action": "动作推进（快速切镜）",
    "thriller": "悬疑压迫（中快切镜）",
    "dialogue": "对话叙事（稳定节奏）",
    "lyrical": "抒情意境（慢节奏）",
    "balanced": "均衡叙事",
}


@dataclass
class Analysis:
    genre: str
    pace: str
    director_hint: str
    visual_hint: str


@dataclass
class WorkbenchPlan:
    mode: str
    project_name: str
    director_style: str | None
    visual_style: str | None
    duration: str | None
    detected_genre: str
    recommended_pace: str
    reason: str
    command_preview: str

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["directorStyle"] = data.pop("director_style")
        data["visualStyle"] = data.pop("visual_style")
        data["projectName"] = data.pop("project_name")
        data["detectedGenre"] = data.pop("detected_genre")
        data["recommendedPace"] = data.pop("recommended_pace")
        data["commandPreview"] = data.pop("command_preview")
        return data


def normalize_name(raw: str) -> str:
    name = raw.strip()
    name = re.sub(r"^#+\s*", "", name)
    name = re.sub(r"^(标题|书名|剧名|小说名|第[0-9一二三四五六七八九十百千零〇两]+[话章节卷集篇])\s*[:：\-— ]*", "", name)
    name = re.sub(INVALID_CHARS, "", name)
    name = name.strip(" .,_，。、《》【】[]()（）:：;；\t")
    name = re.sub(r"\s+", "_", name)
    return name[:48].strip("._-")


def extract_project_name(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    candidates: list[str] = []

    for line in lines[:12]:
        if line.startswith("#"):
            candidates.append(re.sub(r"^#+\s*", "", line))

    candidates.extend(match.group(1) for match in re.finditer(r"《([^》]{1,40})》", text))

    episode_match = re.search(r"(第\s*[0-9一二三四五六七八九十百千零〇两]+\s*[话章节卷集篇]\s*[:：\-— ]*[^\n]{0,30})", text)
    if episode_match:
        candidates.append(episode_match.group(1).strip())

    for line in lines[:8]:
        if any(key in line for key in ["剧本", "小说", "故事", "正文", "梗概", "大纲"]):
            candidates.append(line)

    for line in lines[:8]:
        if 2 <= len(line) <= 40:
            candidates.append(line)

    if lines:
        first_sentence = re.split(r"[。！？!?\.]", lines[0])[0].strip()
        if first_sentence:
            candidates.append(first_sentence)

    for candidate in candidates:
        normalized = normalize_name(candidate)
        if len(normalized) >= 2:
            return normalized
    return ""


def detect_genre(text: str) -> Analysis:
    rules = [
        Analysis("动作 / 战斗", "action", "成龙 / 昆汀 / 诺兰", "电影写实 / 3D国风仙侠"),
        Analysis("悬疑 / 压迫", "thriller", "芬奇 / 希区柯克", "电影写实 / 黑白电影风格"),
        Analysis("抒情 / 情绪", "lyrical", "王家卫 / 李安 / 宫崎骏", "水彩 / 水墨 / 电影写实"),
        Analysis("对话 / 关系", "dialogue", "李安 / 斯皮尔伯格", "电影写实 / 日系动画"),
    ]
    keywords = {
        "动作 / 战斗": ["打", "战", "杀", "冲", "爆", "追", "武", "拳", "刀", "雷", "觉醒"],
        "悬疑 / 压迫": ["谜", "查", "疑", "监视", "秘密", "恐惧", "真相", "线索"],
        "抒情 / 情绪": ["雨", "夜", "想念", "告别", "沉默", "回忆", "风", "光"],
        "对话 / 关系": ["说", "对话", "争吵", "解释", "会面", "谈判"],
    }
    lower_text = text.lower()
    for rule in rules:
        if any(word in lower_text for word in keywords[rule.genre]):
            return rule
    return Analysis("综合叙事", "balanced", "AI 智能推荐", "AI 智能推荐")


def selected_label(options: list[dict[str, str]], value: str) -> str:
    item = next((entry for entry in options if entry["id"] == value), None)
    return item["name"] if item else "AI 智能模式"


def options_by_category(options: list[dict[str, str]], category: str) -> list[dict[str, str]]:
    if not category or category == "all":
        return [item for item in options if item["id"]]
    return [item for item in options if item.get("category") == category]


def build_command(text: str, project_name: str, analysis: Analysis, director: str = "", visual: str = "", duration: str = "") -> str:
    clean_text = text.strip()
    suffix: list[str] = []
    if project_name:
        suffix.append(f"项目目录：{project_name}")
    if director:
        suffix.append(f"导演风格：{selected_label(DIRECTOR_OPTIONS, director)}")
    if visual:
        suffix.append(f"视觉风格：{selected_label(VISUAL_OPTIONS, visual)}")
    if duration:
        suffix.append(f"视频时长：{duration}")
    if not suffix:
        suffix.append("风格与时长：AI智能模式")
    suffix.append(f"节奏建议：{PACE_MAP.get(analysis.pace, '均衡叙事')}")
    return f"@lingjing 生成提示词：\n{clean_text}\n\n" + "，".join(suffix)


def build_reason(analysis: Analysis, director: str = "", visual: str = "", duration: str = "") -> str:
    reason = f"正文内容更接近“{analysis.genre}”类型，建议按“{PACE_MAP.get(analysis.pace, '均衡叙事')}”处理。"
    if not director:
        reason += f" 导演风格未指定，建议由灵境从 {analysis.director_hint} 中智能匹配。"
    if not visual:
        reason += f" 视觉风格未指定，建议从 {analysis.visual_hint} 自动推荐。"
    if not duration:
        reason += " 视频时长未指定，系统会按剧情密度自动估算。"
    return reason


def build_plan(text: str, project_name: str = "", director: str = "", visual: str = "", duration: str = "") -> WorkbenchPlan:
    derived_name = project_name.strip() or extract_project_name(text.strip()) or "待生成项目"
    analysis = detect_genre(text)
    return WorkbenchPlan(
        mode="ai-smart" if not director and not visual and not duration else "manual-assisted",
        project_name=derived_name,
        director_style=director or None,
        visual_style=visual or None,
        duration=duration or None,
        detected_genre=analysis.genre,
        recommended_pace=analysis.pace,
        reason=build_reason(analysis, director, visual, duration),
        command_preview=build_command(text, derived_name, analysis, director, visual, duration),
    )
