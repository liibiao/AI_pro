import argparse
import re
from pathlib import Path
import csv

def parse_script(file_path):
    content = file_path.read_text(encoding='utf-8')
    lines = content.splitlines()
    
    dialogues = []
    sfx_cues = []
    room_tones = []
    
    current_scene = "None"
    
    # Regex patterns
    scene_pat = re.compile(r"^## 场景\s*(\d+-\d+)")
    env_pat = re.compile(r"^【环境】：(.*)")
    # Pattern for dialogues: **Name** (Emotion, △ Action) Dialogue
    # Handle cases like **旁白**：Content or **林天**：（Emotion）Content
    dialogue_pat = re.compile(r"^\*\*([^*：]+)\*\*[:：]\s*(.*)")
    
    # Action patterns for SFX
    action_pat = re.compile(r"^△\s*(.*)")
    major_action_pat = re.compile(r"^△△\s*(.*)")
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Scene match
        m_scene = scene_pat.match(line)
        if m_scene:
            current_scene = m_scene.group(1)
            continue
            
        # Environment/Room Tone match
        m_env = env_pat.match(line)
        if m_env:
            room_tones.append({
                "scene": current_scene,
                "content": m_env.group(1).strip()
            })
            continue
            
        # Dialogue match
        m_dial = dialogue_pat.match(line)
        if m_dial:
            role = m_dial.group(1).strip()
            raw_content = m_dial.group(2).strip()
            
            # Extract emotion/note if exists: (Emotion, △ Action) Content
            emotion = ""
            content = raw_content
            if raw_content.startswith("("):
                end_idx = raw_content.find(")")
                if end_idx != -1:
                    emotion = raw_content[1:end_idx]
                    content = raw_content[end_idx+1:].strip()
            
            # Clean up content (remove leading : or something)
            content = content.lstrip("：").lstrip(":").strip()
            
            dialogues.append({
                "scene": current_scene,
                "role": role,
                "emotion": emotion,
                "content": content
            })
            continue
            
        # SFX match from actions
        m_maj_act = major_action_pat.match(line)
        if m_maj_act:
            sfx_cues.append({
                "scene": current_scene,
                "type": "Major Action (P0)",
                "content": m_maj_act.group(1).strip()
            })
            continue
            
        m_act = action_pat.match(line)
        if m_act:
            sfx_cues.append({
                "scene": current_scene,
                "type": "Action (P1)",
                "content": m_act.group(1).strip()
            })
            continue

    return dialogues, sfx_cues, room_tones

def main():
    parser = argparse.ArgumentParser(description="Extract audio cues (dialogue, SFX) from script files.")
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--ep", required=True, help="Episode number (e.g., 001)")
    args = parser.parse_args()
    
    project_dir = Path(args.project_dir).resolve()
    ep = args.ep
    
    # Find the script file
    script_dir = project_dir / "01-story/scripts"
    scripts = list(script_dir.glob(f"第{int(ep)}话-*-剧本正文.md"))
    if not scripts:
        print(f"[-] No script found for episode {ep}")
        return
        
    script_file = scripts[0]
    print(f"[*] Parsing script: {script_file.name}")
    
    dialogues, sfx_cues, room_tones = parse_script(script_file)
    
    # Output Dir
    output_dir = project_dir / "06-generated/audio/sheets"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Dialogue CSV
    dial_csv = output_dir / f"ep{ep}_dubbing_sheet.csv"
    with open(dial_csv, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=["scene", "role", "emotion", "content"])
        writer.writeheader()
        writer.writerows(dialogues)
    print(f"    ✅ Dubbing Sheet -> {dial_csv.name}")
    
    # 2. SFX/Room Tone MD
    sfx_md = output_dir / f"ep{ep}_audio_cues.md"
    with sfx_md.open('w', encoding='utf-8') as f:
        f.write(f"# Ep {ep} Audio & SFX Cues\n\n")
        f.write("## 1. Room Tones (Environment)\n\n")
        for rt in room_tones:
            f.write(f"- **Scene {rt['scene']}**: {rt['content']}\n")
        
        f.write("\n## 2. SFX Cues (Actions)\n\n")
        for sc in sfx_cues:
            f.write(f"- **Scene {sc['scene']}** [{sc['type']}]: {sc['content']}\n")
    print(f"    ✅ Audio Cues -> {sfx_md.name}")

if __name__ == "__main__":
    main()
