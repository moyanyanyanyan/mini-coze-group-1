export type MenuItem = {
  label: string;
  path: string;
};

export const menus: MenuItem[] = [
  { label: "对话",   path: "/app/chat" },
  { label: "智能体", path: "/app/agents" },
  { label: "知识库", path: "/app/knowledge" },
  { label: "插件",   path: "/app/plugins" },
  { label: "工作流", path: "/app/workflows" },
];
