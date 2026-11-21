# Uiverse 公共组件

从 `@minicoze/ui/components` 导入。运行管理已按需接入。公共组件保留原作配色，运行管理通过局部样式适配白底与紫色点缀；其他模块不变。

| 编号 | 导出 | 来源 |
|---|---|---|
| 01 | DiceLoader | https://uiverse.io/gagan-gv/brave-chipmunk-25 |
| 06 | PurpleGlassCard | https://uiverse.io/chase2k25/mighty-dragonfly-75 |
| 08 | FolderCard | https://uiverse.io/Cobp/mighty-pig-13 |
| 09 | InfoTooltip | https://uiverse.io/themrsami/ordinary-lion-95 |
| 10 | IconMenu | https://uiverse.io/HetPatel69/nervous-treefrog-70 |
| 14 | SourcePagination | https://uiverse.io/uiverse-astronaut/shy-dragonfly-55 |
| 16 | EditorialStatCard | https://uiverse.io/uiverse-astronaut/silent-earwig-81 |
| 17 | SourceAccordion | https://uiverse.io/SivarajRathinam/curly-rabbit-26 |

本批使用用户提供的 HTML/CSS。第 15 款已收到，作为运行管理内部的时间筛选与路由选项卡样式使用，不再额外放入公共库。其他原作与实际接入位置见 ../../modules/operations/SOURCE-UI.md。

## 使用

```tsx
import { PurpleGlassCard, SourcePagination, SourceAccordion } from '@minicoze/ui/components';

<PurpleGlassCard title="产品知识库" description="产品资料与使用说明"
  action={{ label: '查看文件', onClick: openFiles }} />
<SourcePagination page={page} totalPages={pages} onChange={setPage} />
<SourceAccordion value={stage} onChange={setStage}
  items={[{ id: 'parse', title: '解析记录', content: <p>解析完成</p> }]} />
```

- 文案、指标、菜单项、卡片操作从 props 传入，无示例业务数据或空操作。图标操作必须提供可访问名称。
- PurpleGlassCard 保留 300×320 原始比例及圆片层叠，适用于短文案入口卡。原作社交图标由调用方通过 actions 提供，logo 可替换。详细正文不应塞入固定尺寸卡片。
- DiceLoader 保留原作 7 秒变色与左右移动，**不是纯紫色上下跳动**。容器需为左右各 50px 位移留空间。
- SourcePagination 的跳页输入以所属分页名称提供可访问标签。SourcePagination 保留第 14 款底座/选中/边缘样式，上一页、下一页按既有要求使用箭头；页码受控，输入有效页码按 Enter 跳转。非法页码不会触发回调。
- SourceAccordion 保留单选展开，一组只展开一项；使用唯一实例 ID 和原生 radio 键盘操作，替换原作嵌套 label。
- InfoTooltip 支持悬浮、键盘聚焦和 Escape 关闭。内容应为说明文本，不放交互操作。
- FolderCard 无 onClick 时为展示容器，不生成无效按钮；用于知识库空态。
- FolderCard、InfoTooltip 的 Tailwind 工具类转成局部 CSS，无新增依赖或运行时 CDN。InfoTooltip.css 由 Tailwind 3.4.17 编译后加作用域；仅将 group:hover 改为组件的 data-open 状态以支持键盘。
- 所有类名/动画隔离在 uv-* 范围，并支持减少动态效果；未覆盖原有 .card、.content、button 等全局样式。

## 来源与适配

sources/06-card.html 与 sources/06-card.css 保存用户附件原作；sources/10-menu.html 保存菜单附件；sources/09-tooltip.html 保存用户粘贴一致的工具类结构。其余来源见文件头与本表。

只做 React 属性、样式隔离、动态数据/回调及键盘/禁用/减少动画适配。原作加载变色、卡片按下金色、文件夹黄色与指标卡橙色均保留，运行管理内以局部样式改为白色和紫色。
