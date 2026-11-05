// ============================================================
// i18n.js — 轻量中英双语（中/EN）
// - t(key, params)：点号键 + {param} 插值
// - 静态 DOM：data-i18n（textContent）/ data-i18n-html（innerHTML）
//   / data-i18n-title（title 属性），applyStatic() 一次性应用
// - 语言选择存 localStorage('tc-lang')，默认跟随浏览器语言
// - 术语表：聚落=settlement，编年史=Chronicle，国家=nation，
//   仓库=storehouse，谷仓=granary，风车=windmill，哨塔=watchtower
// ============================================================

export const ZH = {
  // ---- 通用 / 顶栏 ----
  'ui.langTip': 'Switch to English',
  'tooltip.rename': '更换世界名/种子',
  'perf.render': '渲染',
  'perf.calls': '次',
  'perf.tris': '三角',
  'perf.chunks': '区块',
  'perf.agents': '村民',
  'perf.gen': '生成',
  'perf.sim': '模拟',
  'perf.heap': 'JS堆',

  // ---- 时间栏 ----
  'tooltip.pause': '暂停（空格）',
  'time.jump1': '+1年',
  'time.jump10': '+10年',
  'time.jump100': '+100年',
  'tooltip.jump1': '向前演化 1 年',
  'tooltip.jump10': '向前演化 10 年',
  'tooltip.jump100': '向前演化 100 年',
  'tooltip.sun': '加速时锁定日照（避免昼夜闪烁）',
  'tooltip.history': '世界历史',
  'tooltip.map': '世界地图（M）',
  'tooltip.save': '保存世界',
  'tooltip.help': '帮助',

  // ---- 上帝工具 ----
  'god.title': '上帝之手',
  'god.weather': '天气',
  'god.disaster': '灾害',
  'god.bless': '恩赐',
  'god.settlements': '聚落',
  'w.clear': '晴天', 'w.rain': '降雨', 'w.storm': '雷暴', 'w.snow': '降雪', 'w.fog': '大雾',
  'd.drought': '干旱', 'd.flood': '洪水', 'd.fire': '野火', 'd.blizzard': '暴风雪', 'd.plague': '疫病',
  'b.settle': '创建聚落', 'b.forest': '播种森林', 'b.food': '赐予食物', 'b.rainfert': '风调雨顺',

  // ---- 小地图 / 全景 ----
  'map.politicalBtn': '政',
  'map.modeTerrain': '当前：地形模式（点击切换政治模式）',
  'map.modePolitical': '当前：政治模式（点击切回地形）',
  'map.hint': '点击展开全景地图 · M 收起',
  'map.hintPolitical': '政治模式 · 点击展开全景地图',
  'bm.title': '🌍 世界全景',
  'bm.sampling': '高清采样中…',
  'bm.legend.settle': '聚落（大小=人口）',
  'bm.legend.town': '城镇/城市',
  'bm.legend.trade': '商路',
  'bm.legend.war': '战争',
  'bm.legend.view': '视野位置',
  'bm.close': '✕ 关闭（M / ESC）',

  // ---- 编年史 ----
  'hist.title': '世界编年史',
  'hist.all': '全部',
  'hist.war': '战争',
  'hist.build': '建设',
  'hist.trade': '贸易',
  'hist.good': '吉兆',
  'hist.bad': '凶兆',
  'hist.count': '（{n} 条）',
  'hist.countFiltered': '（{a}/{b} 条）',
  'hist.year': '第{y}年',
  'hist.empty': '该类型暂无记录',

  // ---- 存档 ----
  'save.title': '存档管理',
  'save.note': '自动存档每 3 分钟覆盖一次；读取存档会离开当前世界（未保存的进度将丢失）。',
  'slot.autosave': '自动存档',
  'slot.named': '存档槽 {n}',
  'slot.every3': '（每 3 分钟）',
  'slot.empty': '— 空槽位 —',
  'slot.loading': '正在读取存档列表…',
  'slot.listFailed': '读取失败：',
  'slot.saved': '世界已保存到「{slot}」（可在存档管理中读取）',
  'slot.otherWorld': '该槽位属于另一个世界（{name} · Seed {seed}）。\n读取将离开当前世界，确定？',
  'slot.deleteConfirm': '删除「{slot}」？（不可恢复）',
  'slot.deleted': '已删除「{slot}」',
  'slot.saveFailed': '保存失败：',
  'slot.exportFailed': '导出失败：',
  'slot.deleteFailed': '删除失败：',
  'slot.exported': '已导出「{slot}」→ {file}',
  'slot.isEmpty': '该槽位为空',
  'slot.importTitle': '从文件导入',
  'slot.importHint': '选择之前导出的 .json 存档文件',
  'slot.importBtn': '导入…',
  'slot.importBadJson': '导入失败：不是有效的 JSON 文件',
  'slot.importNoData': '导入失败：文件缺少存档数据（sim/seed）',
  'slot.importTooOld': '导入失败：存档版本过旧（v<2）',
  'slot.importFailed': '导入失败：',
  'slot.slotsFull': '三个存档槽都已占用，覆盖到「存档槽 1」？',
  'slot.imported': '已导入到「{slot}」（{name} · Seed {seed}）',
  'btn.save': '保存',
  'btn.load': '读取',
  'btn.export': '导出',
  'btn.delete': '删除',

  // ---- 帮助 ----
  'help.title': '操作说明',
  'help.look': '<b>观察</b>：左键拖动平移 · 中键拖动旋转 · 滚轮缩放 · WASD 平移',
  'help.select': '<b>选择</b>：点击村民查看状态 · 点击建筑/地面查看聚落',
  'help.time': '<b>时间</b>：空格暂停 · 1×~256× 变速 · 加速可观察数十年演化',
  'help.god': '<b>上帝</b>：左侧面板改变天气、降下灾害、创建聚落',
  'help.map': '<b>地图</b>：M 或 🗗 打开全屏世界全景，点击任意位置跳转；右下角「政」切换小地图政治模式',
  'help.save': '<b>存档</b>：💾 打开存档管理（自动存档 + 3 个手动槽位），读取存档会离开当前世界',

  // ---- 加载遮罩 ----
  'ov.waking': '正在唤醒世界…',
  'boot.mountains': '正在生成山脉与河流…',
  'boot.restoring': '正在恢复世界…',
  'boot.restoredAuto': '已从自动存档恢复世界',
  'boot.restoredSlot': '已从存档槽「{slot}」恢复世界',
  'boot.welcome': '欢迎来到这个世界',
  'boot.failed': '启动失败：',

  // ---- HUD 动态 ----
  'date.label': '第{y}年 {s} {d}/{m}日',
  'hud.day': '昼 ',
  'hud.night': '夜 ',
  'hud.ticker': '第{year}年 · {text}',
  'settle.popUnit': '{n} 人',
  'season.0': '春', 'season.1': '夏', 'season.2': '秋', 'season.3': '冬',
  'weather.0': '晴', 'weather.1': '多云', 'weather.2': '降雨', 'weather.3': '雷暴',
  'weather.4': '降雪', 'weather.5': '暴风雪', 'weather.6': '大雾', 'weather.7': '沙尘暴',

  // ---- 聚落面板 ----
  'row.pop': '人口',
  'row.popVal': '{a} / 容纳 {b}',
  'row.dev': '发展',
  'row.food': '食物',
  'row.wood': '木材',
  'row.stone': '石料',
  'row.wealth': '财富',
  'row.morale': '士气',
  'row.nation': '国家',
  'row.none': '无',
  'panel.building': '建造中',
  'panel.effects': '状态：{list}',
  'panel.builds': '建筑',
  'panel.none': '尚无',
  'panel.status': '状态',
  'panel.pos': '位置',
  'panel.hp': '生命',
  'tag.0': '渔村', 'tag.1': '村庄', 'tag.2': '城镇', 'tag.3': '都市',
  'tag.founded': '第{y}年建立',
  'tag.culture': '文化·{v}',
  'culture.wood': '木构', 'culture.stone': '石砌', 'culture.adobe': '夯土', 'culture.nordic': '北地',
  'dev.0': '定居点', 'dev.1': '村庄', 'dev.2': '城镇', 'dev.3': '城市',
  'tech.0': '石器时代', 'tech.1': '农耕时代', 'tech.2': '金属时代', 'tech.3': '火药时代',
  'build.house': '住宅', 'build.farm': '农田', 'build.storage': '仓库', 'build.lumber': '伐木场',
  'build.quarry': '采石场', 'build.market': '市场', 'build.townhall': '市政厅',
  'build.watchtower': '哨塔', 'build.walls': '城墙', 'build.dock': '渔码头',
  'build.monument': '纪念碑', 'build.windmill': '风车', 'build.granary': '谷仓',
  'effect.drought': '🌾干旱', 'effect.flood': '🌊洪水', 'effect.blizzard': '❄️暴风雪', 'effect.plague': '☠️疫病',

  // ---- 村民面板 ----
  'job.farmer': '农夫', 'job.lumberjack': '伐木工', 'job.miner': '矿工', 'job.builder': '工匠',
  'job.villager': '村民', 'job.child': '孩童', 'job.elder': '长者', 'job.guard': '卫兵',
  'job.soldier': '士兵', 'job.trader': '商人', 'job.fisher': '渔夫', 'job.hunter': '猎人',
  'job.defender': '守军',
  'st.idle': '闲逛', 'st.walk': '赶路', 'st.sleep': '睡觉', 'st.fight': '战斗', 'st.work': '工作',
  'st.work.farmer': '劳作', 'st.work.builder': '建造', 'st.work.lumberjack': '伐木',
  'agent.army': '{name}军队',
  'agent.desc.soldier': '正在执行军事任务。',
  'agent.desc.trader': '往返于聚落之间的商队。',
  'agent.desc.child': '在村里玩耍的孩子。',
  'agent.desc.default': '依靠双手建设家园的居民。',

  // ---- 上帝工具 toast ----
  'toast.clear': '晴空万里',
  'toast.rain': '降下甘霖',
  'toast.storm': '雷暴来临',
  'toast.snow': '大雪纷飞',
  'toast.fog': '大雾弥漫',
  'toast.drought': '干旱降临',
  'toast.flood': '洪水泛滥！',
  'toast.fire': '野火燃起！',
  'toast.blizzard': '暴风雪来袭',
  'toast.plague': '疫病蔓延…',
  'toast.noTarget': '无法降灾（此处无聚落或已在灾中）',
  'toast.noTargetShort': '无法降灾',
  'toast.sunlock': '加速时将锁定日照',
  'toast.sunfree': '日照跟随真实时间',
  'toast.evolve': '正在演化 {n} 年…',
  'toast.evolveProgress': '正在演化 {n} 年… {y} 年（{p}%）',
  'toast.evolved': '已演化至 {date}（{s}s）',
  'confirm.reroll': '用一个全新的种子生成新世界？（当前世界可先 💾 保存）',

  // ---- sim 返回消息 ----
  'god.noSettleHere': '此处无法定居（水域或河床）',
  'god.founded': '{name} 建立了',
  'god.noSettleNear': '附近没有聚落',
  'god.foodGiven': '{name} 获得了 200 食物',
  'god.noTrees': '这里种不下树',
  'god.treesPlanted': '种下了 {n} 棵树',
  'god.fertile': '风调雨顺',
  'sim.seeking': '正在为文明寻找家园…',
  'sim.rising': '诸国崛起…',

  // ---- IndexedDB 错误 ----
  'db.txAbort': '存档事务中止',
  'db.delAbort': '删除事务中止',
  'db.listFail': '读取存档列表失败',

  // ---- 编年史事件（sim 层记录 key，渲染时翻译） ----
  'ev.worldAwake': '世界苏醒，{n} 个聚落点燃了文明的火种',
  'ev.nationsRise': '{n} 个国家在世界各地崛起',
  'ev.drought': '{name} 遭遇大旱，田地龟裂',
  'ev.flood': '洪水席卷 {name}，{n} 片农田被毁',
  'ev.fireNear': '{name} 附近的森林燃起大火！',
  'ev.fire': '森林燃起大火！',
  'ev.blizzard': '暴风雪袭击 {name}，村民闭门不出',
  'ev.plague': '疫病在 {name} 蔓延',
  'ev.warDeclare': '{a} 与 {b} 爆发战争！',
  'ev.march': '{nation} 的军队向 {target} 进军',
  'ev.assault': '{nation} 的军队猛攻 {target}',
  'ev.conquered': '{target} 被 {victor} 攻陷！',
  'ev.repelled': '{target} 击退了 {nation} 的进攻',
  'ev.warEndTruce': '{a} 与 {b} 停战（白和）',
  'ev.warEndConquest': '{a} 与 {b} 停战（征服）',
  'ev.warEndVictory': '{a} 与 {b} 停战（胜利）',
  'ev.tradeFood': '商队将粮食从 {a} 运抵 {b}',
  'ev.tradeWood': '商队将木材从 {a} 运抵 {b}',
  'ev.tradeStone': '商队将石料从 {a} 运抵 {b}',
  'ev.famineDeath': '{name} 在饥荒中消亡了',
  'ev.devGrow.0': '{name} 成长为定居点（人口 {n}）',
  'ev.devGrow.1': '{name} 成长为村庄（人口 {n}）',
  'ev.devGrow.2': '{name} 成长为城镇（人口 {n}）',
  'ev.devGrow.3': '{name} 成长为城市（人口 {n}）',
  'ev.build.house': '{name} 建成了住宅',
  'ev.build.farm': '{name} 开垦出了新的农田',
  'ev.build.storage': '{name} 建成了仓库',
  'ev.build.lumber': '{name} 建成了伐木场',
  'ev.build.quarry': '{name} 建成了采石场',
  'ev.build.market': '{name} 建成了市场',
  'ev.build.townhall': '{name} 建成了市政厅',
  'ev.build.watchtower': '{name} 建成了哨塔',
  'ev.build.walls': '{name} 筑起了城墙',
  'ev.build.dock': '{name} 建成了渔码头',
  'ev.build.monument': '{name} 立起了纪念碑',
  'ev.build.windmill': '{name} 建成了风车',
  'ev.build.granary': '{name} 建成了谷仓',
  'ev.foundJoin': '{name} 建立，加入 {nation}',
  'ev.foundNew': '新的国家在 {name} 建立',
  'ev.blessFood': '天赐粮食，{name} 的粮仓充盈',
  'ev.fertile': '风调雨顺，诸聚落五谷丰登',
  'ev.wolf': '{settle} 的村民 {name} 被狼群叼走了',
};

