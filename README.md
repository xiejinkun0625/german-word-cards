# 德语词卡 · Wortschatz

一个纯静态的德语背单词网页应用，收录 **6,519 个 A1–B2 德语词条**（A1 2,423 / A2 1,102 / B1 2,951 / B2 43），按词性主枝与词素词族组织，无需后端、无需构建、可离线运行。

词库与 A2 / B1 闪记卡 docx 牌库同步：动词【解析】只保留现在时、过去时、第二虚拟式的 ich / du / er-sie-es 三人称变位及第二分词，并包含第六周课堂新增词条、链式拆解助记与固定搭配。

## 功能

| 模块 | 说明 |
|---|---|
| 背单词 | 翻卡记忆（德语 → 中文/英文/德解/解析/关联），支持智能队列、只背新词、待复习、按词性枝、按词族芯片选范围；每个范围有独立进度游标，「换一组 / 继续下一组」自动推进到下一批词，走完整池自动循环；间隔重复（不认识/模糊/认识），进度存 localStorage |
| 闯关路径 | 40 个词族关卡，逐个解锁，完成一轮自动前进，含 XP 与连击 |
| 测验 | 德→中 / 中→德四选一，十题一轮，答对累积 XP |
| 查找 | 德语、中文、英文、词根全文检索 + 词性/学习状态筛选；记录每个词的**查阅次数**，列表显示次数徽标，「常查阅」标签按次数降序排列，便于找出反复忘记的词，可重置统计；点击结果弹出完整词条，支持继续加载 |
| 词条详情 | 词性、CEFR、冠词、IPA、翻译、英文、德解、解析（含三人称变位与第二分词）、关联、构词标签、词族邻居、朗读、单卡学习、查阅次数 |

## 本地运行

```bash
python -m http.server 8899
# 打开 http://127.0.0.1:8899/index.html
```

也可以直接双击 `index.html`（浏览器会限制部分本地文件读取，建议用上面的本地服务器）。

## 部署到 GitHub Pages

1. 新建公开仓库，把本目录所有文件上传到 `main` 分支根目录（保持 `data/words.js` 的目录结构）。
2. 打开仓库 **Settings → Pages**，Source 选择 `Deploy from a branch`，分支选 `main`、目录选 `/(root)`，保存。
3. 约 1–2 分钟后可访问 `https://<用户名>.github.io/<仓库名>/`。

若使用 `deploy_github.py`，一条命令即可自动完成建仓、推送与开启 Pages：

```bash
GITHUB_TOKEN=<你的 GitHub PAT> python deploy_github.py german-word-cards
```

PAT 需要 classic `repo` 权限；令牌只用于本地调用 GitHub API，不会写入任何项目文件。

## 技术说明

- 纯 HTML / CSS / 原生 JavaScript，零依赖、零构建。
- `data/words.js` 提供 `window.WORD_DATA`（words / tree / neighbors），由 A2 与 B1 闪记卡 docx 牌库抽取去重生成；牌库更新后重跑 `build_tree_data.py` 即可刷新词库。
- 学习进度保存在浏览器 `localStorage`（键 `wortbaum_v1`）：`prog` 学习等级、`xp` 经验、`cursor` 各范围轮次游标、`rounds` 组数、`look` 查阅次数；换设备不同步。
- 朗读使用浏览器内置 SpeechSynthesis（`de-DE`），需浏览器支持德语语音包。

## 文件结构

```
index.html          页面骨架
app.css             样式与动效
app.js              交互逻辑
data/words.js       词库数据（约 3.8 MB）
deploy_github.py    可选的 GitHub 一键部署脚本
.nojekyll           GitHub Pages 跳过 Jekyll 构建
```
