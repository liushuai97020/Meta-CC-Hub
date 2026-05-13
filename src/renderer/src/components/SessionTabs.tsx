/**
 * 多会话标签栏组件
 * 类似 IDE 的标签页，支持多会话快速切换、新建和关闭
 */
import React, { useCallback } from 'react';
import { cn } from '../utils/cn';
import { useSessionStore } from '../stores/sessionStore';
import { useAppStore } from '../stores/appStore';
import { Plus, X, MessageSquare, Loader2 } from 'lucide-react';

const SessionTabs: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    deleteSession,
    createSession,
    getActiveSessions,
  } = useSessionStore();
  const { isLoading, currentProjectPath, setCurrentProjectPath } = useAppStore();

  const activeSessions = getActiveSessions();
  // 只显示最近 20 个活跃会话
  const recentSessions = [...activeSessions]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20);

  const handleNewSession = useCallback(async () => {
    if (currentProjectPath) {
      const projectName = currentProjectPath.split(/[/\\]/).pop() || '项目';
      await createSession(`${projectName} - ${new Date().toLocaleTimeString()}`);
    } else {
      await createSession();
    }
  }, [createSession, currentProjectPath]);

  const handleCloseSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
  }, [deleteSession]);

  // 如果只有一个会话且没数据，不显示标签栏（简化首次体验）
  if (recentSessions.length <= 1) return null;

  return (
    <div className="flex items-center border-b border-border bg-background/95 backdrop-blur-sm select-none">
      {/* 会话标签列表 */}
      <div className="flex-1 flex items-center overflow-x-auto gap-0 px-1 scrollbar-none">
        {recentSessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isCurrentLoading = isLoading && isActive;

          return (
            <div
              key={session.id}
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-border/50 transition-colors shrink-0',
                'hover:bg-accent/50',
                isActive
                  ? 'bg-accent/30 text-foreground font-medium border-b-2 border-b-primary'
                  : 'text-muted-foreground border-b-2 border-b-transparent',
              )}
              onClick={() => setActiveSession(session.id)}
              title={session.title}
            >
              {/* 加载指示器 */}
              {isCurrentLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
              ) : (
                <MessageSquare className="h-3 w-3 shrink-0 opacity-60" />
              )}

              {/* 标题 */}
              <span className="truncate max-w-[120px]">{session.title}</span>

              {/* 关闭按钮 */}
              <button
                className={cn(
                  'p-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity',
                  'hover:bg-destructive/20 hover:text-destructive',
                  isActive && 'opacity-60',
                )}
                onClick={(e) => handleCloseSession(e, session.id)}
                title="关闭会话"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* 新建会话按钮 */}
      <button
        className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-l border-border/50 shrink-0"
        onClick={handleNewSession}
        title="新建会话"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">新建</span>
      </button>
    </div>
  );
};

export default SessionTabs;