export const EN = {
  // ---- 通用 / 顶栏 ----
  'ui.langTip': '切换到中文',
  'tooltip.rename': 'Reroll the world (new name & seed)',
  'perf.render': 'Render',
  'perf.calls': 'calls',
  'perf.tris': 'tris',
  'perf.chunks': 'Chunks',
  'perf.agents': 'Villagers',
  'perf.gen': 'Gen',
  'perf.sim': 'Sim',
  'perf.heap': 'JS heap',

  // ---- 时间栏 ----
  'tooltip.pause': 'Pause (Space)',
  'time.jump1': '+1y',
  'time.jump10': '+10y',
  'time.jump100': '+100y',
  'tooltip.jump1': 'Fast-forward 1 year',
  'tooltip.jump10': 'Fast-forward 10 years',
  'tooltip.jump100': 'Fast-forward 100 years',
  'tooltip.sun': 'Hold the sun still while speeding up (avoids day/night flicker)',
  'tooltip.history': 'World chronicle',
  'tooltip.map': 'World map (M)',
  'tooltip.save': 'Save world',
  'tooltip.help': 'Help',

  // ---- 上帝工具 ----
  'god.title': 'Hand of God',
  'god.weather': 'Weather',
  'god.disaster': 'Disasters',
  'god.bless': 'Blessings',
  'god.settlements': 'Settlements',
  'w.clear': 'Clear', 'w.rain': 'Rain', 'w.storm': 'Storm', 'w.snow': 'Snow', 'w.fog': 'Fog',
  'd.drought': 'Drought', 'd.flood': 'Flood', 'd.fire': 'Wildfire', 'd.blizzard': 'Blizzard', 'd.plague': 'Plague',
  'b.settle': 'Found settlement', 'b.forest': 'Plant forest', 'b.food': 'Grant food', 'b.rainfert': 'Fair weather',

  // ---- 小地图 / 全景 ----
  'map.politicalBtn': 'P',
  'map.modeTerrain': 'Terrain mode (click to switch to political)',
  'map.modePolitical': 'Political mode (click to switch back to terrain)',
  'map.hint': 'Click to open the world map · M to close',
  'map.hintPolitical': 'Political mode · Click to open the world map',
  'bm.title': '🌍 World Panorama',
  'bm.sampling': 'Rendering high-res…',
  'bm.legend.settle': 'Settlements (size = population)',
  'bm.legend.town': 'Towns / cities',
  'bm.legend.trade': 'Trade routes',
  'bm.legend.war': 'War',
  'bm.legend.view': 'Your view',
  'bm.close': '✕ Close (M / ESC)',

  // ---- 编年史 ----
  'hist.title': 'World Chronicle',
  'hist.all': 'All',
  'hist.war': 'Wars',
  'hist.build': 'Building',
  'hist.trade': 'Trade',
  'hist.good': 'Boons',
  'hist.bad': 'Banes',
  'hist.count': ' ({n} entries)',
  'hist.countFiltered': ' ({a}/{b} entries)',
  'hist.year': 'Year {y}',
  'hist.empty': 'Nothing recorded here yet.',

  // ---- 存档 ----
  'save.title': 'Save Manager',
  'save.note': 'The autosave overwrites itself every 3 minutes. Loading a save leaves the current world (unsaved progress will be lost).',
  'slot.autosave': 'Autosave',
  'slot.named': 'Save slot {n}',
  'slot.every3': ' (every 3 min)',
  'slot.empty': '— Empty slot —',
  'slot.loading': 'Loading save list…',
  'slot.listFailed': 'Failed to load: ',
  'slot.saved': 'World saved to {slot} (load it from the save manager)',
  'slot.otherWorld': 'This slot belongs to another world ({name} · Seed {seed}).\nLoading it will leave the current world. Continue?',
  'slot.deleteConfirm': 'Delete {slot}? This cannot be undone.',
  'slot.deleted': 'Deleted {slot}',
  'slot.saveFailed': 'Save failed: ',
  'slot.exportFailed': 'Export failed: ',
  'slot.deleteFailed': 'Delete failed: ',
  'slot.exported': 'Exported {slot} → {file}',
  'slot.isEmpty': 'This slot is empty',
  'slot.importTitle': 'Import from file',
  'slot.importHint': 'Choose a save you exported earlier as .json',
  'slot.importBtn': 'Import…',
  'slot.importBadJson': 'Import failed: not a valid JSON file',
  'slot.importNoData': 'Import failed: file is missing save data (sim/seed)',
  'slot.importTooOld': 'Import failed: save version too old (v<2)',
  'slot.importFailed': 'Import failed: ',
  'slot.slotsFull': 'All three save slots are full. Overwrite Save slot 1?',
  'slot.imported': 'Imported into {slot} ({name} · Seed {seed})',
  'btn.save': 'Save',
  'btn.load': 'Load',
  'btn.export': 'Export',
  'btn.delete': 'Delete',

  // ---- 帮助 ----
  'help.title': 'How to Play',
  'help.look': '<b>Look</b> — drag to pan · middle-drag to orbit · scroll to zoom · WASD to move',
  'help.select': '<b>Select</b> — click a villager to see what they are up to · click a building or the ground to open its settlement',
  'help.time': '<b>Time</b> — Space to pause · 1× to 256× speed · fast-forward decades of history',
  'help.god': '<b>God</b> — the left panel changes the weather, sends disasters and founds settlements',
  'help.map': '<b>Map</b> — press M for the full-screen panorama and click anywhere to travel there · the bottom-right button toggles the political minimap',
  'help.save': '<b>Saves</b> — 💾 opens the save manager (autosave + 3 manual slots); loading a save leaves the current world',

  // ---- 加载遮罩 ----
  'ov.waking': 'Waking the world…',
  'boot.mountains': 'Raising mountains and rivers…',
  'boot.restoring': 'Restoring your world…',
  'boot.restoredAuto': 'World restored from autosave',
  'boot.restoredSlot': 'World restored from {slot}',
  'boot.welcome': 'Welcome to this world',
  'boot.failed': 'Failed to start: ',

  // ---- HUD 动态 ----
  'date.label': 'Year {y} · {s}, day {d}/{m}',
  'hud.day': 'Day ',
  'hud.night': 'Night ',
  'hud.ticker': 'Year {year} · {text}',
  'settle.popUnit': '{n} pop',
  'season.0': 'Spring', 'season.1': 'Summer', 'season.2': 'Autumn', 'season.3': 'Winter',
  'weather.0': 'Clear', 'weather.1': 'Cloudy', 'weather.2': 'Rain', 'weather.3': 'Thunderstorm',
  'weather.4': 'Snow', 'weather.5': 'Blizzard', 'weather.6': 'Fog', 'weather.7': 'Sandstorm',

  // ---- 聚落面板 ----
  'row.pop': 'Population',
  'row.popVal': '{a} / cap {b}',
  'row.dev': 'Development',
  'row.food': 'Food',
  'row.wood': 'Timber',
  'row.stone': 'Stone',
  'row.wealth': 'Wealth',
  'row.morale': 'Morale',
  'row.nation': 'Nation',
  'row.none': 'None',
  'panel.building': 'Building',
  'panel.effects': 'Afflictions: {list}',
  'panel.builds': 'Buildings',
  'panel.none': 'None yet',
  'panel.status': 'Status',
  'panel.pos': 'Position',
  'panel.hp': 'Health',
  'tag.0': 'Fishing village', 'tag.1': 'Village', 'tag.2': 'Town', 'tag.3': 'City',
  'tag.founded': 'founded in year {y}',
  'tag.culture': '{v} culture',
  'culture.wood': 'Timber-frame', 'culture.stone': 'Stone masonry', 'culture.adobe': 'Rammed earth', 'culture.nordic': 'Nordic',
  'dev.0': 'outpost', 'dev.1': 'village', 'dev.2': 'town', 'dev.3': 'city',
  'tech.0': 'Stone Age', 'tech.1': 'Agrarian Age', 'tech.2': 'Metal Age', 'tech.3': 'Gunpowder Age',
  'build.house': 'House', 'build.farm': 'Farm', 'build.storage': 'Storehouse', 'build.lumber': 'Lumber camp',
  'build.quarry': 'Quarry', 'build.market': 'Market', 'build.townhall': 'Town hall',
  'build.watchtower': 'Watchtower', 'build.walls': 'Walls', 'build.dock': 'Fishing dock',
  'build.monument': 'Monument', 'build.windmill': 'Windmill', 'build.granary': 'Granary',
  'effect.drought': '🌾 Drought', 'effect.flood': '🌊 Flood', 'effect.blizzard': '❄️ Blizzard', 'effect.plague': '☠️ Plague',

  // ---- 村民面板 ----
  'job.farmer': 'Farmer', 'job.lumberjack': 'Lumberjack', 'job.miner': 'Miner', 'job.builder': 'Builder',
  'job.villager': 'Villager', 'job.child': 'Child', 'job.elder': 'Elder', 'job.guard': 'Guard',
  'job.soldier': 'Soldier', 'job.trader': 'Trader', 'job.fisher': 'Fisher', 'job.hunter': 'Hunter',
  'job.defender': 'Defender',
  'st.idle': 'Idling', 'st.walk': 'On the road', 'st.sleep': 'Asleep', 'st.fight': 'Fighting', 'st.work': 'Working',
  'st.work.farmer': 'Tending crops', 'st.work.builder': 'Building', 'st.work.lumberjack': 'Felling trees',
  'agent.army': '{name} army',
  'agent.desc.soldier': 'Carrying out military orders.',
  'agent.desc.trader': 'A caravan moving goods between settlements.',
  'agent.desc.child': 'A child playing around the village.',
  'agent.desc.default': 'A settler building a home with their own two hands.',

  // ---- 上帝工具 toast ----
  'toast.clear': 'Clear skies at last',
  'toast.rain': 'A gentle rain begins to fall',
  'toast.storm': 'A thunderstorm rolls in',
  'toast.snow': 'Snow drifts from the sky',
  'toast.fog': 'A thick fog settles in',
  'toast.drought': 'Drought descends',
  'toast.flood': 'Floodwaters surge!',
  'toast.fire': 'Wildfire breaks out!',
  'toast.blizzard': 'A blizzard sweeps in',
  'toast.plague': 'Plague takes hold…',
  'toast.noTarget': 'Cannot strike here (no settlement nearby, or already afflicted)',
  'toast.noTargetShort': 'Cannot strike here',
  'toast.sunlock': 'The sun will hold still while fast-forwarding',
  'toast.sunfree': 'Sunlight now follows the in-world clock',
  'toast.evolve': 'Evolving {n} years…',
  'toast.evolveProgress': 'Evolving {n} years… year {y} ({p}%)',
  'toast.evolved': 'Evolved to {date} ({s}s)',
  'confirm.reroll': 'Reroll a brand-new world from a fresh seed? (Save the current one with 💾 first if you want to keep it.)',

  // ---- sim 返回消息 ----
  'god.noSettleHere': "Can't settle here (open water or riverbed)",
  'god.founded': '{name} has been founded',
  'god.noSettleNear': 'No settlement nearby',
  'god.foodGiven': '{name} received 200 food',
  'god.noTrees': 'Nothing can take root here',
  'god.treesPlanted': 'Planted {n} trees',
  'god.fertile': 'Fair skies and gentle rains',
  'sim.seeking': 'Seeking out homes for the first settlers…',
  'sim.rising': 'Nations are rising…',

  // ---- IndexedDB 错误 ----
  'db.txAbort': 'Save transaction aborted',
  'db.delAbort': 'Delete transaction aborted',
  'db.listFail': 'Failed to list saves',

  // ---- 编年史事件（sim 层记录 key，渲染时翻译） ----
  'ev.worldAwake': 'The world awakens — {n} settlements kindle the spark of civilization',
  'ev.nationsRise': '{n} nations rise across the world',
  'ev.drought': 'Drought strikes {name}, cracking the fields open',
  'ev.flood': 'Floods sweep through {name}, drowning {n} farms',
  'ev.fireNear': 'Fire breaks out in the woods near {name}!',
  'ev.fire': 'Fire breaks out in the forest!',
  'ev.blizzard': 'A blizzard batters {name}; villagers keep behind closed doors',
  'ev.plague': 'Plague spreads through {name}',
  'ev.warDeclare': '{a} and {b} go to war!',
  'ev.march': "{nation}'s army marches on {target}",
  'ev.assault': "{nation}'s army storms the walls of {target}",
  'ev.conquered': '{target} falls to {victor}!',
  'ev.repelled': "{target} repels {nation}'s assault",
  'ev.warEndTruce': '{a} and {b} settle into an uneasy white peace',
  'ev.warEndConquest': 'War between {a} and {b} ends in conquest',
  'ev.warEndVictory': 'War between {a} and {b} ends in a hard-won victory',
  'ev.tradeFood': 'A caravan hauls grain from {a} to {b}',
  'ev.tradeWood': 'A caravan hauls timber from {a} to {b}',
  'ev.tradeStone': 'A caravan hauls stone from {a} to {b}',
  'ev.famineDeath': '{name} wastes away in the famine',
  'ev.devGrow.0': '{name} grows into an outpost (pop. {n})',
  'ev.devGrow.1': '{name} grows into a village (pop. {n})',
  'ev.devGrow.2': '{name} grows into a town (pop. {n})',
  'ev.devGrow.3': '{name} grows into a city (pop. {n})',
  'ev.build.house': '{name} raises a new house',
  'ev.build.farm': '{name} brings a new field under the plow',
  'ev.build.storage': '{name} completes a storehouse',
  'ev.build.lumber': '{name} sets up a lumber camp',
  'ev.build.quarry': '{name} opens a quarry',
  'ev.build.market': '{name} opens a market',
  'ev.build.townhall': '{name} raises a town hall',
  'ev.build.watchtower': '{name} builds a watchtower',
  'ev.build.walls': '{name} encircles itself with walls',
  'ev.build.dock': '{name} builds a fishing dock',
  'ev.build.monument': '{name} erects a stone monument',
  'ev.build.windmill': '{name} raises a windmill',
  'ev.build.granary': '{name} builds a granary',
  'ev.foundJoin': '{name} is founded and joins {nation}',
  'ev.foundNew': 'A new nation is founded at {name}',
  'ev.blessFood': 'Food from the heavens — the granaries of {name} run full',
  'ev.fertile': 'Fair winds and gentle rains; the settlements reap a bumper harvest',
  'ev.wolf': '{name} of {settle} is carried off by wolves',
};

