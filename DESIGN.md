---
name: Tiny Civilization
description: 森林绿体素面板、麦穗色动作与硬边世界控件
colors:
  ground: "#16271f"
  panel: "#20362b"
  panel-2: "#2e4738"
  panel-3: "#405d48"
  edge: "#102119"
  ink: "#f4eedc"
  dim: "#bfceb5"
  accent: "#e7bf76"
  on-accent: "#201906"
  good: "#a9ce92"
  bad: "#ff8a7a"
typography:
  body:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "13px"
rounded:
  square: "0px"
spacing:
  panel-block: "12px"
  panel-inline: "14px"
components:
  time-active:
    backgroundColor: "{colors.accent}"
    padding: "5px 10px"
    rounded: "0px"
  world-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    padding: "12px 14px"
    rounded: "0px"
---

# Design System: Tiny Civilization

## Overview

森林绿与麦穗色延续体素草地和木屋；直角硬边面板围绕世界展开，次要工具收进披露区，让模拟世界保有空间。

记录依据：`src/style.css` 与 2026-11-06 已实现的界面调整；这里只描述当前视觉与响应式行为。

## Colors

深浅森林绿区分底层、面板与悬停；暖浅色为正文，麦穗色给当前动作与关键数值。语义绿和珊瑚红用于状态。

## Typography

系统中文无衬线字族，正文 13px，世界名约 16px / 700；紧凑元数据为 11px。统计与时间控制使用 tabular-nums。

## Layout

世界铺满视口，信息在左上，工具面板位于其下，时间条居底且可换行；工具与聚落导航通过原生披露区展开，性能面板由 F3 开启。≤900px 调整新闻与小地图位置。≤600px 世界信息与时间条宽度为视口减 20px，普通工具与时间按钮至少 40px；小地图收起，完整地图仍从 Map 进入。详情面板最大 45dvh，存档操作行可换行；编年史、帮助和存档弹层受视口宽高约束。

## Elevation & Depth

面板使用 2px 深绿边与 0 10px 32px rgba(0, 0, 0, 0.55) 浮层阴影，强调悬浮在体素世界上的关系。

## Shapes

面板、按钮与导航保持直角（0px），与方块世界的轮廓一致。

## Components

时间按钮以麦穗底标记当前速度，深绿字保证识别；工具和聚落行是实色按钮，悬停抬一档绿。键盘焦点为 2px 麦穗外圈；减少动态效果设置停止相关位移与过渡。

## Do's and Don'ts

- Do 保持方形体素控件与可换行的底部控制。
- Don't 用纯灰面板或霓虹光效覆盖森林配色。
