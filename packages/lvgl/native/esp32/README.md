# ESP32 + QuickJS + LVGL + Rasen

这个目录包含了在 ESP32 上运行 Rasen LVGL 应用的完整方案。

## 架构

```
┌─────────────────────────────────────────┐
│         TypeScript/JavaScript           │
│   import { div, button } from '@rasenjs/lvgl'  │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│            QuickJS 引擎                  │
│        (轻量级 JS 运行时)                │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│           LVGL 渲染层                    │
│      (Tailwind 类 → LVGL 样式)          │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│         ESP32 + SPI/I2C 屏幕            │
└─────────────────────────────────────────┘
```

## 支持的硬件

- ESP32-C6 (你当前的板子)
- ESP32-S3
- ESP32

## 支持的屏幕

- ST7789 (SPI)
- ILI9341 (SPI)
- SSD1306 (I2C OLED)

## 安装步骤

### 1. 安装 ESP-IDF

Windows 用户下载安装器：
https://dl.espressif.com/dl/esp-idf/?idf=4.4

或使用命令：

```powershell
# 下载 ESP-IDF 安装器
Invoke-WebRequest -Uri "https://dl.espressif.com/dl/idf-installer/esp-idf-tools-setup-online-2.28.exe" -OutFile "esp-idf-installer.exe"

# 运行安装器
.\esp-idf-installer.exe
```

### 2. 克隆本项目

```bash
cd packages/lvgl/native/esp32
idf.py set-target esp32c6
idf.py build
idf.py flash -p COM5
```

### 3. 上传 JS 代码

编译后的 JS 代码会被打包进固件，或通过文件系统上传。

## 项目结构

```
esp32/
├── CMakeLists.txt          # ESP-IDF 项目配置
├── main/
│   ├── CMakeLists.txt
│   ├── main.c              # 入口：初始化 LVGL + QuickJS
│   ├── qjs_lvgl_bindgen.c  # QuickJS ↔ LVGL 绑定
│   └── app.js.h            # 打包的 JS 代码
├── components/
│   ├── quickjs/            # QuickJS 引擎
│   └── lvgl/               # LVGL 图形库
└── sdkconfig               # ESP-IDF 配置
```
