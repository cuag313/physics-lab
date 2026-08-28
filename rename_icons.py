#!/usr/bin/env python3
"""
物理化学实验器材图标识别与重命名脚本
====================================
功能：批量识别图片中的实验器材，并用标准中文名重命名文件
支持：OpenAI API、本地Ollama、其他兼容API
特性：支持断点续传、失败重试、批量处理
"""

import os
import sys
import base64
import json
import time
import re
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Tuple

# 尝试导入openai，如果没有安装则提示
try:
    from openai import OpenAI
except ImportError:
    print("请先安装openai库: pip install openai")
    sys.exit(1)


# ==================== 配置 ====================

class Config:
    """脚本配置"""
    # 图片目录
    ICONS_DIR = r"D:\PythonProject\physics-lab\public\assets\iconsnewname"
    
    # 日志文件
    LOG_FILE = r"D:\PythonProject\physics-lab\rename_log.json"
    
    # 失败日志文件
    FAILED_LOG_FILE = r"D:\PythonProject\physics-lab\failed_log.json"
    
    # API配置 - OpenAI
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "your-api-key")
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    # API配置 - Ollama本地
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llava")
    
    # 识别提示词
    PROMPT = """这是物理或化学实验器材的图片。请识别图片中的主要实验器材，只返回器材的标准中文名称。

常见的实验器材包括：
- 化学器材：烧杯、试管、锥形瓶、酒精灯、分液漏斗、量筒、滴瓶、蒸发皿、坩埚、研钵、容量瓶、冷凝管、集气瓶、广口瓶、细口瓶
- 物理器材：电流表、电压表、滑动变阻器、开关、导线、小车、弹簧测力计、刻度尺、天平、砝码、光具座、凸透镜、凹透镜、平面镜、铁架台
- 其他：电源、电阻箱、电铃、电磁铁、验电器、温度计、打点计时器

要求：
1. 只返回一个标准中文名称
2. 不要任何解释或标点符号
3. 如果无法识别，返回"未知器材"
4. 如果图片包含多个器材，返回最主要的一个"""

    # 请求间隔（秒），避免API限流
    REQUEST_DELAY = 0.3
    
    # 请求超时时间（秒）
    REQUEST_TIMEOUT = 120
    
    # 重试次数
    MAX_RETRIES = 3
    
    # 重试间隔（秒）
    RETRY_DELAY = 2
    
    # 批量重试失败文件的最大轮次
    MAX_RETRY_ROUNDS = 5


# ==================== 工具函数 ====================

