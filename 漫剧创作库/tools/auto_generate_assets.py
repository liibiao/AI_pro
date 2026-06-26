import os
import sys
import json
import time
import urllib.request
import mimetypes
import argparse
import re
from pathlib import Path

API_KEY = os.environ.get("RUNNINGHUB_API_KEY", "")

def upload_image(file_path):
    url = "https://www.runninghub.cn/openapi/v2/media/upload/binary"
    boundary = f"----WebKitFormBoundary{int(time.time()*1000)}"
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    filename = os.path.basename(file_path)
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8") +
        file_bytes +
        f"\r\n--{boundary}--\r\n".encode("utf-8")
    )
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res["data"]["fileName"] if "data" in res else res["fileName"]

def create_mj_task(prompt, sref_url):
    """使用 MJ-Niji7 标准模型接口创建任务"""
    url = "https://www.runninghub.cn/openapi/v2/youchuan/text-to-image-niji7"
    
    # 强制在提示词前加入三视图排版指令
    layout_prompt = "three-row layout character design sheet, front view, side view, back view, "
    full_prompt = layout_prompt + prompt
    
    payload = {
        "prompt": full_prompt,
        "sref": sref_url,
        "sw": 100,
        "aspectRatio": "3:4"
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        
        # MJ API 的响应结构中，taskId 可能在 data 里，也可能直接在根节点
        if "taskId" in res:
            return res["taskId"]
        elif "data" in res and res["data"] is not None and "taskId" in res["data"]:
            return res["data"]["taskId"]
        else:
            print(f"[-] 创建任务失败，接口返回: {res}")
            return None

def check_standard_status(task_id):
    """检查标准模型接口的任务状态"""
    url = "https://www.runninghub.cn/openapi/v2/query"
    payload = {"taskId": task_id}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        if "status" in res:
            return res
        return res.get("data", {})

def check_status(task_id):
    url = "https://www.runninghub.cn/task/openapi/status"
    payload = {"apiKey": API_KEY, "taskId": task_id}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res["data"]

def get_outputs(task_id):
    url = "https://www.runninghub.cn/task/openapi/outputs"
    payload = {"apiKey": API_KEY, "taskId": task_id}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res["data"]

def extract_info_from_md(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    prompt = ""
    
    # 尝试匹配 "MJ-Niji7 提示词" 或 "直出提示词" 格式
    prompt_match = re.search(r'## \d+\.\s*[^\n]*提示词[^\n]*\n+```(?:text)?\n(.*?)\n```', content, re.DOTALL | re.IGNORECASE)
    if prompt_match:
        prompt = prompt_match.group(1).strip()
    else:
        # 尝试匹配 "核心提示词 (Prompt)" 格式
        prompt_match = re.search(r'## \d+\.\s*核心提示词.*?\(Prompt\)(.*?)(?:---|## \d+\.)', content, re.DOTALL | re.IGNORECASE)
        if prompt_match:
            lines = [line.strip() for line in prompt_match.group(1).split('\n') if line.strip() and not line.startswith('#')]
            prompt = ' '.join(lines)
        
    # 默认强制提取项目 v3-3 风格锚点图
    sref_path = "06-generated/images/characters/林天觉醒后-v3-3.png"
    return prompt, sref_path

def download_image(url, save_path):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open(save_path, 'wb') as out_file:
        out_file.write(response.read())

def update_asset_index(project_dir, asset_type, char_name):
    """Librarian: 自动回填 asset-index.md 状态"""
    index_path = project_dir / "03-assets/asset-index.md"
    if not index_path.exists():
        return
        
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # 简单的正则替换，将带有目标名称的那一行状态更新为已生成
    # 例如：| 林婉儿 | ... | 🔄 待重生成 | -> | 林婉儿 | ... | ✅ 已生成 (Banana2) |
    pattern = rf'(\|\s*{char_name}.*?\|\s*`[^`]+`\s*\|\s*`[^`]+`\s*\|)([^|]+)(\|[^|]+\|)'
    
    def repl(match):
        return f"{match.group(1)} ✅ 已生成 (Banana2) {match.group(3)}"
        
    new_content = re.sub(pattern, repl, content)
    
    if new_content != content:
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"    📝 Librarian: 已自动更新 asset-index.md 中 [{char_name}] 的状态。")

def main():
    parser = argparse.ArgumentParser(description="自动化资产生成脚本 (基于 Banana2 工作流的批量处理)")
    parser.add_argument("--project-dir", required=True, help="项目根目录 (如 projects/无限强化_漫剧_001)")
    parser.add_argument("--type", choices=['characters', 'scenes', 'props'], default='characters', help="资产类型")
    parser.add_argument("--target", help="指定目标名称(如 林婉儿)，不指定则跑全量对应类型资产")
    args = parser.parse_args()
    
    if not API_KEY:
        print("错误: 未设置 RUNNINGHUB_API_KEY 环境变量")
        sys.exit(1)
        
    project_dir = Path(args.project_dir).resolve()
    prompts_dir = project_dir / "05-prompts/runninghub/standard-api"
    # 修改输出路径，对齐 V8 规范
    output_dir = project_dir / f"06-generated/images/{args.type}"
    output_dir.mkdir(parents=True, exist_ok=True)
    asset_type = args.type
    
    prefix_candidates = {
        "characters": ["人物设计图-", ""],
        "scenes": ["场景氛围图-", ""],
        "props": ["道具设计图-", ""],
    }[args.type]
    
    # 检索任务卡
    target_files = []
    if args.target:
        for prefix in prefix_candidates:
            target_files.extend(list(prompts_dir.glob(f"{prefix}{args.target}.md")))
    else:
        for prefix in prefix_candidates:
            target_files.extend(list(prompts_dir.glob(f"{prefix}*.md")))
    target_files = sorted(set(target_files))
    
    if not target_files:
        print(f"[-] 未找到任何匹配的任务卡: {prompts_dir}/{search_pattern}")
        return

    print(f"[*] 发现 {len(target_files)} 个 {args.type} 生成任务，开始自动化生产链...")

    for md_file in target_files:
        stem = md_file.stem
        char_name = stem
        for prefix in prefix_candidates:
            if prefix and stem.startswith(prefix):
                char_name = stem[len(prefix):]
                break
        # 角色与道具：如果目标文件已存在，默认跳过避免重复出图
        existing_main = output_dir / f"{char_name}-v8-1.png"
        if asset_type in ("characters", "props") and existing_main.exists():
            print(f"\n=========================================")
            print(f"[=] 已存在 {asset_type} 资产: {existing_main.name}，跳过自动生成（如需重生成可手动删除或改名后再执行）。")
            continue
        print(f"\n=========================================")
        print(f"[+] 开始生产: {char_name}")
        print(f"=========================================")
        
        prompt, rel_ref_img = extract_info_from_md(md_file)
        if not prompt:
            print(f"[-] 警告: 无法从 {md_file.name} 提取提示词，跳过。")
            continue
            
        ref_img = project_dir / rel_ref_img
        if not ref_img.exists():
            print(f"[-] 警告: 参考图不存在 {ref_img}，请检查项目路径。")
            continue
            
        print(f"[*] 解析提示词成功: {prompt[:40]}...")
        
        # 对于 MJ 来说，sref 需要是一个公网可访问的 URL
        # 我们使用一个预先准备好的云端 URL 指向 v3-3 的锚点图
        sref_url = "https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/2029b4175ab971b9c81f7ecf8998bc55f625db9e4aaa039134f2340a8cac822d.png?q-sign-algorithm=sha1&q-ak=AKIDv56FISEJUsKsMeELk0gmbNCGKTYSaZ3N&q-sign-time=1776088549%3B1776174949&q-key-time=1776088549%3B1776174949&q-header-list=host&q-url-param-list=&q-signature=6ca01cd4a16b00cf8e1e5e04916c4ccba618d843"
        
        print(f"[*] 向 MJ-Niji7 引擎投递任务...")
        task_id = create_mj_task(prompt, sref_url)
        print(f"[*] 任务 {task_id} 已启动，等待出图...")
        
        consecutive_errors = 0
        while True:
            try:
                status_res = check_standard_status(task_id)
                consecutive_errors = 0
                status = str(status_res.get("status") or "").upper()
                
                # 尝试获取进度并打印可视化的进度条
                progress = status_res.get("progress")
                if progress is not None:
                    try:
                        # 确保进度在 0-100 之间
                        prog_val = float(progress)
                        if prog_val <= 1.0 and isinstance(progress, str) and "%" not in progress:
                            prog_val = prog_val * 100 # 如果是 0.5 转换为 50
                        elif "%" in str(progress):
                            prog_val = float(str(progress).replace("%", ""))
                            
                        prog_int = int(prog_val)
                        bar_length = 30
                        filled = int(bar_length * prog_int / 100)
                        bar = '=' * filled + '>' + ' ' * (bar_length - filled - 1)
                        # 使用 \r 回车符在同一行覆盖打印
                        sys.stdout.write(f"\r    [生图进度] [{bar}] {prog_int}%")
                        sys.stdout.flush()
                    except ValueError:
                        pass
                
                if status == "SUCCESS":
                    # 成功时进度条打满换行
                    sys.stdout.write(f"\r    [生图进度] [{'=' * 30}] 100%\n")
                    sys.stdout.flush()
                    
                    # MJ 接口可能返回 "results": [{"url": "..."}] 或者是 "imageUrl"
                    url = None
                    if "results" in status_res and isinstance(status_res["results"], list) and len(status_res["results"]) > 0:
                        url = status_res["results"][0].get("url")
                    else:
                        url = status_res.get("fileUrl") or status_res.get("imageUrl")
                        
                    if url:
                        if asset_type == "scenes":
                            base = f"{char_name}-v8-"
                            n = 1
                            while (output_dir / f"{base}{n}.png").exists():
                                n += 1
                            save_path = output_dir / f"{base}{n}.png"
                        else:
                            save_path = output_dir / f"{char_name}-v8-1.png"
                        download_image(url, save_path)
                        print(f"    ✅ 已落盘 -> {save_path.name}")
                    else:
                        print(f"[-] 任务成功，但未找到图片 URL，返回内容: {status_res}")
                    
                    # 自动触发 Librarian 回填逻辑
                    update_asset_index(project_dir, args.type, char_name)
                    break
                elif status in ["FAILED", "FAIL"]:
                    sys.stdout.write("\n")
                    print(f"[-] 任务失败！请检查 prompt 是否含有违禁词或接口状态。")
                    break
            except Exception as e:
                # 出现异常时换行，避免覆盖进度条
                sys.stdout.write("\n")
                print(f"[-] 检查状态异常: {e}")
                consecutive_errors += 1
                if consecutive_errors >= 12:
                    print("[-] 连续检查状态异常次数过多，跳过该资产以避免流程阻塞。")
                    break
                
            time.sleep(5)
            
if __name__ == "__main__":
    main()
