import {
  latestTask,
  type OperationDocument,
  type OperationTask,
  type OperationsData,
} from "./model";

export function fileType(document: OperationDocument) {
  const name = document.observed?.originalFileName || document.name;
  const extension = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension ?? ""))
    return "图片";
  if (!name.includes(".") && document.observed?.sourceType === "TEXT")
    return "TXT";
  return (
    (
      {
        pdf: "PDF",
        txt: "TXT",
        md: "Markdown",
        json: "JSON",
        doc: "Word",
        docx: "Word",
        mp3: "音频",
        wav: "音频",
      } as Record<string, string>
    )[extension ?? ""] ?? "其他"
  );
}

export const stageNames: Record<string, string> = {
  RECEIVING: "接收文件",
  UPLOADING: "上传保存",
  VALIDATING: "文件校验",
  EXTRACTING: "解析／识别",
  CHUNKING: "切片",
  EMBEDDING: "向量化",
  PERSISTING: "入库",
  COMPLETED: "处理完成",
  FAILED: "处理阶段未提供",
};

export function failedStage(task: OperationTask) {
  if (task.observed)
    return stageNames[task.observed.stage] ?? task.observed.stage;
  return task.stages.find((stage) => stage.status === "failed")?.name ?? "处理";
}

export function uploadFailed(task?: OperationTask) {
  return task?.status === "failed" && /上传|接收/.test(failedStage(task));
}

export function slicingState(task?: OperationTask) {
  if (!task) return "未采集";
  if (task.observed) {
    const stage = task.observed.stage;
    if (
      task.status === "ready" ||
      ["EMBEDDING", "PERSISTING", "COMPLETED"].includes(stage)
    )
      return "成功";
    if (stage === "CHUNKING")
      return task.status === "failed" ? "失败" : "处理中";
    if (stage === "FAILED") return "未采集";
    return "未开始";
  }
  const stage = task.stages.find((s) => s.name === "切片");
  return stage
    ? {
        success: "成功",
        failed: "失败",
        running: "处理中",
        pending: "未开始",
        interrupted: "中断",
      }[stage.status]
    : "未采集";
}

export function taskState(task?: OperationTask) {
  if (!task) return "状态未采集";
  if (task.status === "ready") return "处理完成";
  if (task.status === "failed")
    return `${failedStage(task)}失败`.replace(
      "处理阶段未提供失败",
      "处理失败 · 阶段未知",
    );
  const stage = task.observed
    ? (stageNames[task.observed.stage] ?? task.observed.stage)
    : task.stages.find((s) => s.status === "running")?.name;
  return `${stage ?? "处理"}中`;
}

// 容量接口尚未提供：模拟值只用于 UI，占比和总数始终使用同一组值。
export function displaySize(document: OperationDocument) {
  return document.sourceBytes;
}

export function baseFiles(data: OperationsData, id: string) {
  return data.documents
    .filter((d) => d.baseId === id)
    .map((document) => ({ document, task: latestTask(data, document.id) }));
}

export function originalText(document: OperationDocument) {
  if (document.observed)
    return "模拟解析文本 · 非当前文件内容\n\n这里展示文件解析／OCR 后的文本样式。原文件与完整解析文本接口尚未接入。";
  // 模拟切片存在重叠，按原始字符位置还原，避免重复拼接。
  let text = "";
  for (const chunk of [...document.chunks].sort((a, b) => a.start - b.start)) {
    if (chunk.start > text.length) break;
    text += chunk.content.slice(Math.max(0, text.length - chunk.start));
  }
  return text || "模拟文件预览\n\n这是一份用于演示原文件预览的资料。";
}

export function groupShares(
  items: { id: string; name: string; value: number }[],
) {
  const sorted = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value);
  return sorted.length <= 6
    ? sorted
    : [
        ...sorted.slice(0, 5),
        {
          id: "__other",
          name: `其他 ${sorted.length - 5} 项`,
          value: sorted.slice(5).reduce((sum, item) => sum + item.value, 0),
        },
      ];
}