def encode_image(image_path: str) -> str:
    """将图片编码为base64字符串"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def get_mime_type(file_path: str) -> str:
    """根据文件扩展名获取MIME类型"""
    ext = Path(file_path).suffix.lower()
    mime_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return mime_types.get(ext, "image/png")


def sanitize_filename(name: str) -> str:
    """清理文件名，移除不合法字符"""
    # 移除不合法字符
    illegal_chars = r'[<>:"/\\|?*\x00-\x1f]'
    name = re.sub(illegal_chars, '', name)
    # 移除首尾空格和点
    name = name.strip().strip('.')
    # 限制长度
    if len(name) > 100:
        name = name[:100]
    return name


def get_existing_names(target_dir: str) -> set:
    """获取目录中已存在的文件名（不含扩展名）"""
    existing = set()
    try:
        for f in os.listdir(target_dir):
            name = Path(f).stem
            existing.add(name)
    except Exception as e:
        print(f"警告: 无法读取目录 {target_dir}: {e}")
    return existing


def load_json_file(file_path: str) -> Dict:
    """加载JSON文件"""
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"警告: 无法加载文件 {file_path}: {e}")
    return {}


def save_json_file(file_path: str, data: Dict):
    """保存JSON文件"""
    try:
        # 确保目录存在
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"警告: 无法保存文件 {file_path}: {e}")


# ==================== API识别器 ====================

class EquipmentIdentifier:
    """实验器材识别器基类"""
    
    def __init__(self, config: Config):
        self.config = config
        self.stats = {"success": 0, "failed": 0, "retries": 0}
    
    def identify(self, image_path: str) -> Optional[str]:
        """识别图片中的实验器材"""
        raise NotImplementedError


class OpenAIIdentifier(EquipmentIdentifier):
    """使用OpenAI API识别"""
    
    def __init__(self, config: Config):
        super().__init__(config)
        self.client = OpenAI(
            api_key=config.OPENAI_API_KEY,
            base_url=config.OPENAI_BASE_URL,
            timeout=config.REQUEST_TIMEOUT
        )
        self.model = config.OPENAI_MODEL
    
    def identify(self, image_path: str) -> Optional[str]:
        """使用OpenAI视觉模型识别"""
        for attempt in range(self.config.MAX_RETRIES):
            try:
                base64_image = encode_image(image_path)
                mime_type = get_mime_type(image_path)
                
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": self.config.PROMPT
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=50,
                    temperature=0.1
                )
                
                result = response.choices[0].message.content.strip()
                self.stats["success"] += 1
                return result
                
            except Exception as e:
                self.stats["retries"] += 1
                if attempt < self.config.MAX_RETRIES - 1:
                    print(f"  重试 {attempt + 1}/{self.config.MAX_RETRIES}: {e}")
                    time.sleep(self.config.RETRY_DELAY)
                else:
                    print(f"  识别失败: {e}")
                    self.stats["failed"] += 1
                    return None


class OllamaIdentifier(EquipmentIdentifier):
    """使用本地Ollama API识别"""
    
    def __init__(self, config: Config):
        super().__init__(config)
        self.client = OpenAI(
            api_key="ollama",
            base_url=config.OLLAMA_BASE_URL,
            timeout=config.REQUEST_TIMEOUT
        )
        self.model = config.OLLAMA_MODEL
    
    def identify(self, image_path: str) -> Optional[str]:
        """使用Ollama视觉模型识别"""
        for attempt in range(self.config.MAX_RETRIES):
            try:
                base64_image = encode_image(image_path)
                mime_type = get_mime_type(image_path)
                
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": self.config.PROMPT
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime_type};base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens=50
                )
                
                result = response.choices[0].message.content.strip()
                self.stats["success"] += 1
                return result
                
            except Exception as e:
                self.stats["retries"] += 1
                if attempt < self.config.MAX_RETRIES - 1:
                    print(f"  重试 {attempt + 1}/{self.config.MAX_RETRIES}: {e}")
                    time.sleep(self.config.RETRY_DELAY)
                else:
                    print(f"  识别失败: {e}")
                    self.stats["failed"] += 1
                    return None


# ==================== 主处理逻辑 ====================

class IconRenamer:
    """图标重命名器"""
    
    def __init__(self, config: Config, identifier: EquipmentIdentifier):
        self.config = config
        self.identifier = identifier
        self.rename_log = load_json_file(config.LOG_FILE)
        self.failed_log = load_json_file(config.FAILED_LOG_FILE)
        self.existing_names = get_existing_names(config.ICONS_DIR)
    
    def get_image_files(self) -> List[str]:
        """获取所有图片文件"""
        files = []
        try:
            for f in os.listdir(self.config.ICONS_DIR):
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
                    files.append(f)
        except Exception as e:
            print(f"错误: 无法读取目录 {self.config.ICONS_DIR}: {e}")
        files.sort()
        return files
    
    def get_failed_files(self) -> List[str]:
        """获取所有失败的文件列表"""
        failed_files = []
        for filename, info in self.failed_log.items():
            if isinstance(info, dict):
                retry_count = info.get("retry_count", 0)
                if retry_count < self.config.MAX_RETRY_ROUNDS:
                    failed_files.append(filename)
            else:
                failed_files.append(filename)
        return failed_files
    
    def record_failure(self, filename: str, reason: str):
        """记录失败文件"""
        if filename in self.failed_log:
            # 更新重试次数
            self.failed_log[filename]["retry_count"] = self.failed_log[filename].get("retry_count", 0) + 1
            self.failed_log[filename]["last_reason"] = reason
            self.failed_log[filename]["last_retry"] = datetime.now().isoformat()
        else:
            # 新增失败记录
            self.failed_log[filename] = {
                "reason": reason,
                "retry_count": 1,
                "first_failure": datetime.now().isoformat(),
                "last_retry": datetime.now().isoformat()
            }
    
    def remove_from_failed(self, filename: str):
        """从失败列表中移除"""
        if filename in self.failed_log:
            del self.failed_log[filename]
    
    def process_single_file(self, filename: str, index: int, total: int) -> Tuple[bool, str]:
        """处理单个文件"""
        # 检查是否已成功处理
        if filename in self.rename_log:
            return True, "已处理"
        
        # 检查文件是否存在
        filepath = os.path.join(self.config.ICONS_DIR, filename)
        if not os.path.exists(filepath):
            print(f"  警告: 文件不存在，跳过")
            self.record_failure(filename, "文件不存在")
            return False, "文件不存在"
        
        ext = Path(filename).suffix
        
        print(f"[{index + 1}/{total}] 处理: {filename}")
        
        # 识别器材
        equipment_name = self.identifier.identify(filepath)
        
        if not equipment_name or equipment_name == "未知器材":
            reason = "无法识别" if not equipment_name else "返回未知器材"
            print(f"  警告: {reason}，记录失败")
            self.record_failure(filename, reason)
            return False, reason
        
        # 清理文件名
        clean_name = sanitize_filename(equipment_name)
        if not clean_name:
            print(f"  警告: 文件名为空，记录失败")
            self.record_failure(filename, "文件名为空")
            return False, "文件名为空"
        
        # 处理重名
        new_name = clean_name
        counter = 1
        while new_name in self.existing_names:
            new_name = f"{clean_name}_{counter}"
            counter += 1
        
        # 重命名文件
        new_filename = f"{new_name}{ext}"
        new_filepath = os.path.join(self.config.ICONS_DIR, new_filename)
        
        try:
            os.rename(filepath, new_filepath)
            self.existing_names.add(new_name)
            self.rename_log[filename] = {
                "new_name": new_filename,
                "equipment": equipment_name,
                "timestamp": datetime.now().isoformat()
            }
            # 从失败列表中移除（如果存在）
            self.remove_from_failed(filename)
            print(f"  -> {new_filename}")
            return True, new_filename
        except Exception as e:
            print(f"  重命名失败: {e}")
            self.record_failure(filename, f"重命名失败: {e}")
            return False, str(e)
    
    def run(self, start_idx: int = 0, end_idx: int = None):
        """运行批量重命名"""
        all_files = self.get_image_files()
        total = len(all_files)
        
        if end_idx is None:
            end_idx = total
        
        end_idx = min(end_idx, total)
        
        print(f"=" * 60)
        print(f"物理化学实验器材图标识别与重命名")
        print(f"=" * 60)
        print(f"图片目录: {self.config.ICONS_DIR}")
        print(f"总文件数: {total}")
        print(f"处理范围: {start_idx + 1} - {end_idx}")
        print(f"已成功处理: {len(self.rename_log)}")
        print(f"已失败记录: {len(self.failed_log)}")
        print(f"=" * 60)
        print()
        
        success_count = 0
        fail_count = 0
        skip_count = 0
        
        start_time = time.time()
        
        for i in range(start_idx, end_idx):
            filename = all_files[i]
            
            # 检查是否已处理
            if filename in self.rename_log:
                skip_count += 1
                continue
            
            success, message = self.process_single_file(filename, i, end_idx)
            
            if success:
                if message != "已处理":
                    success_count += 1
            else:
                fail_count += 1
            
            # 定期保存日志
            if (i + 1) % 10 == 0:
                save_json_file(self.config.LOG_FILE, self.rename_log)
                save_json_file(self.config.FAILED_LOG_FILE, self.failed_log)
            
            # 请求延迟
            time.sleep(self.config.REQUEST_DELAY)
        
        # 保存最终日志
        save_json_file(self.config.LOG_FILE, self.rename_log)
        save_json_file(self.config.FAILED_LOG_FILE, self.failed_log)
        
        elapsed = time.time() - start_time
        
        print()
        print(f"=" * 60)
        print(f"处理完成!")
        print(f"=" * 60)
        print(f"成功重命名: {success_count}")
        print(f"失败: {fail_count}")
        print(f"跳过(已处理): {skip_count}")
        print(f"耗时: {elapsed:.1f}秒")
        print(f"API统计: 成功={self.identifier.stats['success']}, "
              f"失败={self.identifier.stats['failed']}, "
              f"重试={self.identifier.stats['retries']}")
        print(f"=" * 60)
    
    def retry_failed(self, max_rounds: int = None):
        """批量重试失败的文件"""
        if max_rounds is None:
            max_rounds = self.config.MAX_RETRY_ROUNDS
        
        print(f"=" * 60)
        print(f"批量重试失败文件")
        print(f"=" * 60)
        print(f"当前失败文件数: {len(self.failed_log)}")
        print(f"最大重试轮次: {max_rounds}")
        print(f"=" * 60)
        print()
        
        total_retry_success = 0
        total_retry_fail = 0
        
        for round_num in range(1, max_rounds + 1):
            failed_files = self.get_failed_files()
            
            if not failed_files:
                print(f"\n没有需要重试的文件，退出重试循环")
                break
            
            print(f"\n--- 第 {round_num}/{max_rounds} 轮重试 ---")
            print(f"本轮待重试文件数: {len(failed_files)}")
            print()
            
            round_success = 0
            round_fail = 0
            
            for idx, filename in enumerate(failed_files):
                # 检查文件是否已被处理
                if filename in self.rename_log:
                    continue
                
                # 检查文件是否存在
                filepath = os.path.join(self.config.ICONS_DIR, filename)
                if not os.path.exists(filepath):
                    self.record_failure(filename, "文件不存在")
                    continue
                
                print(f"[轮次{round_num}] [{idx + 1}/{len(failed_files)}] 重试: {filename}")
                
                # 识别器材
                equipment_name = self.identifier.identify(filepath)
                
                if not equipment_name or equipment_name == "未知器材":
                    reason = "无法识别" if not equipment_name else "返回未知器材"
                    print(f"  警告: {reason}")
                    self.record_failure(filename, reason)
                    round_fail += 1
                    time.sleep(self.config.REQUEST_DELAY)
                    continue
                
                # 清理文件名
                clean_name = sanitize_filename(equipment_name)
                if not clean_name:
                    print(f"  警告: 文件名为空")
                    self.record_failure(filename, "文件名为空")
                    round_fail += 1
                    time.sleep(self.config.REQUEST_DELAY)
                    continue
                
                # 处理重名
                new_name = clean_name
                counter = 1
                while new_name in self.existing_names:
                    new_name = f"{clean_name}_{counter}"
                    counter += 1
                
                # 重命名文件
                ext = Path(filename).suffix
                new_filename = f"{new_name}{ext}"
                new_filepath = os.path.join(self.config.ICONS_DIR, new_filename)
                
                try:
                    os.rename(filepath, new_filepath)
                    self.existing_names.add(new_name)
                    self.rename_log[filename] = {
                        "new_name": new_filename,
                        "equipment": equipment_name,
                        "timestamp": datetime.now().isoformat(),
                        "retry_round": round_num
                    }
                    self.remove_from_failed(filename)
                    print(f"  -> {new_filename}")
                    round_success += 1
                except Exception as e:
                    print(f"  重命名失败: {e}")
                    self.record_failure(filename, f"重命名失败: {e}")
                    round_fail += 1
                
                # 请求延迟
                time.sleep(self.config.REQUEST_DELAY)
            
            # 保存日志
            save_json_file(self.config.LOG_FILE, self.rename_log)
            save_json_file(self.config.FAILED_LOG_FILE, self.failed_log)
            
            total_retry_success += round_success
            total_retry_fail += round_fail
            
            print(f"\n本轮结果: 成功={round_success}, 失败={round_fail}")
            
            # 如果本轮全部失败，提前退出
            if round_success == 0 and round_fail > 0:
                print(f"\n本轮无成功重试，停止重试")
                break
        
        print()
        print(f"=" * 60)
        print(f"批量重试完成!")
        print(f"=" * 60)
        print(f"总重试成功: {total_retry_success}")
        print(f"总重试失败: {total_retry_fail}")
        print(f"剩余失败文件: {len(self.failed_log)}")
        print(f"=" * 60)
    
    def show_failed_files(self):
        """显示失败文件列表"""
        if not self.failed_log:
            print("没有失败记录")
            return
        
        print(f"=" * 60)
        print(f"失败文件列表 (共 {len(self.failed_log)} 个)")
        print(f"=" * 60)
        
        for filename, info in self.failed_log.items():
            if isinstance(info, dict):
                reason = info.get("reason", "未知原因")
                retry_count = info.get("retry_count", 0)
                print(f"  {filename}")
                print(f"    原因: {reason}")
                print(f"    已重试: {retry_count} 次")
            else:
                print(f"  {filename}: {info}")
        
        print(f"=" * 60)
    
    def clear_failed_log(self):
        """清空失败日志"""
        self.failed_log = {}
        save_json_file(self.config.FAILED_LOG_FILE, self.failed_log)
        print("已清空失败日志")
    
    def show_stats(self):
        """显示统计信息"""
        print(f"=" * 60)
        print(f"处理统计")
        print(f"=" * 60)
        print(f"已成功处理: {len(self.rename_log)} 个文件")
        print(f"失败记录: {len(self.failed_log)} 个文件")
        print(f"API统计: 成功={self.identifier.stats['success']}, "
              f"失败={self.identifier.stats['failed']}, "
              f"重试={self.identifier.stats['retries']}")
        print(f"=" * 60)


# ==================== 命令行入口 ====================

def main():
    parser = argparse.ArgumentParser(
        description="物理化学实验器材图标识别与重命名",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python rename_icons.py                        # 处理所有文件
  python rename_icons.py --start 100            # 从第100个文件开始
  python rename_icons.py --start 0 --end 50     # 处理前50个文件
  python rename_icons.py --api ollama           # 使用Ollama本地模型
  python rename_icons.py --dry-run              # 预览模式，不实际重命名
  python rename_icons.py --retry-failed         # 重试所有失败文件
  python rename_icons.py --retry-failed --max-rounds 10  # 最多重试10轮
  python rename_icons.py --show-failed          # 显示失败文件列表
  python rename_icons.py --clear-failed         # 清空失败日志
  python rename_icons.py --stats                # 显示统计信息
        """
    )
    
    # 基本参数
    parser.add_argument("--start", type=int, default=0,
                       help="起始文件索引 (默认: 0)")
    parser.add_argument("--end", type=int, default=None,
                       help="结束文件索引 (默认: 全部)")
    parser.add_argument("--api", choices=["openai", "ollama"], default="openai",
                       help="使用的API类型 (默认: openai)")
    parser.add_argument("--model", type=str, default=None,
                       help="指定模型名称")
    parser.add_argument("--delay", type=float, default=0.3,
                       help="请求间隔秒数 (默认: 0.3)")
    parser.add_argument("--timeout", type=int, default=120,
                       help="请求超时时间秒数 (默认: 120)")
    parser.add_argument("--dir", type=str, default=None,
                       help="指定图片目录")
    
    # 模式参数
    parser.add_argument("--dry-run", action="store_true",
                       help="预览模式，不实际重命名文件")
    parser.add_argument("--reset", action="store_true",
                       help="重置日志，从头开始处理")
    
    # 重试参数
    parser.add_argument("--retry-failed", action="store_true",
                       help="批量重试失败文件")
    parser.add_argument("--max-rounds", type=int, default=5,
                       help="批量重试最大轮次 (默认: 5)")
    
    # 管理参数
    parser.add_argument("--show-failed", action="store_true",
                       help="显示失败文件列表")
    parser.add_argument("--clear-failed", action="store_true",
                       help="清空失败日志")
    parser.add_argument("--stats", action="store_true",
                       help="显示统计信息")
    
    args = parser.parse_args()
    
    # 创建配置
    config = Config()
    
    if args.dir:
        config.ICONS_DIR = args.dir
    if args.model:
        if args.api == "openai":
            config.OPENAI_MODEL = args.model
        else:
            config.OLLAMA_MODEL = args.model
    config.REQUEST_DELAY = args.delay
    config.REQUEST_TIMEOUT = args.timeout
    config.MAX_RETRY_ROUNDS = args.max_rounds
    
    # 检查目录
    if not os.path.exists(config.ICONS_DIR):
        print(f"错误: 目录不存在 {config.ICONS_DIR}")
        sys.exit(1)
    
    # 创建识别器
    if args.api == "ollama":
        identifier = OllamaIdentifier(config)
        print(f"使用Ollama API: {config.OLLAMA_BASE_URL}")
        print(f"模型: {config.OLLAMA_MODEL}")
    else:
        identifier = OpenAIIdentifier(config)
        print(f"使用OpenAI API: {config.OPENAI_BASE_URL}")
        print(f"模型: {config.OPENAI_MODEL}")
    
    # 创建重命名器
    renamer = IconRenamer(config, identifier)
    
    # 处理各种模式
    if args.clear_failed:
        renamer.clear_failed_log()
        return
    
    if args.show_failed:
        renamer.show_failed_files()
        return
    
    if args.stats:
        renamer.show_stats()
        return
    
    if args.reset:
        if os.path.exists(config.LOG_FILE):
            os.remove(config.LOG_FILE)
            print(f"已删除成功日志: {config.LOG_FILE}")
        if os.path.exists(config.FAILED_LOG_FILE):
            os.remove(config.FAILED_LOG_FILE)
            print(f"已删除失败日志: {config.FAILED_LOG_FILE}")
        print("日志已重置")
        return
    
    # 预览模式
    if args.dry_run:
        print("\n预览模式 - 不会实际重命名文件\n")
        config.REQUEST_DELAY = 0
    
    # 执行重试或正常处理
    if args.retry_failed:
        renamer.retry_failed(max_rounds=args.max_rounds)
    else:
        renamer.run(start_idx=args.start, end_idx=args.end)


if __name__ == "__main__":
    main()
