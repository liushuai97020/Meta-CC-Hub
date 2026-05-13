/**
 * 可拖拽的 resize 手柄组件
 * 用于左右面板的宽度调整
 * 全局监听 mousemove/mouseup，确保拖拽流畅
 */
import React, { useCallback, useRef, useEffect, useState } from 'react';
import { cn } from '../utils/cn';

interface ResizeHandleProps {
  /** 方向：vertical 为垂直拖拽（调整左右宽度） */
  direction?: 'vertical' | 'horizontal';
  /** 拖拽回调，传入鼠标移动的 deltaX/deltaY */
  onResize: (delta: number) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义 className */
  className?: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction = 'vertical',
  onResize,
  disabled = false,
  className,
}) => {
  const [dragging, setDragging] = useState(false);
  const isDragging = useRef(false);
  const lastPos = useRef(0);
  const onResizeRef = useRef(onResize);

  // 保持 onResize 引用最新
  onResizeRef.current = onResize;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      isDragging.current = true;
      setDragging(true);
      lastPos.current = direction === 'vertical' ? e.clientX : e.clientY;

      document.body.style.cursor =
        direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [disabled, direction],
  );

  // 全局事件绑定（始终绑定，通过 isDragging 判断是否生效）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const currentPos = direction === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPos - lastPos.current;
      lastPos.current = currentPos;
      onResizeRef.current(delta);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction]);

  return (
    <div
      className={cn(
        'group relative z-10 flex-shrink-0',
        direction === 'vertical'
          ? 'w-[5px] cursor-col-resize'
          : 'h-[5px] cursor-row-resize',
        disabled && 'cursor-default',
        dragging && (direction === 'vertical' ? 'w-[5px]' : 'h-[5px]'),
        className,
      )}
      onMouseDown={handleMouseDown}
    >
      {/* 可视的拖拽条 - 居中放置 */}
      <div
        className={cn(
          'absolute transition-colors duration-150 pointer-events-none',
          direction === 'vertical'
            ? 'left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3px] rounded-full'
            : 'top-1/2 -translate-y-1/2 left-0 right-0 h-[3px] rounded-full',
          dragging
            ? 'bg-primary/70'
            : 'bg-border/0 group-hover:bg-primary/50',
        )}
      />
    </div>
  );
};

export default ResizeHandle;
