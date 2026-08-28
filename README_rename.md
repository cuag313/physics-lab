# 物理化学实验器材图标识别与重命名脚本

## 功能说明

本脚本用于批量识别图片中的物理/化学实验器材，并用标准中文名称重命名文件。

支持的器材类型包括：
- **化学器材**：烧杯、试管、锥形瓶、酒精灯、分液漏斗、量筒、滴瓶、蒸发皿、坩埚、研钵、容量瓶、冷凝管、集气瓶等
- **物理器材**：电流表、电压表、滑动变阻器、开关、导线、小车、弹簧测力计、刻度尺、天平、砝码、光具座、凸透镜、凹透镜、平面镜、铁架台等
- **其他器材**：电源、电阻箱、电铃、电磁铁、验电器、温度计、打点计时器等

## 安装依赖

```bash
pip install openai
```

或使用requirements.txt:
```bash
pip install -r requirements.txt
```

## 配置API

### 方式1: 使用OpenAI API

设置环境变量：
```bash
# Windows
set OPENAI_API_KEY=your-api-key
set OPENAI_BASE_URL=https://api.openai.com/v1
set OPENAI_MODEL=gpt-4o-mini

# Linux/Mac
export OPENAI_API_KEY=your-api-key
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4o-mini
```

### 方式2: 使用本地Ollama

1. 安装Ollama: https://ollama.ai
2. 拉取视觉模型: `ollama pull llava`
3. 设置环境变量：
```bash
set OLLAMA_BASE_URL=http://localhost:11434/v1
set OLLAMA_MODEL=llava
```

### 方式3: 使用其他兼容API

修改脚本中的`Config`类，或通过环境变量设置：
```bash
set OPENAI_API_KEY=your-api-key
set OPENAI_BASE_URL=https://your-api.com/v1
set OPENAI_MODEL=your-model-name
```

## 使用方法

### 基本用法

```bash
# 处理所有文件
python rename_icons.py

# 从第100个文件开始处理
python rename_icons.py --start 100

# 只处理前50个文件
python rename_icons.py --start 0 --end 50
```

### 高级选项

```bash
# 使用Ollama本地模型
python rename_icons.py --api ollama

# 指定模型
python rename_icons.py --model gpt-4-vision-preview

# 调整请求间隔（避免限流）
python rename_icons.py --delay 0.5

# 预览模式（不实际重命名）
python rename_icons.py --dry-run

# 重置日志，从头开始
python rename_icons.py --reset

# 指定图片目录
python rename_icons.py --dir /path/to/images
```

### 批量处理大目录

对于大量文件（如3000+），建议分批处理：

```bash
# 第1批: 0-500
python rename_icons.py --start 0 --end 500

# 第2批: 501-1000
python rename_icons.py --start 501 --end 1000

# ...依此类推
```

## 输出说明

### 文件重命名规则

- 原文件名: `00093a8d7e2b41fbc3a4ef9dac81ba29.jpg`
- 新文件名: `锥形瓶.jpg`

### 重名处理

如果多个文件识别为同一器材，会自动添加后缀：
- `烧杯.jpg`
- `烧杯_1.jpg`
- `烧杯_2.jpg`

### 日志文件

处理过程会生成`rename_log.json`日志文件，记录：
- 原文件名
- 新文件名
- 识别结果
- 处理时间

日志用于断点续传，删除日志可重新处理所有文件。

## 常见问题

### Q: 识别不准确怎么办？

A: 可以修改脚本中的`Config.PROMPT`提示词，添加更具体的器材描述。

### Q: API请求失败？

A: 检查API密钥和网络连接。脚本会自动重试3次。

### Q: 如何恢复原文件名？

A: 使用`rename_log.json`中的记录，可以写反向脚本恢复。

### Q: 处理速度太慢？

A: 可以：
1. 减小`--delay`参数（注意API限流）
2. 使用更快的API或本地模型
3. 分批并行处理

## 注意事项

1. 首次运行前建议先用`--dry-run`预览
2. 处理大量文件时建议分批进行
3. 保留`rename_log.json`以便断点续传
4. API调用会产生费用，请注意使用量
