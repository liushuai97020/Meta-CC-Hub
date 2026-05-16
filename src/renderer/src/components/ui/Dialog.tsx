/**
 * 通用弹窗组件
 * 用于错误提示、确认操作等场景
 */
import React, { useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** 底部按钮 */
  footer?: React.ReactNode;
  maxWidth?: string;
}

const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-md",
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 弹窗主体 */}
      <div
        className={`relative ${maxWidth} w-full mx-4 bg-card border border-border/50 rounded-xl shadow-2xl animate-in zoom-in-95 fade-in`}
      >
        {/* 标题栏 */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {/* 内容区 */}
        <div className="px-5 py-4 text-sm text-muted-foreground">{children}</div>
        {/* 底部按钮 */}
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-border/40">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dialog;
