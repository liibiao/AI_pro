import os
import glob
import re

PROMPTS_DIR = "projects/无限强化_漫剧_001/05-prompts"
OUT_FILE = os.path.join(PROMPTS_DIR, "v8-refined-prompts-summary.md")

def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def refine_mj_prompt(content, filename):
    """
    Refine MJ V7 to V8 by injecting negative space, interactive lighting, micro-expressions.
    """
    # Extract Character/Scene/Prop description
    match = re.search(r"### (角色描述|场景与氛围|特殊标记) \([^)]+\)\n(.*?)(?=\n### |\n---|\Z)", content, re.DOTALL)
    desc = match.group(2).strip() if match else "No description found."
    
    # Just grab the core prompt
    prompt_match = re.search(r"--prompt \"([^\"]+)\"", content)
    core_prompt = prompt_match.group(1) if prompt_match else desc
    
    # Inject V8 features if missing
    v8_features = []
    if "interactive lighting" not in core_prompt.lower():
        v8_features.append("interactive lighting")
    if "negative space" not in core_prompt.lower():
        v8_features.append("massive negative space")
    if "micro-expression" not in core_prompt.lower():
        v8_features.append("detailed micro-expressions")
        
    refined = core_prompt
    if v8_features:
        refined += ", " + ", ".join(v8_features)
        
    return refined

def refine_seedance_shot(content):
    """
    Refine Seedance shot to use V8 format and Time-axis micro-sculpting (时间轴微雕).
    """
    shots = []
    blocks = content.split("## SHOT ")
    for block in blocks[1:]:
        lines = block.split("\n")
        title = lines[0].strip()
        
        # Extract baseline
        baseline_match = re.search(r"### baseline\n(.*?)(?=\n### |\n---|\Z)", block, re.DOTALL)
        baseline = baseline_match.group(1).strip() if baseline_match else ""
        
        # Action chain
        action_match = re.search(r"### 动作链 \(Action Chain\)\n(.*?)(?=\n### |\n---|\Z)", block, re.DOTALL)
        action = action_match.group(1).strip() if action_match else ""
        
        # Refine
        refined_shot = f"#### SHOT {title}\n"
        refined_shot += f"**【V8 画面基准】**\n> {baseline}\n\n"
        
        if action:
            refined_shot += f"**【时间轴微雕 (Action Chain)】**\n{action}\n\n"
        else:
            refined_shot += "**【时间轴微雕 (Action Chain)】**\n- [0.0-1.5s] 起手/对峙：建立人物与空间关系，负空间留白。\n- [1.5-3.0s] 动作/情绪：微表情变化，交互光照反馈。\n- [3.0-5.0s] 结果/定格：受力明确，清晰帧保护。\n\n"
            
        refined_shot += "**【克制与光影原则】**\n> 强制追加: motion blur on BACKGROUND ONLY, sharp shadows, interactive lighting, cold blue rim light.\n"
        shots.append(refined_shot)
        
    return shots

def main():
    summary = "# 无限强化·灵纹觉醒 — 全项目 V8 提示词精炼复盘总览\n\n"
    summary += "> **项目复盘与自动化链路结合说明**：\n"
    summary += "> 本文档提取了 `05-prompts` 下所有生成的底层 MJ 提示词与 Seedance 分镜提示词，并依据最新的《文戏/武戏/后期美学规范》与 V8 升级规则（交互光照、负空间、微表情、时间轴微雕、清晰帧保护）进行了全局精炼。\n\n"
    
    # 1. MJ Prompts
    summary += "## 一、MJ 底层资产提示词 (V8 升级版)\n\n"
    mj_files = glob.glob(os.path.join(PROMPTS_DIR, "runninghub/standard-api/*.md"))
    for f in sorted(mj_files):
        if "README" in f or "style-guide" in f: continue
        name = os.path.basename(f).replace(".md", "")
        content = read_file(f)
        refined = refine_mj_prompt(content, name)
        summary += f"### {name}\n```text\n{refined}\n```\n\n"
        
    # 2. Seedance Shots
    summary += "## 二、Seedance 镜头执行提示词 (时间轴微雕版)\n\n"
    shot_files = glob.glob(os.path.join(PROMPTS_DIR, "seedance/*-shots.md"))
    for f in sorted(shot_files):
        ep_name = os.path.basename(f).replace("-shots.md", "")
        summary += f"### {ep_name} 镜头集\n\n"
        content = read_file(f)
        shots = refine_seedance_shot(content)
        for shot in shots:
            summary += shot + "\n"
            
    write_file(OUT_FILE, summary)
    print(f"Successfully wrote {OUT_FILE}")

if __name__ == "__main__":
    main()
