/**
 * Tailwind CSS 类名合并工具
 * 基于 clsx 和 tailwind-merge 实现
 */
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并多个类名，自动处理 Tailwind CSS 冲突
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