const DICT = { zh: ZH, en: EN };
const LANG_KEY = 'tc-lang';

function detect() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch (e) { /* 隐私模式等场景下 localStorage 不可用 */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'zh-CN';
  return /^en\b/i.test(nav) ? 'en' : 'zh';
}

let cur = detect();
const listeners = [];

/** 翻译：t('ev.flood', { name, n: 3 }) */
export function t(key, params) {
  let s = DICT[cur][key] ?? DICT.zh[key] ?? key;
  if (params) {
    for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  }
  return s;
}

export function getLang() { return cur; }

export function setLang(l) {
  if (l !== 'zh' && l !== 'en') return;
  if (l === cur) return;
  cur = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* 忽略 */ }
  applyStatic();
  for (const cb of listeners) cb(cur);
}

export function toggleLang() { setLang(cur === 'zh' ? 'en' : 'zh'); }

export function onLangChange(cb) { listeners.push(cb); }

/** 应用静态 DOM 文案（index.html 中带 data-i18n* 的元素） */
export function applyStatic(root) {
  if (typeof document === 'undefined') return;   // 非 DOM 环境（测试/SSR）直接跳过
  root = root || document;
  const doc = root.ownerDocument || root;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  doc.documentElement.lang = cur === 'zh' ? 'zh-CN' : 'en';
}

/** 事件文本：新格式 {key, params} 翻译渲染；旧存档 {text} 原样显示 */
export function evText(e) {
  return e.text !== undefined ? e.text : t(e.key, e.params);
}
