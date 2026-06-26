import os
import json
import time
import urllib.request
import mimetypes

API_KEY = os.environ.get("RUNNINGHUB_API_KEY", "")

def upload_image(file_path):
    print(f"上传图片: {file_path}")
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
        print(f"上传结果: {res}")
        return res["data"]["fileName"] if "data" in res else res["fileName"]

def create_task(node_info_list):
    url = "https://www.runninghub.cn/task/openapi/create"
    payload = {
        "apiKey": API_KEY,
        "addMetadata": True,
        "workflowId": "2043087373063430146",
        "nodeInfoList": node_info_list
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        print(f"创建任务结果: {res}")
        return res["data"]["taskId"]

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

def main():
    if not API_KEY:
        print("错误: 未设置 RUNNINGHUB_API_KEY 环境变量")
        return
        
    char_img = "/Users/billy/Documents/AI_pro/漫剧创作库/projects/无限强化_漫剧_001/06-generated/images/characters/角色设计图-林天觉醒后-v3-3.png"
    char_filename = upload_image(char_img)
    
    prompt = "A delicate 15-year-old Chinese girl, big teary eyes with emotional depth, long dark brown hair in a low ponytail, wearing a simple light-colored ancient dress with long sleeves, slender build, slightly shorter than average. Subtle silver glowing spirit patterns on her wrists, faint luminescence. Grey and desolate post-apocalyptic ancient Chinese background, dusty air, soft dramatic rim lighting. Style anchor — dark post-apocalyptic manhua aesthetic, high contrast dramatic lighting, cold blue rim light, charcoal gray base tones, fine black ink outlines, cinematic comic composition, glowing silver spirit patterns, grim atmosphere, professional comic book illustration, cel-shaded with subtle gradients, metallic gold highlights, hyper-cool character design."
    
    nodes = [
        {"nodeId": "2", "fieldName": "image", "fieldValue": char_filename},
        {"nodeId": "9", "fieldName": "text", "fieldValue": prompt},
        {"nodeId": "1", "fieldName": "prompt", "fieldValue": prompt}
    ]
    
    task_id = create_task(nodes)
    print(f"正在等待任务 {task_id} 完成...")
    
    while True:
        status = check_status(task_id)
        print(f"当前状态: {status}")
        if status == "SUCCESS":
            outputs = get_outputs(task_id)
            print(f"任务完成！输出结果:\n{json.dumps(outputs, indent=2, ensure_ascii=False)}")
            break
        elif status == "FAILED":
            print("任务失败！请检查 workflow 或参数。")
            break
        time.sleep(5)

if __name__ == "__main__":
    main()
