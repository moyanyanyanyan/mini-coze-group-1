// src/features/workflow-editor/components/ValidationDialog.tsx
import React from 'react';
export interface ValidationError {
    code: string;
    message: string;
    nodeId?: string | null;
    edgeId?: string | null;
    field?: string | null;
  }
  
  interface Props {
    result: { valid: boolean; errors: ValidationError[] };
    onClose: () => void;
    onLocate: (nodeId: string) => void;
  }
  
  export function ValidationDialog({ result, onClose, onLocate }: Props) {
    return (
      <div className="wf-modal-mask" onClick={onClose}>
        <div
          className="wf-modal"
          style={{ width: 520 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3>工作流校验</h3>
  
          {result.valid ? (
            <div className="wf-valid-ok">
              <span className="wf-valid-icon">✓</span>
              <span>校验通过，可以运行或发布</span>
            </div>
          ) : (
            <div className="wf-valid-errors">
              <div className="wf-valid-summary">
                发现 {result.errors.length} 个问题
              </div>
              {result.errors.map((err, idx) => (
                <div
                  key={idx}
                  className={`wf-valid-item ${err.nodeId ? 'is-clickable' : ''}`}
                  onClick={() => {
                    if (err.nodeId) {
                      onLocate(err.nodeId);
                      onClose();
                    }
                  }}
                >
                  <div className="wf-valid-item-head">
                    <span className="wf-valid-code">{err.code}</span>
                    {err.nodeId && (
                      <span className="wf-valid-node">{err.nodeId}</span>
                    )}
                  </div>
                  <div className="wf-valid-message">{err.message}</div>
                  {err.field && (
                    <div className="wf-valid-field">字段：{err.field}</div>
                  )}
                </div>
              ))}
            </div>
          )}
  
          <div className="wf-modal-foot">
            <button className="wf-btn wf-btn-primary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }