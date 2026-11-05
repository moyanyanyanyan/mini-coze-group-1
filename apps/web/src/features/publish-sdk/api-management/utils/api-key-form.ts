export const API_KEY_NAME_MAX_LENGTH = 30;
export const NETWORK_ERROR_MESSAGE = '网络连接异常，请检查网络后重试。';
export const LIST_LOAD_ERROR_MESSAGE = '网络请求超时，请刷新重试。';
export const LIST_UPDATE_FAILED_MESSAGE = '列表更新失败，请刷新列表。';
export const COPY_FAILED_MESSAGE = '复制失败，请手动复制';
export const NOT_FOUND_MESSAGE = '该 API Key 已不存在，请刷新列表。';
export const NAME_TOO_LONG_MESSAGE = '名称不能超过 30 个字符';
export const CREATE_SUCCESS_MESSAGE = 'API Key 创建成功';
export const DELETE_SUCCESS_MESSAGE = 'API Key 已删除';
export const RENAME_SUCCESS_MESSAGE = 'API Key 名称已更新';

export function countCharacters(value: string) {
  return Array.from(value).length;
}

export function getNameError(value: string) {
  return countCharacters(value) > API_KEY_NAME_MAX_LENGTH ? NAME_TOO_LONG_MESSAGE : null;
}

export function canSubmitName(value: string) {
  return value.length > 0;
}
