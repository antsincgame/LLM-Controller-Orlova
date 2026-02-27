# LLM Controller Orlova

MCP-сервер + Electron GUI для полного цикла управления локальными LLM и diffusion-моделями: поиск на Hugging Face, ранжирование, загрузка через Ollama, управление моделями ComfyUI.

## Возможности

- **LLM**: поиск GGUF-моделей на HF, умное ранжирование, pull через Ollama, управление локальными моделями
- **Diffusion**: поиск checkpoints/LoRA/VAE/ControlNet/Upscaler на HF, скачивание в директорию ComfyUI
- **GUI**: Electron-приложение с вкладками Поиск, Модели, Изображения, Диски, Настройки
- **MCP**: 12 инструментов для управления из Cursor IDE

## Требования

- [Node.js](https://nodejs.org/) >= 18
- [Ollama](https://ollama.ai/) установлен и запущен
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI) (опционально, для diffusion-моделей)

## Установка

```bash
npm install
npm run build
```

## Запуск

```bash
# GUI (Electron)
npm start

# Сборка AppImage
npm run dist

# MCP-сервер (для Cursor)
npm run start:mcp
```

## Подключение к Cursor

Добавьте в `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "llm-controller-orlova": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/путь/к/проекту"
    }
  }
}
```

## MCP-инструменты

### Ollama (LLM)

| Инструмент | Описание |
|---|---|
| `search_hf_models` | Поиск GGUF-моделей на Hugging Face с фильтрами |
| `rank_models` | Ранжирование по скору: RAM, квантование, свежесть, популярность |
| `get_disk_info` | Информация о дисках и свободном месте |
| `pull_model` | Загрузка модели через Ollama REST API с прогрессом |
| `list_local_models` | Список установленных моделей в Ollama |
| `delete_model` | Удаление модели с освобождением места |
| `set_models_path` | Изменение пути хранения моделей |
| `check_model_update` | Проверка наличия обновлений на HF |

### ComfyUI (Diffusion)

| Инструмент | Описание |
|---|---|
| `search_diffusion_models` | Поиск checkpoints, LoRA, VAE, ControlNet, Upscaler |
| `download_diffusion_model` | Скачивание в директорию ComfyUI с прогрессом |
| `list_diffusion_models` | Список установленных diffusion-моделей |
| `delete_diffusion_model` | Удаление diffusion-модели |

## Конфигурация

Конфиг хранится в `~/.config/llm-controller-orlova/config.json`:

```json
{
  "hfToken": null,
  "ollamaHost": "http://127.0.0.1:11434",
  "modelsPath": null,
  "comfyuiPath": null,
  "cacheTtlMinutes": 15
}
```

### Переменные окружения

| Переменная | Описание |
|---|---|
| `HF_TOKEN` | Токен Hugging Face для gated-моделей (Llama, Gemma) |
| `OLLAMA_HOST` | Адрес Ollama API (по умолчанию `http://127.0.0.1:11434`) |
| `OLLAMA_MODELS` | Путь хранения моделей Ollama |

## Архитектура

```
src/
  features/
    hf-search/       # Поиск GGUF на HF
    ranking/          # Умное ранжирование моделей
    ollama/           # Управление Ollama
    disk/             # Дисковое пространство
    comfyui/          # Управление diffusion-моделями
  shared/
    config/           # Конфигурация приложения
    lib/              # Утилиты (cache, logger, format, quant, paths)
    mcp/              # MCP-сервер и инструменты
    schema/           # Общие типы
  electron/           # Electron main process
static/               # GUI (HTML, CSS, JS)
```

## Лицензия

MIT
