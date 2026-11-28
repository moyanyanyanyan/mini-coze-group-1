# 运行管理原作接入记录

本次采用白色主底、紫色点缀，不修改接口、统计口径、权限与数据缺失策略。组件按实际用途选择，不把每个备选重复放入页面。

| 编号 | 原作 | 实际使用位置 / 状态 |
|---|---|---|
| 01 | gagan-gv/brave-chipmunk-25 | OperationsLoader，使用原作 dice3 七秒横移旋转；仅固定紫色并缩放。该源码不是先前描述的上下悬浮方块。 |
| 02 | another-kennyotsu/sharp-fox-30 | 刷新按钮，保留顶面、底面、凸点及按压；缩小尺寸与阴影。 |
| 03 | Mhyar-nsi/selfish-parrot-52 | 搜索备选，本次选 12，不同时叠加。 |
| 04 | Pradeepsaranbishnoi/heavy-dragonfly-92 | 选项卡备选，本次选用户新提供的 15。 |
| 05 | Sujitkavaiya/mighty-pig-81 | 公共 Panel，保留原作白色面、边框过渡和投影；尺寸由内容决定，悬浮边框改紫。 |
| 06 | chase2k25/mighty-dragonfly-75 | 知识库卡片，使用用户完整源码。保留五层圆片、玻璃层、Z 位移与延迟；悬浮或键盘聚焦时整体上移 6px，离开后回落，减少动态效果时保持静止；白色顶面、自动高度、真实数据和路由链接。 |
| 07 | Yaya12085/terrible-otter-19 | Notice，包括异常和文件状态；使用原作图标/标题/消息分区，去除无业务用途的示例操作。 |
| 08 | Cobp/mighty-pig-13 | 知识库空列表与无搜索结果的文件夹，使用公共 FolderCard；紫色适配、无虚假点击。 |
| 09 | themrsami/ordinary-lion-95 | 工具调用脱敏说明提示层；白底紫边，支持键盘和 Escape。 |
| 10 | HetPatel69/nervous-treefrog-70 | Records 的来源/状态筛选菜单；白底、紫色选中标记，保留原作相邻项反馈。 |
| 11 | Kilian-DM/slimy-baboon-11 | 接口失败重试、加载更多主按钮；保留透视反馈，点击红色改紫。 |
| 12 | AtharvaMistry/kind-treefrog-34 | 各列表搜索框；Tailwind 属性转换为局部 CSS，尺寸缩到业务控件。 |
| 14 | uiverse-astronaut/shy-dragonfly-55 | 全模块分页；原作底座与选中页，保留箭头、页码和 Enter 直接跳页。 |
| 15 | uiverse-astronaut/purple-zebra-62 | 时间范围、模块导航与详情选项卡；原作浅底座/白色选中块，青柠焦点改紫。时间范围是筛选按钮组，路由入口保持链接。 |
| 16 | uiverse-astronaut/silent-earwig-81 | 四项指标，保留数字和角部圆面，缩小高度并移除原作示例文案。 |
| 17 | SivarajRathinam/curly-rabbit-26 | 阶段、切片与处理历史 details 的标题底板和箭头；保持现有多项独立展开，不改为互斥 radio。 |
| 18 | Galahhad/kind-cheetah-52 | 工具调用复制，使用原作双图标和提示层；只在 clipboard 成功后显示成功，不使用原作 focus 即成功。 |

源码来源：01、06、08、09、10、14、15、16、17 为用户粘贴；其余为 Uiverse 官方 galaxy 仓库同作者、同作品文件，未声称与网站当前版本完全一致。

原作地址统一为 https://uiverse.io/作者/作品。源码引用和作者保留在组件与样式文件头，许可见 ../../components/uiverse/LICENSE。

复杂表格、执行时间线、对话、图表与预览仍保留业务结构，使用上述控件与面板，不用展示卡片取代它们。浏览器验收覆盖真实接口和隔离临时业务记录；临时验收资料不代表用户原有业务，测试后清理。
