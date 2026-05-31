#!/usr/bin/env python3
"""
Fragment Bridge - Python 长驻进程桥接
通过 stdio 接收 JSON-RPC 风格的请求并处理

协议格式（长度前缀）：
- 发送：<length>:<json>\n
- 接收：<length>:<json>\n
"""

import json
import sys
import os
from pathlib import Path
from typing import Any, Dict

# 添加脚本目录到 Python 路径，以便导入 fragment_manager
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent  # yourcrush 项目根目录
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from fragment_manager import FragmentManager

# 全局管理器实例
_manager = None

def get_manager() -> FragmentManager:
    """获取或创建 FragmentManager 单例"""
    global _manager
    if _manager is None:
        _manager = FragmentManager(base_dir=PROJECT_ROOT)
    return _manager

def send_response(req_id: str, data: Any = None, error: Dict = None):
    """发送 JSON-RPC 响应（长度前缀协议）"""
    response = {"id": req_id}
    if error:
        response["error"] = error
    else:
        response["data"] = data
    json_str = json.dumps(response, ensure_ascii=False)
    # 使用长度前缀协议：<length>:<json>\n
    sys.stdout.write(f"{len(json_str.encode('utf-8'))}:{json_str}\n")
    sys.stdout.flush()

def handle_request(req: Dict) -> Any:
    """处理请求"""
    method = req.get("method")
    args = req.get("args", [])

    manager = get_manager()

    if method == "list":
        # args: [crushSlug, date]
        if len(args) < 2:
            raise ValueError("list 方法需要 crushSlug 和 date 参数")
        crush_slug = args[0]
        date = args[1]
        fragments = manager.get_fragments_by_date(crush_slug, date)
        return [f.to_dict() for f in fragments]

    elif method == "record":
        # args: [crushSlug, fragmentDataJson]
        if len(args) < 2:
            raise ValueError("record 方法需要 crushSlug 和 fragmentData 参数")
        crush_slug = args[0]
        fragment_data = json.loads(args[1]) if isinstance(args[1], str) else args[1]
        fragment, error_msg = manager.record_fragment(crush_slug, fragment_data)
        if fragment is None:
            raise ValueError(error_msg or "记录碎片失败")
        return fragment.to_dict()

    elif method == "integrate":
        # args: [crushSlug, date]
        if len(args) < 2:
            raise ValueError("integrate 方法需要 crushSlug 和 date 参数")
        crush_slug = args[0]
        date = args[1]
        context = manager.integrate_fragments(crush_slug, date)
        return context

    elif method == "ping":
        return "pong"

    else:
        raise ValueError(f"Unknown method: {method}")

def read_message() -> str:
    """读取一条长度前缀协议消息"""
    buffer = ""
    while True:
        char = sys.stdin.read(1)
        if not char:
            return ""  # EOF
        if char == ':':
            # 读取到分隔符，解析长度
            length = int(buffer)
            # 读取消息内容
            message = sys.stdin.read(length)
            return message
        buffer += char

def main():
    """主循环 - 处理 stdio 输入"""
    # 发送 ready 消息（长度前缀协议）
    ready_msg = json.dumps({"type": "ready"})
    sys.stdout.write(f"{len(ready_msg.encode('utf-8'))}:{ready_msg}\n")
    sys.stdout.flush()

    while True:
        try:
            message = read_message()
            if not message:
                break  # EOF

            req = json.loads(message)
            req_id = req.get("id")

            try:
                result = handle_request(req)
                send_response(req_id, data=result)
            except Exception as e:
                send_response(req_id, error={"code": -1, "message": str(e)})

        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}", file=sys.stderr, flush=True)
            continue
        except Exception as e:
            print(f"Bridge error: {e}", file=sys.stderr, flush=True)
            continue

if __name__ == "__main__":
    main()
