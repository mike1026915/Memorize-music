# Memorize-music：背譜小幫手

合唱團背譜用的 Web app。選聲部之後可以練習：

- **歌詞**：分成全顯示、提示（只露出第一個字）、全遮蓋三種難度，自評「記得／忘了」，也可以只練忘記的句子
- **旋律**：播放自己聲部的合成音（可調速度、循環），畫面類似鋼琴卷軸，可隱藏音高或歌詞；開啟跟唱模式時，播一遍之後換你唱一遍
- **合唱／進拍**：播其他聲部、靜音自己的聲部，進拍前會倒數

## 新增一首歌

1. 建立資料夾 `public/songs/<歌曲代號>/`，放入 `.mscz`、`.mp3`、`.pdf`
2. 執行 `npm run convert`
   - 用 MuseScore 4 把 `.mscz` 轉成 `.musicxml`（只轉有變動的檔案）
   - 印出樂譜裡每個 part 的 id 和 voice，方便你填 `song.json`
   - 重新產生 `public/songs/index.json`
3. 寫 `song.json`（可以參考 `public/songs/demo/`）：

```json
{
  "title": "歌名",
  "score": "score.musicxml",
  "pdf": "score.pdf",
  "parts": {
    "Bass 1": { "part": "P4", "voice": 1 },
    "Bass 2": { "part": "P4", "voice": 2 }
  },
  "audio": { "Bass 1": "bass1.mp3", "全部": "tutti.mp3" }
}
```

4. 再執行一次 `npm run convert` 更新歌單，然後 commit 並 push

補充說明：

- 如果 Bass 1 和 Bass 2 在同一個 voice 裡寫成和弦，`"voice": "1"` 會取最高音，`"voice": "1-low"` 會取最低音
- 沒有 MuseScore 檔的歌，可以省略 `score` 和 `parts`，改寫 `"lyrics": { "Bass 1": "第一句\n第二句" }`，這首歌就只會有歌詞練習和音檔
- MuseScore 不在預設路徑時，用環境變數指定：`MSCORE=/path/to/mscore npm run convert`

## 開發

```bash
npm install
npm run dev     # 本機開發
npm test        # 單元測試
npm run build   # 型別檢查與打包
```

## 部署到 Vercel

在 Vercel 匯入這個 GitHub repo，Framework 選 **Vite**，其他保持預設即可。之後每次 push 到 `main` 都會自動部署。
