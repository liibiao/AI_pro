import os
import json
import time
import urllib.request

API_KEY = os.environ.get("RUNNINGHUB_API_KEY", "")

def create_mj_task(prompt, sref_url):
    url = "https://www.runninghub.cn/openapi/v2/youchuan/text-to-image-niji7"
    payload = {
        "prompt": prompt,
        "sref": sref_url,
        "sw": 120,
        "aspectRatio": "3:4"
    }
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        print(f"创建 MJ 任务: {res}")
        return res["taskId"]

def check_mj_status(task_id):
    url = "https://www.runninghub.cn/openapi/v2/query"
    payload = {"taskId": task_id}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res

def main():
    if not API_KEY:
        print("错误: 未设置 RUNNINGHUB_API_KEY 环境变量")
        return
        
    sref_url = "https://rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com/input/openapi/2029b4175ab971b9c81f7ecf8998bc55f625db9e4aaa039134f2340a8cac822d.png?q-sign-algorithm=sha1&q-ak=AKIDv56FISEJUsKsMeELk0gmbNCGKTYSaZ3N&q-sign-time=1776088549%3B1776174949&q-key-time=1776088549%3B1776174949&q-header-list=host&q-url-param-list=&q-signature=6ca01cd4a16b00cf8e1e5e04916c4ccba618d843"
    prompt = "A delicate 15-year-old Chinese girl, big teary eyes with emotional depth, long dark brown hair in a low ponytail, wearing a simple light-colored ancient dress with long sleeves, slender build, slightly shorter than average. Subtle silver glowing spirit patterns on her wrists, faint luminescence. Grey and desolate post-apocalyptic ancient Chinese background, dusty air, soft dramatic rim lighting. Style anchor — dark post-apocalyptic manhua aesthetic, high contrast dramatic lighting, cold blue rim light, charcoal gray base tones, fine black ink outlines, cinematic comic composition, glowing silver spirit patterns, grim atmosphere, professional comic book illustration, cel-shaded with subtle gradients, metallic gold highlights, hyper-cool character design."
    
    task_id = create_mj_task(prompt, sref_url)
    print(f"正在等待 MJ 任务 {task_id} 完成...")
    
    while True:
        status_res = check_mj_status(task_id)
        status = status_res.get("status")
        print(f"当前状态: {status}")
        
        if status == "SUCCESS":
            print(f"任务完成！输出图片 URL:")
            for item in status_res.get("results", []):
                print(f"- {item['url']}")
            break
        elif status == "FAILED":
            print(f"任务失败！原因: {status_res.get('errorMessage')}")
            break
        time.sleep(5)

if __name__ == "__main__":
    main()
