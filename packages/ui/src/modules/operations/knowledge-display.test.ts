import { describe, expect, it } from "vitest";
import {
  groupShares,
  slicingState,
  taskState,
  uploadFailed,
  originalText,
} from "./knowledge-display";
import type { OperationTask, OperationDocument } from "./model";
const task: OperationTask = {
  id: "t",
  documentId: "d",
  startedAt: 0,
  attempt: 1,
  status: "failed",
  uploadMs: 0,
  processingMs: 0,
  stages: [],
};
describe("知识库展示的统计与失败边界", () => {
  it("合并小分组时保持总量，不产生无效占比", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `${i}`,
      name: `${i}`,
      value: i + 1,
    }));
    expect(groupShares(rows)).toHaveLength(6);
    expect(groupShares(rows).reduce((sum, row) => sum + row.value, 0)).toBe(78);
    expect(groupShares([{ id: "0", name: "0", value: 0 }])).toEqual([]);
  });
  it("上传失败与切片失败不混淆，未上报失败阶段不推断切片成功", () => {
    expect(
      uploadFailed({
        ...task,
        stages: [
          {
            name: "文件接收",
            status: "failed",
            durationMs: 1,
            description: "",
          },
        ],
      }),
    ).toBe(true);
    expect(
      uploadFailed({
        ...task,
        stages: [
          { name: "切片", status: "failed", durationMs: 1, description: "" },
        ],
      }),
    ).toBe(false);
    const observed = {
      id: "d",
      knowledgeBaseId: "kb",
      title: "test.txt",
      sourceType: "TEXT",
      originalFileName: null,
      status: "FAILED",
      stage: "FAILED",
      chunkCount: 2,
      error: null,
      createdAt: "",
      updatedAt: "",
    } as const;
    expect(slicingState({ ...task, observed })).toBe("未采集");
    expect(taskState({ ...task, observed })).toBe("处理失败 · 阶段未知");
    expect(
      slicingState({ ...task, observed: { ...observed, stage: "EMBEDDING" } }),
    ).toBe("成功");
  });
  it("文本预览去除切片重叠，不将模拟文本当作真实原文", () => {
    const document: OperationDocument = {
      id: "d",
      baseId: "b",
      name: "test.txt",
      sourceBytes: 0,
      chunks: [
        { id: "1", position: 1, start: 0, end: 5, content: "abcde" },
        { id: "2", position: 2, start: 3, end: 8, content: "defgh" },
      ],
    };
    expect(originalText(document)).toBe("abcdefgh");
  });
});
