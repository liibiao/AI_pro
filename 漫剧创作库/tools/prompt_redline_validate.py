#!/usr/bin/env python3
"""
prompt_redline_validate.py — 提示词红线规则校验引擎

从 docs/prompt-redline-rules.json 加载红线规则，对生成的提示词文件执行自动化校验。
校验覆盖：镜头动作融合、六固定段名、独立片段计时、禁止抽象词、帧率绑定等 16 条规则。

用法:
    python3 tools/prompt_redline_validate.py --project-dir projects/xxx --ep 002
    python3 tools/prompt_redline_validate.py --project-dir projects/xxx  # 校验所有集数
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple


def load_redline_rules(rules_path: Path = None) -> dict:
    """加载红线规则配置"""
    if rules_path is None:
        rules_path = Path(__file__).resolve().parents[1] / "docs" / "prompt-redline-rules.json"
    if not rules_path.exists():
        raise SystemExit(f"未找到红线规则文件: {rules_path}")
    return json.loads(rules_path.read_text(encoding="utf-8"))


def _check_camera_action_fusion(md_text: str, rule: dict) -> List[str]:
    """R001: 镜头动作融合 — 禁止独立镜头板块"""
    errors = []
    forbid = rule.get("check", {}).get("forbid_patterns", [])

    for pat in forbid:
        if pat in md_text:
            ctx = rule["check"].get("forbid_context", {}).get(pat, "禁止出现")
            errors.append(f"[R001] 镜头动作融合违规: 检测到独立镜头板块「{pat}」— {ctx}")
            return errors  # 一条就够

    # 检查运镜行是否绑定了心理动机
    camera_line_pattern = rule["check"].get("require_patterns_in_camera_line", {})
    for tag, motives in camera_line_pattern.items():
        for line in md_text.splitlines():
            if line.startswith(tag):
                has_motive = any(m in line for m in motives)
                if not has_motive:
                    errors.append(
                        f"[R001] 镜头动作融合违规: 「{tag}」行缺少心理动机绑定 "
                        f"(需要包含: {'/'.join(motives[:4])}…)"
                    )

    # 检查时间戳 + 帧率切换是否绑定动作
    fps_binding = rule["check"].get("require_timestamp_action_binding", {})
    if fps_binding.get("forbid_bare_camera"):
        lines = md_text.splitlines()
        for i, line in enumerate(lines):
            for bare in fps_binding["forbid_bare_camera"]:
                if bare in line and "→" not in line:
                    # 检查上下文行是否有动作描述
                    context = "\n".join(lines[max(0, i-2):min(len(lines), i+3)])
                    has_action = any(
                        kw in context for kw in [
                            "闪避", "翻", "蹲", "击", "拳", "踢", "劈", "推", "收腹",
                            "落地", "转身", "拧腰", "出手", "命中", "抓", "挥", "挡"
                        ]
                    )
                    if not has_action:
                        errors.append(
                            f"[R001] 帧率/运镜未绑定动作: 「{bare.strip()}」出现在孤立行，"
                            f"附近缺少具体动作描述"
                        )

    return errors


def _check_six_fixed_sections(md_text: str, rule: dict) -> List[str]:
    """R002: 六个固定段名"""
    errors = []
    required = rule.get("required_sections", [])
    missing = [s for s in required if s not in md_text]
    if missing:
        errors.append(
            f"[R002] 缺少固定段名: {', '.join(missing)} "
            f"(必须保留全部六段: {', '.join(required)})"
        )
    return errors


def _check_independent_segment_timing(md_text: str, rule: dict) -> List[str]:
    """R003: 独立片段计时规则"""
    errors = []
    title_match = rule.get("title_duration_match", {})

    # 检查标题中的起始时间是否为 0s
    title_pattern = title_match.get("title_pattern", r"【(\d+)s\s*[-–—]\s*(\d+)s】")
    max_start = title_match.get("max_start", 0)

    for m in re.finditer(title_pattern, md_text):
        start = int(m.group(1))
        end = int(m.group(2))
        if start > max_start:
            errors.append(
                f"[R003] 片段不从 0s 开始: 标题「{m.group(0)}」起始时间={start}s，"
                f"应为 0s-{end}s"
            )

    return errors


def _check_no_abstract_words(md_text: str, rule: dict) -> List[str]:
    """R004: 禁止抽象词"""
    errors = []
    forbidden = rule.get("forbid_standalone", [])

    for word in forbidden:
        # 检查是否作为独立词出现（不被"→"拆解）
        if word in md_text:
            # 如果出现在"→"拆解上下文中则允许
            lines = md_text.splitlines()
            for line in lines:
                if word in line and "→" not in line:
                    errors.append(
                        f"[R004] 抽象词「{word}」出现在提示词中，"
                        f"应拆解为可执行视觉信息"
                    )
                    break

    return errors


def _check_fps_must_bind_action(md_text: str, rule: dict) -> List[str]:
    """R005: 帧率切换绑定动作"""
    errors = []
    patterns = rule.get("fps_patterns", [])
    nearby = rule.get("require_nearby", {})

    lines = md_text.splitlines()
    for i, line in enumerate(lines):
        for fps_kw in patterns:
            if fps_kw not in line:
                continue
            required_actions = nearby.get(fps_kw, [])
            if not required_actions:
                continue

            # 检查当前行和相邻行
            context_lines = lines[max(0, i-1):min(len(lines), i+2)]
            context = "\n".join(context_lines)

            has_bind = any(action in context for action in required_actions)
            if not has_bind:
                errors.append(
                    f"[R005] 帧率切换未绑定动作: 「{fps_kw}」缺少动作绑定说明 "
                    f"(附近应出现: {'/'.join(required_actions[:4])}…)"
                )

    return errors


def _check_drama_camera_also_bind(md_text: str, rule: dict) -> List[str]:
    """R006: 文戏镜头也需绑定"""
    errors = []
    triggers = rule.get("trigger_keywords", [])
    drama_cues = rule.get("require_nearby_drama_cues", [])

    lines = md_text.splitlines()
    for i, line in enumerate(lines):
        for trigger in triggers:
            if trigger not in line:
                continue
            context_lines = lines[max(0, i-1):min(len(lines), i+2)]
            context = "\n".join(context_lines)

            has_bind = any(cue in context for cue in drama_cues)
            if not has_bind:
                # 文戏场景才报错（排除纯武戏上下文）
                broader = "\n".join(lines[max(0, i-5):min(len(lines), i+5)])
                is_combat = any(
                    kw in broader for kw in ["打斗", "武戏", "命中", "对撞", "拳", "踢"]
                )
                if not is_combat:
                    errors.append(
                        f"[R006] 文戏镜头未绑定表演: 「{trigger}」附近缺少微表情/视线/呼吸/姿态绑定"
                    )

    return errors


def _check_narration_audio_split(md_text: str, rule: dict) -> List[str]:
    """R007: 对白配音与音效分离"""
    errors = []
    forbid_in_dubbing = rule.get("forbid_in_dubbing", [])

    lines = md_text.splitlines()
    in_dubbing = False
    for line in lines:
        if line.strip().startswith("对白配音"):
            in_dubbing = True
            continue
        if in_dubbing and (line.strip().startswith("音效设计") or
                          line.strip().startswith("画质") or
                          line.strip().startswith("负面提示词") or
                          line.strip().startswith("---")):
            in_dubbing = False
            continue
        if in_dubbing:
            for forbid in forbid_in_dubbing:
                if forbid in line:
                    errors.append(
                        f"[R007] 对白配音段混入音效职责: 「{forbid}」不应出现在对白配音段，"
                        f"应移至音效设计段"
                    )

    return errors


def _check_subtitle_safe_zone(md_text: str, rule: dict) -> List[str]:
    """R011: 字幕安全区"""
    errors = []
    required = rule.get("required_in_output", "")

    if required and required not in md_text:
        errors.append(
            f"[R011] 缺少字幕安全区约束: 提示词中未找到「{required}」"
        )
    return errors


def _check_no_extra_characters(md_text: str, rule: dict) -> List[str]:
    """R012: 禁止新增角色/道具/UI"""
    errors = []
    forbid = rule.get("forbid_keywords", [])

    for kw in forbid:
        if kw in md_text:
            errors.append(f"[R012] 违反禁止新增约束: 检测到「{kw}」")

    return errors


def _check_motion_blur_bg_only(md_text: str, rule: dict) -> List[str]:
    """R013: 运动模糊仅限背景"""
    errors = []
    required = rule.get("required_when_combat", "")
    triggers = rule.get("trigger_keywords", [])

    is_combat = any(t in md_text for t in triggers)
    if is_combat and required and required not in md_text:
        errors.append(
            f"[R013] 武戏缺少清晰帧保护: 检测到打戏场景但未找到「{required}」"
        )
    return errors


def _check_result_frame_readable(md_text: str, rule: dict) -> List[str]:
    """R014: 结果帧清晰可读"""
    errors = []
    required = rule.get("required_when_combat", "")
    triggers = rule.get("trigger_keywords", [])

    is_combat = any(t in md_text for t in triggers)
    if is_combat and required and required not in md_text:
        errors.append(
            f"[R014] 爆点缺少结果帧保护: 检测到命中/打击场景但未找到「{required}」"
        )
    return errors


def _check_asset_ref_format(md_text: str, rule: dict) -> List[str]:
    """R009: @资产名引用格式"""
    errors = []
    # 检查【参考】行是否使用了@引用标签
    for line in md_text.splitlines():
        if line.startswith("【参考】") and "@" not in line:
            errors.append(
                "[R009] 资产引用格式违规: 「【参考】」行未使用@引用标签，"
                "应写成 @资产名 格式"
            )
            break
    return errors


def _check_fpv_five_anchors(md_text: str, rule: dict) -> List[str]:
    """R008: FPV五项锚点"""
    errors = []
    trigger = rule.get("trigger", "FPV")
    anchors = rule.get("required_anchors", [])

    if trigger not in md_text:
        return errors

    for anchor in anchors:
        if anchor not in md_text:
            errors.append(
                f"[R008] FPV锚点缺失: 检测到FPV但缺少「{anchor}」描述"
            )
    return errors


def _check_composition_minimal(md_text: str, rule: dict) -> List[str]:
    """R010: 构图补强最小增量"""
    errors = []
    forbid = rule.get("forbid_in_composition", [])
    max_density = rule.get("max_composition_density_per_shot", 3)

    for kw in forbid:
        if kw in md_text:
            errors.append(
                f"[R010] 构图补强违规: 检测到「{kw}」，构图补强只能补充锚点不能重写"
            )

    # 检查单条时间轴的构图密度
    lines = md_text.splitlines()
    for line in lines:
        composition_count = sum(
            1 for kw in ["构图", "三分法", "中心对称", "对称", "黄金分割", "负空间"]
            if kw in line
        )
        if composition_count > max_density:
            errors.append(
                f"[R010] 构图信息过密: 单行包含 {composition_count} 个构图词 "
                f"(上限 {max_density})，可能导致信息抢权"
            )
    return errors


# 规则执行器映射
RULE_CHECKERS = {
    "R001": _check_camera_action_fusion,
    "R002": _check_six_fixed_sections,
    "R003": _check_independent_segment_timing,
    "R004": _check_no_abstract_words,
    "R005": _check_fps_must_bind_action,
    "R006": _check_drama_camera_also_bind,
    "R007": _check_narration_audio_split,
    "R008": _check_fpv_five_anchors,
    "R009": _check_asset_ref_format,
    "R010": _check_composition_minimal,
    "R011": _check_subtitle_safe_zone,
    "R012": _check_no_extra_characters,
    "R013": _check_motion_blur_bg_only,
    "R014": _check_result_frame_readable,
}


def validate_prompt(md_text: str, rules: dict = None) -> Tuple[List[str], List[str]]:
    """
    对单个提示词文件执行红线校验。

    Args:
        md_text: 提示词 Markdown 文本
        rules: 红线规则配置（默认从 JSON 加载）

    Returns:
        (errors, warnings) 元组
    """
    if rules is None:
        rules = load_redline_rules()

    all_rules = rules.get("rules", {})
    gate_order = rules.get("gate_order", list(all_rules.keys()))

    errors = []
    warnings = []

    for rule_id in gate_order:
        if rule_id not in all_rules:
            continue
        rule = all_rules[rule_id]
        severity = rule.get("severity", "warning")

        checker = RULE_CHECKERS.get(rule_id)
        if not checker:
            continue

        findings = checker(md_text, rule)
        for finding in findings:
            if severity == "error":
                errors.append(finding)
            else:
                warnings.append(finding)

    return errors, warnings


def validate_file(file_path: Path, rules: dict = None) -> Tuple[List[str], List[str]]:
    """对文件执行红线校验"""
    md_text = file_path.read_text(encoding="utf-8")
    return validate_prompt(md_text, rules)


def _discover_prompt_files(project_dir: Path, ep: str = None) -> List[Path]:
    """发现项目中的提示词输出文件"""
    seedance_root = project_dir / "05-prompts/seedance"
    if not seedance_root.exists():
        return []

    patterns = []
    if ep:
        ep_str = str(ep).zfill(3)
        # 搜索分集子目录
        for sub_dir in seedance_root.rglob(f""):
            if sub_dir.is_dir():
                for suffix in [
                    f"ep{ep_str}-omni-paste",
                    f"ep{ep_str}-seedance2-paste",
                    f"ep{ep_str}-seedance2-narrative-paste",
                    f"ep{ep_str}-seedance-master-paste",
                ]:
                    for ext in ["", ".short", ".compact"]:
                        patterns.append(sub_dir / f"{suffix}{ext}.md")
    else:
        patterns = sorted(seedance_root.rglob("ep*-omni-paste*.md"))
        patterns += sorted(seedance_root.rglob("ep*-seedance2-paste*.md"))
        patterns += sorted(seedance_root.rglob("ep*-seedance2-narrative-paste*.md"))
        patterns += sorted(seedance_root.rglob("ep*-seedance-master-paste*.md"))

    # 去重并过滤存在文件
    seen = set()
    result = []
    for p in sorted(set(patterns)):
        if p.exists() and str(p) not in seen:
            seen.add(str(p))
            result.append(p)
    return result


def main():
    parser = argparse.ArgumentParser(
        description="提示词红线规则校验 — 校验生成的提示词是否违反核心方法论"
    )
    parser.add_argument("--project-dir", required=True, help="项目目录")
    parser.add_argument("--ep", help="集数（如 002），不填则校验所有")
    parser.add_argument(
        "--rules",
        default=None,
        help="红线规则 JSON 文件路径（默认: docs/prompt-redline-rules.json）"
    )
    parser.add_argument(
        "--max-warnings",
        type=int,
        default=50,
        help="警告最大显示数量"
    )
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    rules = load_redline_rules(Path(args.rules) if args.rules else None)

    files = _discover_prompt_files(project_dir, args.ep)
    if not files:
        raise SystemExit("未找到可校验的提示词输出文件")

    total_errors = 0
    total_warnings = 0

    for f in files:
        errors, warnings = validate_file(f, rules)
        if errors or warnings:
            rel = f.relative_to(project_dir)
            if errors:
                print(f"[x] {rel} — {len(errors)} 个红线错误")
                for e in errors:
                    print(f"    - {e}")
                total_errors += len(errors)
            if warnings:
                print(f"[!] {rel} — {len(warnings)} 个红线警告")
                shown = warnings[:args.max_warnings]
                for w in shown:
                    print(f"    - {w}")
                total_warnings += len(warnings)

    if total_errors == 0 and total_warnings == 0:
        print(f"✅ 红线校验通过（已校验 {len(files)} 个文件，0 错误 0 警告）")
    elif total_errors == 0:
        print(f"⚠️ 红线校验通过（{len(files)} 文件，{total_warnings} 个警告，0 错误）")
    else:
        print(f"[x] 红线校验失败（{len(files)} 文件，{total_errors} 个错误，{total_warnings} 个警告）")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
