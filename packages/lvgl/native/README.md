# Rasen LVGL Native

这个目录包含 LVGL 运行时的 C 代码，用于模拟器和 ESP32。

## 目录结构

```
native/
├── common/           # 共享 C 代码
│   ├── qjs_rasen.h   # 头文件
│   ├── qjs_rasen.c   # QuickJS + LVGL 绑定
│   └── tw_parser.c   # Tailwind 解析器
├── simulator/        # SDL2 桌面模拟器
│   ├── main.c
│   ├── CMakeLists.txt
│   └── lv_conf.h
├── esp32/            # ESP32 固件
│   ├── main/
│   └── CMakeLists.txt
└── examples/         # 示例 JS 文件
    ├── counter.js
    └── hello.js
```

## 构建模拟器

### 依赖

- CMake 3.16+
- SDL2 开发库
- C 编译器 (GCC, Clang, MSVC)

### Windows (MSVC)

```powershell
# 安装 vcpkg 并安装 SDL2
vcpkg install sdl2:x64-windows

# 构建
cd simulator
mkdir build && cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=[vcpkg root]/scripts/buildsystems/vcpkg.cmake
cmake --build . --config Release
```

### Linux/macOS

```bash
# 安装 SDL2
# Ubuntu: sudo apt install libsdl2-dev
# macOS: brew install sdl2

# 克隆依赖
cd simulator/deps
git clone https://github.com/nicbarker/quickjs quickjs
git clone https://github.com/lvgl/lvgl lvgl

# 构建
cd ..
mkdir build && cd build
cmake ..
make -j4
```

### 运行示例

```bash
./rasen_simulator ../examples/counter.js
```

## 构建 ESP32 固件

### 依赖

- ESP-IDF 5.x
- ESP32 开发板

### 步骤

```bash
# 设置 ESP-IDF 环境
. $IDF_PATH/export.sh

# 构建
cd esp32
idf.py build

# 烧录
idf.py -p /dev/ttyUSB0 flash

# 监控
idf.py -p /dev/ttyUSB0 monitor
```

## 代码复用

`common/` 目录的代码在模拟器和 ESP32 之间共享：

| 文件          | 功能                            |
| ------------- | ------------------------------- |
| `qjs_rasen.h` | 公共 API 头文件                 |
| `qjs_rasen.c` | QuickJS 运行时 + 元素创建       |
| `tw_parser.c` | Tailwind class 解析 → LVGL 样式 |

只有显示驱动不同：

- 模拟器：SDL2
- ESP32：SPI/I2C LCD 驱动

## 屏幕配置

修改以下定义来适配你的屏幕：

```c
// simulator/main.c 或 esp32/main/main.c
#define DISPLAY_WIDTH  320
#define DISPLAY_HEIGHT 240
```

对于 ESP32，还需要配置 GPIO 引脚和 LCD 驱动（ST7789, ILI9341 等）。
